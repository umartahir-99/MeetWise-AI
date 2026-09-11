/**
 * Does an upload actually go somewhere, and does the screen move because the
 * database moved?
 *
 *   node scripts/verify-m3.mjs <email> <password>
 *
 * M3's checklist, from SUPABASE_BACKEND_PLAN.md:
 *   - upload a file and see it in Storage under {user_id}/{meeting_id}/
 *   - the meeting appears in the archive with status `queued`
 *   - change the status by hand — the browser updates on its own
 *   - refresh mid-upload — the meeting is still there, still in the right state
 *   - discard removes both the row and the stored file
 *
 * Every step below is the same call the app makes, in the same order, through
 * the same publishable key. The "browser updates on its own" check is the one
 * that matters: it subscribes over Realtime exactly as `useArchive` does, then
 * changes the row through a different client and waits for the event.
 */
import { readFileSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/verify-m3.mjs <email> <password>");
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
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

const client = () => createClient(url, key, { auth: { persistSession: false } });

const supabase = client();
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

// --- the row goes in first, so a refresh mid-upload finds it ----------------
const { data: created, error: createError } = await supabase
  .from("meetings")
  .insert({
    owner_id: userId,
    title: "M3 upload probe",
    started_at: new Date().toISOString(),
    duration_ms: 12_000,
    status: "uploaded",
    source_file_name: "probe.wav",
    source_file_size: 44,
    uploaded_at: new Date().toISOString(),
    stage_started_at: new Date().toISOString(),
  })
  .select()
  .single();
check(!createError && created, "the meeting row exists before the file moves", createError?.message ?? created?.status);
const meetingId = created.id;

// A fresh client with no memory of the insert: what a refreshed tab would see.
const refreshed = client();
await refreshed.auth.signInWithPassword({ email, password });
const { data: seenAfterRefresh } = await refreshed.from("meetings").select("status").eq("id", meetingId).maybeSingle();
check(seenAfterRefresh?.status === "uploaded", "a refresh mid-upload still finds the job, in the right state", seenAfterRefresh?.status);

// --- the file, straight to storage under the user's own prefix --------------
// 44 bytes of valid WAV header: enough to be a real file without being audio.
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
  0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);
const path = `${userId}/${meetingId}/probe.wav`;

const { error: uploadError } = await supabase.storage.from("recordings").upload(path, wav, {
  contentType: "audio/wav",
  upsert: true,
});
check(!uploadError, "the file uploads to storage", uploadError?.message ?? path);

const { data: listing } = await supabase.storage.from("recordings").list(`${userId}/${meetingId}`);
check(listing?.some((o) => o.name === "probe.wav"), "it sits under {user_id}/{meeting_id}/");

await supabase.from("meetings").update({ audio_path: path }).eq("id", meetingId);

// Another user must not be able to read it. Storage policy, not just RLS.
const stranger = client();
const stamp = Date.now();
const { data: strangerAuth } = await stranger.auth.signUp({ email: `m3-stranger-${stamp}@gmail.com`, password: `pw-${stamp}!` });
if (strangerAuth?.session) {
  const { data: strangerSees, error: strangerErr } = await stranger.storage.from("recordings").download(path);
  check(!strangerSees && strangerErr, "another user cannot download the recording", strangerErr?.message ?? "IT SUCCEEDED");
}

// --- the edge function, with the ownership check it is there for -----------
const { data: fnData, error: fnError } = await supabase.functions.invoke("start-processing", {
  body: { meetingId },
});
check(!fnError && fnData?.status === "queued", "start-processing accepts the owner's request", fnError?.message ?? JSON.stringify(fnData));

const { data: queued } = await supabase.from("meetings").select("status").eq("id", meetingId).maybeSingle();
check(queued?.status === "queued", "the meeting is now `queued`", queued?.status);

if (strangerAuth?.session) {
  const { data: forged, error: forgedErr } = await stranger.functions.invoke("start-processing", { body: { meetingId } });
  // supabase-js surfaces a non-2xx as FunctionsHttpError; either is a refusal.
  check(Boolean(forgedErr) || forged?.error, "start-processing refuses another user's meeting", forgedErr ? "refused" : JSON.stringify(forged));
}

// --- the screen moves because the database moved ---------------------------
// Subscribed exactly as `useArchive` does, then the row is changed through a
// different connection. If the event arrives, the timer is genuinely gone.
const listener = client();
await listener.auth.signInWithPassword({ email, password });

const event = new Promise((resolve) => {
  const timeout = setTimeout(() => resolve(null), 15_000);
  listener
    .channel(`archive:${userId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "meetings", filter: `owner_id=eq.${userId}` },
      ({ new: row }) => {
        console.log(`      [rt] UPDATE id=${String(row.id).slice(0, 8)} status=${row.status}`);
        if (row.id === meetingId && row.status === "transcribing") {
          clearTimeout(timeout);
          resolve(row);
        }
      }
    )
    .subscribe(async (status, err) => {
      console.log(`      [rt] ${status} ${err?.message ?? ""}`);
      if (status === "SUBSCRIBED") {
        // Now that we are listening, change it "by hand".
        const { error } = await supabase
          .from("meetings")
          .update({ status: "transcribing" })
          .eq("id", meetingId);
        console.log(`      [rt] update sent, error: ${error?.message ?? "none"}`);
      }
    });
});

const heard = await event;
check(Boolean(heard), "a status change reaches a subscribed client on its own", heard ? `heard status=${heard.status}` : "nothing arrived in 15s");
await listener.removeAllChannels();

// --- discard: the row and the file ------------------------------------------
await supabase.from("meetings").delete().eq("id", meetingId);
await supabase.storage.from("recordings").remove([path]);

const { data: rowAfter } = await supabase.from("meetings").select("id").eq("id", meetingId).maybeSingle();
check(!rowAfter, "discard removes the row");

const { data: filesAfter } = await supabase.storage.from("recordings").list(`${userId}/${meetingId}`);
check(!filesAfter?.some((o) => o.name === "probe.wav"), "discard removes the stored file");

console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
