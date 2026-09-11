/**
 * analyze-meeting
 *
 * Reads a transcript back out and asks Gemini for the analytical half of a
 * `Meeting`: gist, summary, topics, decisions, action items, quotes, tags.
 *
 * Internal. Triggered by the transcription webhook or by a retry, never by the
 * browser — the caller must present the service-role key. The output is shaped
 * by a `responseSchema`, not requested in the prompt: the schema constrains,
 * the prompt merely asks.
 *
 * Everything that comes back is checked before it is written. A speaker slot
 * the meeting does not have is dropped; a quote timestamp that lands inside no
 * transcript line is snapped to the nearest one or dropped. A quote with an
 * invented timestamp is a citation that fails silently when clicked, and the
 * whole product rests on citations being playable.
 */
import { adminClient, env, json, markFailed } from "../_shared/common.ts";

/**
 * The settings screen stores product names; Gemini wants vendor ids, and the
 * vendor renames things. This is the one place the two meet, so a rename is a
 * one-line change and no user's saved setting goes stale.
 */
const MODEL_FOR: Record<string, string> = {
  "gemini-3-flash": "gemini-3.5-flash",
  "gemini-3-1-flash-lite": "gemini-3.1-flash-lite",
  "gemini-2-5-pro": "gemini-2.5-pro",
};
const DEFAULT_MODEL = "gemini-3.5-flash";

/** Beyond this the transcript is truncated with a note. Flash has room for far more; this is a cost guard. */
const MAX_TRANSCRIPT_CHARS = 160_000;

/** A quote's timestamp may miss a line by this much and still be snapped to it. */
const SNAP_MS = 5_000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    gist: { type: "string", description: "One sentence: what this meeting was about and what came of it." },
    summary: { type: "string", description: "One editorial paragraph, 3-6 sentences, past tense." },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          details: { type: "string", description: "2-3 sentences on what was discussed and concluded." },
        },
        required: ["title", "details"],
      },
    },
    decisions: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          speakerSlot: { type: "string", description: "The slot of whoever took it on, e.g. speaker-2." },
        },
        required: ["item", "speakerSlot"],
      },
    },
    quotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Verbatim or near-verbatim from the transcript." },
          speakerSlot: { type: "string" },
          startMs: { type: "integer", description: "The startMs of the transcript line the quote comes from." },
        },
        required: ["quote", "speakerSlot", "startMs"],
      },
    },
    tags: { type: "array", items: { type: "string" }, description: "2-5 short lowercase topic tags." },
  },
  required: ["gist", "summary", "topics", "decisions", "actionItems", "quotes", "tags"],
};

interface Analysis {
  gist: string;
  summary: string;
  topics: Array<{ title: string; details: string }>;
  decisions: string[];
  actionItems: Array<{ item: string; speakerSlot: string }>;
  quotes: Array<{ quote: string; speakerSlot: string; startMs: number }>;
  tags: string[];
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // Internal only. The webhook and start-processing present the service-role
  // key; nothing that reaches this function through a browser can.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer !== env("SUPABASE_SERVICE_ROLE_KEY")) return json(401, { error: "Unauthorized" });

  let meetingId: string | undefined;
  try {
    ({ meetingId } = await req.json());
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  if (!meetingId) return json(400, { error: "meetingId is required" });

  const admin = adminClient();

  const { data: meeting } = await admin
    .from("meetings")
    .select("id, owner_id, title, status, audio_path")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) return json(404, { error: "No such meeting" });
  if (meeting.status !== "analyzing") return json(200, { ignored: true, status: meeting.status });

