/**
 * Where does the time go?
 *
 *   node scripts/bench-pipeline.mjs <email> <password> <audio> [label]
 *
 * Runs one recording through the pipeline and times every stage boundary from
 * the row's own status changes, as the browser sees them over Realtime. Prints
 * a breakdown, so an optimisation can be judged on a number rather than a
 * feeling.
 *
 * What each window contains:
 *   upload         browser → storage (local bandwidth; not the pipeline's fault)
 *   start          start-processing: sign URL + POST to Gladia
 *   transcribing   Gladia: download, queue, transcribe, callback; plus the
 *                  webhook's GET and two inserts (well under a second)
 *   analyzing      analyze-meeting: read transcript, Gemini, write results
 */
import { readFileSync, statSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password, audioPath, label = ""] = process.argv.slice(2);
if (!email || !password || !audioPath) {
  console.error("usage: node scripts/bench-pipeline.mjs <email> <password> <audio> [label]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../../frontend/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) { console.error(authError.message); process.exit(1); }
const userId = auth.user.id;

const bytes = readFileSync(audioPath);
const ext = audioPath.split(".").pop().toLowerCase();
const mime = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg" }[ext] ?? "application/octet-stream";
const sizeMB = (statSync(audioPath).size / 1048576).toFixed(1);

const t = { begin: Date.now() };
const mark = (k) => { t[k] = Date.now(); };
const sec = (a, b) => ((t[b] - t[a]) / 1000).toFixed(1);

const { data: created } = await supabase.from("meetings").insert({
  owner_id: userId, title: `bench ${label}`.trim(), started_at: new Date().toISOString(),
  duration_ms: 0, status: "uploaded", source_file_name: `bench.${ext}`, source_file_size: bytes.length,
  uploaded_at: new Date().toISOString(), stage_started_at: new Date().toISOString(),
}).select().single();
const meetingId = created.id;
const path = `${userId}/${meetingId}/bench.${ext}`;

mark("uploadStart");
const { error: upErr } = await supabase.storage.from("recordings").upload(path, bytes, { contentType: mime, upsert: true });
if (upErr) { console.error("upload:", upErr.message); process.exit(1); }
await supabase.from("meetings").update({ audio_path: path }).eq("id", meetingId);
mark("uploadDone");

let resolveDone;
const done = new Promise((r) => { resolveDone = r; });
const seen = [];
const channel = supabase.channel(`bench:${meetingId}`)
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meetingId}` }, ({ new: row }) => {
    if (seen[seen.length - 1] === row.status) return;
    seen.push(row.status);
    mark(row.status);
    if (row.status === "ready" || row.status === "failed") resolveDone(row);
  })
  .subscribe();
await new Promise((r) => setTimeout(r, 800));

mark("startCall");
const { data: fn, error: fnErr } = await supabase.functions.invoke("start-processing", { body: { meetingId } });
mark("startReturned");
if (fnErr || fn?.status === "failed") { console.error("start-processing:", fnErr?.message ?? fn?.reason); process.exit(1); }

const row = await Promise.race([done, new Promise((r) => setTimeout(() => r(null), 20 * 60_000))]);
await supabase.removeChannel(channel);

const { data: full } = await supabase.from("meetings")
  .select("duration_ms, transcript_lines(count), meeting_speakers(count), quotes(count), action_items(count)")
  .eq("id", meetingId).single();
const audioSec = full?.duration_ms ? full.duration_ms / 1000 : 0;

console.log(`\n== ${label || audioPath.split(/[\\/]/).pop()} ==`);
console.log(`file            ${sizeMB} MB ${ext}   audio ${Math.floor(audioSec / 60)}:${String(Math.round(audioSec % 60)).padStart(2, "0")} (${Math.round(audioSec)}s)`);
console.log(`upload          ${sec("uploadStart", "uploadDone")}s   (browser → storage)`);
console.log(`start           ${sec("startCall", "startReturned")}s   (sign URL + Gladia POST)`);
if (t.transcribing && t.analyzing) console.log(`transcribing    ${sec("transcribing", "analyzing")}s   (Gladia end to end + webhook)  = ${(( t.analyzing - t.transcribing) / 1000 / audioSec).toFixed(2)}× audio length`);
if (t.analyzing && t.ready)        console.log(`analyzing       ${sec("analyzing", "ready")}s   (Gemini + writes)`);
if (t.ready)                       console.log(`TOTAL           ${sec("startCall", "ready")}s   from start-processing to ready  = ${((t.ready - t.startCall) / 1000 / audioSec).toFixed(2)}× audio length`);
if (row?.status === "failed")      console.log(`FAILED at ${row.failed_stage}: ${row.failure_reason}`);
console.log(`result          ${full?.transcript_lines?.[0]?.count ?? "?"} lines, ${full?.meeting_speakers?.[0]?.count ?? "?"} speakers, ${full?.action_items?.[0]?.count ?? "?"} actions, ${full?.quotes?.[0]?.count ?? "?"} quotes`);

// What the pipeline wrote about its own timing, now that it records it.
const { data: job } = await supabase.from("processing_jobs")
  .select("audio_seconds, transcription_seconds, transcribing_started_at, transcribing_finished_at, analysis_model, analysis_thinking, analysis_started_at, analysis_finished_at, analysis_total_tokens, analysis_thinking_tokens")
  .eq("meeting_id", meetingId).maybeSingle();
if (job) {
  const w = (a, b) => a && b ? ((Date.parse(b) - Date.parse(a)) / 1000).toFixed(1) + "s" : "?";
  console.log(`
job row (instrumented)`);
  console.log(`  gladia   audio ${job.audio_seconds}s, transcription_time ${job.transcription_seconds}s, wall ${w(job.transcribing_started_at, job.transcribing_finished_at)}`);
  console.log(`  gemini   ${job.analysis_model} thinking=${job.analysis_thinking}, wall ${w(job.analysis_started_at, job.analysis_finished_at)}, tokens ${job.analysis_total_tokens} (thinking ${job.analysis_thinking_tokens})`);
}

// The analysis itself, for judging quality against another run.
if (process.argv.includes("--dump")) {
  const { data: a } = await supabase.from("meetings")
    .select("gist, summary, tags, topics(title, details), decisions(text), action_items(item, speaker_slot), quotes(quote, speaker_slot, start_ms)")
    .eq("id", meetingId).single();
  console.log(`
ANALYSIS`);
  console.log(`  gist:      ${a.gist}`);
  console.log(`  summary:   ${a.summary}`);
  console.log(`  tags:      ${a.tags.join(", ")}`);
  for (const t of a.topics) console.log(`  topic:     ${t.title} — ${t.details}`);
  for (const d of a.decisions) console.log(`  decision:  ${d.text}`);
  for (const i of a.action_items) console.log(`  action:    [${i.speaker_slot}] ${i.item}`);
  for (const q of a.quotes) console.log(`  quote:     [${q.speaker_slot} @${q.start_ms}ms] ${q.quote}`);
}

await supabase.from("meetings").delete().eq("id", meetingId);
await supabase.storage.from("recordings").remove([path]);
process.exit(0);
