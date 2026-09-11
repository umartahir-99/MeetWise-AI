/**
 * transcription-webhook
 *
 * Called by Gladia when a transcript is ready. Gladia has no login token, so
 * this door is public and has to defend itself — three ways, all required:
 *
 *   1. the `key` query parameter must match WEBHOOK_SECRET
 *   2. the transcription id must match a job we created in `processing_jobs`
 *   3. the meeting id comes from that job row, never from the request body
 *
 * The incoming call is a doorbell, not the data. The result is fetched from
 * Gladia with our own key, because a payload we did not fetch ourselves is a
 * payload anyone could have sent.
 *
 * It answers fast. Analysis is handed off rather than done here, so Gladia does
 * not time out waiting for Gemini and retry — which would analyse the same
 * meeting three times.
 */
import {
  adminClient,
  env,
  json,
  markFailed,
  setStage,
  slotFor,
  triggerAnalysis,
} from "../_shared/common.ts";

interface Utterance {
  text: string;
  /** Seconds, as a float. Multiply by 1000 or every citation is off by 1000x. */
  start: number;
  end: number;
  speaker?: number;
}

interface GladiaResult {
  status: "queued" | "processing" | "done" | "error";
  error_code?: number;
  result?: {
    metadata?: { audio_duration?: number; transcription_time?: number };
    transcription?: { utterances?: Utterance[]; full_transcript?: string };
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // 1. The shared secret. A wrong one is a 401 — nothing else is learned.
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key !== env("WEBHOOK_SECRET")) return json(401, { error: "Unauthorized" });

  let body: { id?: string; event?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  if (!body.id) return json(400, { error: "id is required" });

  const admin = adminClient();

  // 2. A job we issued. An unknown id is answered 200 so Gladia does not retry
  //    it, and dropped without comment — it is not ours.
  const { data: job } = await admin
    .from("processing_jobs")
    .select("id, meeting_id, owner_id, stage")
    .eq("provider_job_id", body.id)
    .maybeSingle();

  if (!job) {
    console.warn("webhook for unknown transcription id", body.id);
    return json(200, { ignored: true });
  }

  // 3. The meeting, from the job. Idempotent: Gladia may call twice, and the
  //    second call must not write the transcript twice.
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, status")
    .eq("id", job.meeting_id)
    .maybeSingle();

  if (!meeting) return json(200, { ignored: true });
  if (meeting.status !== "transcribing") {
    return json(200, { ignored: true, status: meeting.status });
  }

  try {
    if (body.event === "transcription.error") {
      throw new Error("The transcription service reported an error for this recording.");
    }

    // Fetch the result ourselves, with our own key.
    const response = await fetch(`https://api.gladia.io/v2/pre-recorded/${body.id}`, {
      headers: { "x-gladia-key": env("GLADIA_API_KEY") },
    });
    if (!response.ok) throw new Error(`Could not fetch the transcript (${response.status})`);

    const result = (await response.json()) as GladiaResult;
    if (result.status === "error") {
      throw new Error(`The transcription service failed (code ${result.error_code ?? "unknown"}).`);
    }
    if (result.status !== "done") {
      // Called early. Gladia will call again when it is actually done.
      return json(200, { pending: true });
    }

    const utterances = result.result?.transcription?.utterances ?? [];
    if (!utterances.length) {
      throw new Error(
        "No speech was detected. The file may be silent, or its audio track may be empty."
      );
    }

    // Gladia's speaker ids are per-file integers with no cross-file meaning.
    // They become slots in order of first appearance, so speaker-1 is whoever
    // spoke first. The voice print is deterministic per meeting slot — a real
    // cross-meeting fingerprint is milestone M6's problem (TRD 10.1).
    const slotByGladiaSpeaker = new Map<number, string>();
    const speakerRows: Array<{
      meeting_id: string;
      owner_id: string;
      slot_id: string;
      label: string;
      voice_print: string;
      position: number;
    }> = [];

    const slotOf = (speaker: number | undefined): string => {
      const id = speaker ?? 0;
      let slot = slotByGladiaSpeaker.get(id);
      if (!slot) {
        const position = slotByGladiaSpeaker.size;
        const { slotId, label } = slotFor(position);
        slot = slotId;
        slotByGladiaSpeaker.set(id, slot);
        speakerRows.push({
          meeting_id: meeting.id,
          owner_id: job.owner_id,
          slot_id: slotId,
          label,
          voice_print: `${meeting.id}:${position}`,
          position,
        });
      }
      return slot;
    };

    const lineRows = utterances
      .filter((u) => u.text?.trim())
      .map((u) => ({
        meeting_id: meeting.id,
        owner_id: job.owner_id,
        speaker_slot: slotOf(u.speaker),
        text: u.text.trim(),
        start_ms: Math.round(u.start * 1000),
        end_ms: Math.round(u.end * 1000),
      }));

    const { error: speakersError } = await admin.from("meeting_speakers").insert(speakerRows);
    if (speakersError) throw new Error(`Could not save the speakers: ${speakersError.message}`);

    const { error: linesError } = await admin.from("transcript_lines").insert(lineRows);
    if (linesError) throw new Error(`Could not save the transcript: ${linesError.message}`);

    // The recording's real length, now that something has actually decoded it.
    const audioSeconds = result.result?.metadata?.audio_duration;
    if (audioSeconds) {
      await admin
        .from("meetings")
        .update({ duration_ms: Math.round(audioSeconds * 1000) })
        .eq("id", meeting.id);
    }

    // Gladia's own account of the time: how long the audio was, and how long
    // it spent transcribing - which excludes its queue, so the gap between this
    // and the wall-clock window is the queue.
    await admin
      .from("processing_jobs")
      .update({
        stage: "analyzing",
        transcribing_finished_at: new Date().toISOString(),
        audio_seconds: audioSeconds ?? null,
        transcription_seconds: result.result?.metadata?.transcription_time ?? null,
      })
      .eq("id", job.id);
    await setStage(admin, meeting.id, "analyzing");
    triggerAnalysis(meeting.id);

    return json(200, { ok: true, lines: lineRows.length, speakers: speakerRows.length });
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : "Transcription failed.";
    console.error("transcription-webhook", meeting.id, reason);
    await markFailed(admin, meeting.id, "transcribing", reason);
    await admin.from("processing_jobs").update({ last_error: reason }).eq("id", job.id);
    return json(200, { ok: false, reason });
  }
});