  try {
    const [{ data: lines }, { data: speakers }, { data: settings }] = await Promise.all([
      admin
        .from("transcript_lines")
        .select("speaker_slot, text, start_ms, end_ms")
        .eq("meeting_id", meeting.id)
        .order("start_ms"),
      admin.from("meeting_speakers").select("slot_id").eq("meeting_id", meeting.id),
      admin
        .from("user_settings")
        .select("analysis_model, discard_audio_after_processing")
        .eq("user_id", meeting.owner_id)
        .maybeSingle(),
    ]);

    if (!lines?.length) throw new Error("There is no transcript to analyse.");
    const validSlots = new Set((speakers ?? []).map((s) => s.slot_id));

    // Compact text, not JSON: every token of structure is a token not spent on
    // the meeting. The ms offsets are what the model must cite for quotes.
    let transcript = lines
      .map((l) => `[${l.start_ms}ms ${clock(l.start_ms)}] ${l.speaker_slot}: ${l.text}`)
      .join("\n");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]";
    }

    const prompt = [
      `You are reading the transcript of a meeting titled "${meeting.title}".`,
      `Speakers are anonymous slots (${[...validSlots].join(", ")}); never invent names for them.`,
      "Each line is prefixed with its start time in milliseconds. When you cite a quote, its startMs",
      "must be the exact millisecond value from the line it comes from.",
      "Pull out: a one-sentence gist; a one-paragraph summary; the topics discussed; the decisions",
      "actually made (not proposals); action items with the slot of whoever took each on; 2-5",
      "memorable verbatim quotes with their slot and startMs; and 2-5 short lowercase tags.",
      "Be concrete and faithful to what was said. Leave a list empty rather than pad it.",
      "",
      "TRANSCRIPT",
      transcript,
    ].join("\n");

    const model = MODEL_FOR[settings?.analysis_model ?? ""] ?? DEFAULT_MODEL;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`The analysis model refused (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = await response.json();
    const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("The analysis model returned nothing usable.");

    const usage = payload?.usageMetadata;
    if (usage) console.log("gemini tokens", meeting.id, model, usage.totalTokenCount);

    let analysis: Analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      throw new Error("The analysis model returned something that was not JSON.");
    }

    // --- validate against the transcript the model was shown ---------------
    const actionItems = (analysis.actionItems ?? []).filter(
      (a) => a.item?.trim() && validSlots.has(a.speakerSlot)
    );

    const snapped = (ms: number): number | null => {
      const inside = lines.find((l) => ms >= l.start_ms && ms <= l.end_ms);
      if (inside) return inside.start_ms;
      let best: { d: number; ms: number } | null = null;
      for (const l of lines) {
        const d = Math.abs(l.start_ms - ms);
        if (d <= SNAP_MS && (!best || d < best.d)) best = { d, ms: l.start_ms };
      }
      return best ? best.ms : null;
    };

    const quotes = (analysis.quotes ?? [])
      .filter((q) => q.quote?.trim() && validSlots.has(q.speakerSlot))
      .map((q) => ({ ...q, startMs: snapped(Number(q.startMs)) }))
      .filter((q): q is typeof q & { startMs: number } => q.startMs !== null);

    // --- write. Idempotent: a re-run replaces, never appends ----------------
    const owned = (extra: Record<string, unknown>) => ({
      meeting_id: meeting.id,
      owner_id: meeting.owner_id,
      ...extra,
    });

    for (const table of ["topics", "decisions", "action_items", "quotes"]) {
      await admin.from(table).delete().eq("meeting_id", meeting.id);
    }

    const writes = [
      admin.from("topics").insert(
        (analysis.topics ?? [])
          .filter((t) => t.title?.trim())
          .map((t, position) => owned({ title: t.title.trim(), details: t.details ?? "", position }))
      ),
      admin.from("decisions").insert(
        (analysis.decisions ?? [])
          .filter((d) => d?.trim())
          .map((text, position) => owned({ text: text.trim(), position }))
      ),
      admin.from("action_items").insert(
        actionItems.map((a, position) =>
          owned({ item: a.item.trim(), speaker_slot: a.speakerSlot, done: false, position })
        )
      ),
      admin.from("quotes").insert(
        quotes.map((q, position) =>
          owned({ quote: q.quote.trim(), speaker_slot: q.speakerSlot, start_ms: q.startMs, position })
        )
      ),
    ];
    for (const { error } of await Promise.all(writes)) {
      if (error) throw new Error(`Could not save the analysis: ${error.message}`);
    }

    // Retention: keep the transcript, throw the recording away.
    let audioPath = meeting.audio_path;
    if (settings?.discard_audio_after_processing && audioPath) {
      await admin.storage.from("recordings").remove([audioPath]);
      audioPath = null;
    }

    const { error: doneError } = await admin
      .from("meetings")
      .update({
        gist: analysis.gist?.trim() ?? "",
        summary: analysis.summary?.trim() ?? "",
        tags: (analysis.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
        audio_path: audioPath,
        status: "ready",
        stage_started_at: null,
        failed_stage: null,
        failure_reason: null,
      })
      .eq("id", meeting.id);
    if (doneError) throw new Error(`Could not finish the meeting: ${doneError.message}`);

    await admin.from("processing_jobs").update({ stage: "ready" }).eq("meeting_id", meeting.id);

    return json(200, {
      ok: true,
      model,
      topics: analysis.topics?.length ?? 0,
      decisions: analysis.decisions?.length ?? 0,
      actionItems: actionItems.length,
      quotes: quotes.length,
      droppedQuotes: (analysis.quotes?.length ?? 0) - quotes.length,
    });
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : "Analysis failed.";
    console.error("analyze-meeting", meeting.id, reason);
    await markFailed(admin, meeting.id, "analyzing", reason);
    await admin.from("processing_jobs").update({ last_error: reason }).eq("meeting_id", meeting.id);
    return json(200, { ok: false, reason });
  }
});
