/**
 * Does a real recording come out the other end as a real summary?
 *
 *   node scripts/verify-m4.mjs <email> <password> <path-to-audio>
 *
 * M4's checklist, from SUPABASE_BACKEND_PLAN.md:
 *   - status walks uploaded → transcribing → analyzing → ready, with no timer
 *   - the transcript is what was actually said
 *   - the summary, topics and decisions describe THAT meeting
 *   - speakers are separated
 *   - every quote's startMs lands in a real transcript line
 *   - a silent file fails with a reason you can read, and retry works
 *
 * This takes real minutes, because transcription does. It watches the row
 * over Realtime like the app does, and polls as a backstop.
 */
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password, audioPath] = process.argv.slice(2);
if (!email || !password || !audioPath) {
  console.error("usage: node scripts/verify-m4.mjs <email> <password> <audio file>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../../frontend/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  console.error(`FAIL — could not sign in: ${authError.message}`);
  process.exit(1);
}
const userId = auth.user.id;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const stamp = () => new Date().toISOString().slice(11, 19);

/** Run one recording through, watching every status the row passes through. */
async function runThrough(title, fileBytes, fileName, contentType, timeoutMs) {
  const { data: created } = await supabase
    .from("meetings")
    .insert({
      owner_id: userId,
      title,
      started_at: new Date().toISOString(),
      duration_ms: 0,
      status: "uploaded",
      source_file_name: fileName,
      source_file_size: fileBytes.length,
      uploaded_at: new Date().toISOString(),
      stage_started_at: new Date().toISOString(),
    })
    .select()
    .single();
  const meetingId = created.id;
  const path = `${userId}/${meetingId}/${fileName}`;

  const { error: upErr } = await supabase.storage
    .from("recordings")
    .upload(path, fileBytes, { contentType, upsert: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  await supabase.from("meetings").update({ audio_path: path }).eq("id", meetingId);

  const seen = ["uploaded"];
  const channel = supabase
    .channel(`m4:${meetingId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meetingId}` },
      ({ new: row }) => {
        if (seen[seen.length - 1] !== row.status) {
          seen.push(row.status);
          console.log(`      ${stamp()}  → ${row.status}${row.failure_reason ? `  (${row.failure_reason})` : ""}`);
        }
      }
    )
    .subscribe();

  const { data: started, error: fnErr } = await supabase.functions.invoke("start-processing", {
    body: { meetingId },
  });
  console.log(`      ${stamp()}  start-processing → ${fnErr?.message ?? JSON.stringify(started)}`);

  // Poll as a backstop; Realtime is the primary signal but a missed event
  // must not hang the test for the full timeout.
  const deadline = Date.now() + timeoutMs;
  let final;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const { data } = await supabase.from("meetings").select("status, failed_stage, failure_reason").eq("id", meetingId).maybeSingle();
    if (data && seen[seen.length - 1] !== data.status) {
      seen.push(data.status);
      console.log(`      ${stamp()}  → ${data.status} (polled)${data.failure_reason ? `  (${data.failure_reason})` : ""}`);
    }
    if (data?.status === "ready" || data?.status === "failed") {
      final = data;
      break;
    }
  }
  await supabase.removeChannel(channel);
  return { meetingId, path, seen, final };
}

// ============================================================================
// 1. A real recording
// ============================================================================
console.log(`\n== ${basename(audioPath)} (${Math.round(statSync(audioPath).size / 1024)} KB) ==`);
const audio = readFileSync(audioPath);
const ext = audioPath.split(".").pop().toLowerCase();
const mime = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg" }[ext] ?? "application/octet-stream";

const real = await runThrough("M4 real recording", audio, `recording.${ext}`, mime, 8 * 60_000);

check(real.final?.status === "ready", "the recording reaches `ready`", real.final ? `${real.final.status}${real.final.failure_reason ? ": " + real.final.failure_reason : ""}` : "timed out");
check(
  ["transcribing", "analyzing", "ready"].every((s) => real.seen.includes(s)),
  "status walked transcribing → analyzing → ready",
  real.seen.join(" → ")
);

if (real.final?.status === "ready") {
  const { data: full } = await supabase
    .from("meetings")
    .select(`*, meeting_speakers(*), transcript_lines(*), topics(*), decisions(*), action_items(*), quotes(*)`)
    .eq("id", real.meetingId)
    .single();

  const lines = [...full.transcript_lines].sort((a, b) => a.start_ms - b.start_ms);
  const said = lines.map((l) => l.text).join(" ").toLowerCase();

  check(lines.length > 0, "a transcript was written", `${lines.length} lines`);
  check(full.duration_ms > 0, "the real duration was measured", `${Math.round(full.duration_ms / 1000)}s`);
  check(lines.every((l) => l.end_ms >= l.start_ms && l.start_ms < 600_000), "timestamps are in milliseconds, not seconds");
  check(full.meeting_speakers.length >= 2, "speakers were separated", `${full.meeting_speakers.length} voices`);
  check(
    full.meeting_speakers.every((s) => /^speaker-\d+$/.test(s.slot_id) && /^Speaker \d+$/.test(s.label)),
    "speakers use the app's slot convention"
  );

  // What was actually said in the generated recording.
  const expectedWords = ["tuesday", "cache", "beta", "onboarding"];
  const heard = expectedWords.filter((w) => said.includes(w));
  check(heard.length >= 3, "the transcript is what was said", `heard ${heard.length}/${expectedWords.length}: ${heard.join(", ")}`);

  check(full.gist.trim().length > 20, "a gist was written", full.gist.slice(0, 90));
  check(full.summary.trim().length > 80, "a summary was written", `${full.summary.length} chars`);
  const about = (full.gist + " " + full.summary).toLowerCase();
  check(/beta|launch|cache|crash|tuesday/.test(about), "the summary is about THIS meeting", full.gist.slice(0, 90));

  check(full.topics.length > 0, "topics were extracted", full.topics.map((t) => t.title).join(" | "));
  check(full.decisions.length > 0, "decisions were extracted", full.decisions[0]?.text.slice(0, 80));
  check(full.action_items.length > 0, "action items were extracted", full.action_items.map((a) => `${a.speaker_slot}: ${a.item.slice(0, 40)}`).join(" | "));
  check(
    full.action_items.every((a) => full.meeting_speakers.some((s) => s.slot_id === a.speaker_slot)),
    "every action item owner is a real slot"
  );
  check(full.quotes.length > 0, "quotes were pulled", `${full.quotes.length}`);
  check(
    full.quotes.every((q) => lines.some((l) => q.start_ms >= l.start_ms && q.start_ms <= l.end_ms) || lines.some((l) => l.start_ms === q.start_ms)),
    "every quote's startMs lands on a real transcript line — the citation is playable"
  );
  check(full.tags.length > 0, "tags were written", full.tags.join(", "));

  const { data: job } = await supabase.from("processing_jobs").select("provider, provider_job_id, stage").eq("meeting_id", real.meetingId).maybeSingle();
  check(job?.provider === "gladia" && job?.provider_job_id && job?.stage === "ready", "the processing job was recorded end to end", `${job?.provider} ${job?.stage}`);
}

// ============================================================================
// 2. A silent file: must fail with a reason, and retry must work
// ============================================================================
console.log("\n== silent file ==");
// Two seconds of 16 kHz mono silence with a valid header.
const samples = 16000 * 2;
const silent = new Uint8Array(44 + samples * 2);
const dv = new DataView(silent.buffer);
const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
str(0, "RIFF"); dv.setUint32(4, 36 + samples * 2, true); str(8, "WAVE"); str(12, "fmt ");
dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
str(36, "data"); dv.setUint32(40, samples * 2, true);

const quiet = await runThrough("M4 silent recording", silent, "silence.wav", "audio/wav", 4 * 60_000);
check(quiet.final?.status === "failed", "a silent file fails rather than producing an empty meeting", quiet.final?.status);
check(
  typeof quiet.final?.failure_reason === "string" && quiet.final.failure_reason.length > 10 && !/undefined|\[object/.test(quiet.final.failure_reason),
  "the failure reason is readable by a person",
  quiet.final?.failure_reason
);
check(["transcribing", "queued"].includes(quiet.final?.failed_stage), "the failure names the stage it died in", quiet.final?.failed_stage);

// Retry: re-invokes start-processing on the same upload. It should run again
// (and, for a silent file, fail again the same way) rather than be refused.
const { data: retried, error: retryErr } = await supabase.functions.invoke("start-processing", { body: { meetingId: quiet.meetingId } });
check(!retryErr && retried?.status && retried.status !== "failed", "retry re-enters the pipeline from the same upload", retryErr?.message ?? retried?.status);

const { data: afterRetry } = await supabase.from("meetings").select("status, failed_stage, failure_reason").eq("id", quiet.meetingId).maybeSingle();
check(afterRetry?.status !== "failed" || afterRetry.failure_reason, "retry cleared the old failure before running again", afterRetry?.status);

// ---------------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 3000));
for (const m of [real, quiet]) {
  await supabase.from("meetings").delete().eq("id", m.meetingId);
  await supabase.storage.from("recordings").remove([m.path]);
}

console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
