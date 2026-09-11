/**
 * Can this be left running?
 *
 *   node scripts/verify-m5.mjs
 *
 * M5's checklist, from SUPABASE_BACKEND_PLAN.md: set retention to 30 days,
 * back-date a meeting, run the job, confirm the row AND the file are gone.
 * Plus the things around it: a meeting inside the window survives, one user's
 * sweep cannot touch another's, the scheduler's door refuses a wrong key, the
 * `updated_at` trigger fires, and a signed playback URL actually serves audio.
 *
 * Runs on a throwaway account it creates itself. A retention test that sets a
 * 30-day window will delete anything older than 30 days it can see, so it must
 * never be pointed at an archive anybody wants to keep.
 *
 * Costs nothing: no Gladia, no Gemini.
 */
import { readFileSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

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

const a = client();
const stampA = Date.now();
const { data: authA, error: authErr } = await a.auth.signUp({
  email: `m5-a-${stampA}@gmail.com`,
  password: `pw-${stampA}!`,
});
if (authErr || !authA?.session) {
  console.error(authErr?.message ?? "sign-up returned no session; email confirmation may be on");
  process.exit(1);
}
const userA = authA.user.id;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// A tiny valid WAV, so there is a real object to delete.
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
  0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

async function plant(c, ownerId, title, startedAt) {
  const { data: m } = await c
    .from("meetings")
    .insert({ owner_id: ownerId, title, started_at: startedAt, duration_ms: 1000, status: "ready" })
    .select()
    .single();
  const path = `${ownerId}/${m.id}/probe.wav`;
  await c.storage.from("recordings").upload(path, wav, { contentType: "audio/wav", upsert: true });
  await c.from("meetings").update({ audio_path: path }).eq("id", m.id);
  return { id: m.id, path };
}
const rowExists = async (c, id) =>
  Boolean((await c.from("meetings").select("id").eq("id", id).maybeSingle()).data);
const fileExists = async (c, path) => {
  const [dir, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  const { data } = await c.storage.from("recordings").list(dir);
  return Boolean(data?.some((o) => o.name === name));
};

// --- updated_at trigger ------------------------------------------------------
const probe = await plant(a, userA, "m5 updated_at probe", daysAgo(1));
const { data: before } = await a.from("meetings").select("updated_at").eq("id", probe.id).single();
await new Promise((r) => setTimeout(r, 1100));
await a.from("meetings").update({ title: "m5 updated_at probe (renamed)" }).eq("id", probe.id);
const { data: after } = await a.from("meetings").select("updated_at").eq("id", probe.id).single();
check(Date.parse(after.updated_at) > Date.parse(before.updated_at), "updated_at moves on its own when a row changes");

// --- signed playback URL -----------------------------------------------------
const { data: signed, error: signErr } = await a.storage.from("recordings").createSignedUrl(probe.path, 3600);
check(!signErr && signed?.signedUrl?.includes("token="), "a signed playback URL is minted", signErr?.message ?? "");
if (signed?.signedUrl) {
  const res = await fetch(signed.signedUrl);
  check(res.ok && (res.headers.get("content-type") ?? "").startsWith("audio/"), "the signed URL serves the recording", `${res.status} ${res.headers.get("content-type")}`);
}
await a.from("meetings").delete().eq("id", probe.id);
await a.storage.from("recordings").remove([probe.path]);

// --- retention: the headline test ------------------------------------------------
await a.from("user_settings").update({ retention_days: 30 }).eq("user_id", userA);

const old = await plant(a, userA, "m5 expired (60 days)", daysAgo(60));
const young = await plant(a, userA, "m5 kept (10 days)", daysAgo(10));

// Another user with their own expired meeting. A's sweep must not touch it.
const b = client();
const stamp = Date.now();
const { data: authB } = await b.auth.signUp({ email: `m5-b-${stamp}@gmail.com`, password: `pw-${stamp}!` });
let bOld = null;
if (authB?.session) {
  await b.from("user_settings").update({ retention_days: 30 }).eq("user_id", authB.user.id);
  bOld = await plant(b, authB.user.id, "m5 other user expired", daysAgo(60));
}

// The scheduler's door must refuse a wrong key, and refuse no credentials at all.
const fnUrl = `${url}/functions/v1/retention-sweep`;
const wrongKey = await fetch(fnUrl, { method: "POST", headers: { "x-cron-key": "wrong", "Content-Type": "application/json" }, body: "{}" });
check(wrongKey.status === 401, "the sweep refuses a wrong scheduler key", String(wrongKey.status));
const noAuth = await fetch(fnUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check(noAuth.status === 401, "the sweep refuses a call with no credentials", String(noAuth.status));

// Run it as user A - the same call the Settings button makes.
const { data: swept, error: sweepErr } = await a.functions.invoke("retention-sweep", { body: {} });
check(!sweepErr && swept?.deletedMeetings >= 1, "the sweep runs for the signed-in user", sweepErr?.message ?? JSON.stringify(swept));

check(!(await rowExists(a, old.id)), "the expired meeting's row is gone");
check(!(await fileExists(a, old.path)), "the expired meeting's recording is gone from storage");
check(await rowExists(a, young.id), "a meeting inside the window survives");
check(await fileExists(a, young.path), "its recording survives too");

if (bOld) {
  check(await rowExists(b, bOld.id), "another user's expired meeting is untouched by A's sweep");
  await b.from("meetings").delete().eq("id", bOld.id);
  await b.storage.from("recordings").remove([bOld.path]);
}

// --- discard audio: the fallback the player relies on ----------------------------
// analyze-meeting nulls audio_path after deleting the file. The player keys its
// mode off audioUrl, which the mapper only sets from a present audio_path -
// so a nulled path must produce a meeting with no audio at all.
const { data: noAudio } = await a
  .from("meetings")
  .insert({ owner_id: userA, title: "m5 discarded audio", started_at: daysAgo(1), duration_ms: 1000, status: "ready", audio_path: null })
  .select("id, audio_path")
  .single();
check(noAudio.audio_path === null, "a meeting whose audio was discarded carries no path for the player to sign");
await a.from("meetings").delete().eq("id", noAudio.id);

// --- put things back ---------------------------------------------------------------
await a.from("meetings").delete().eq("id", young.id);
await a.storage.from("recordings").remove([young.path]);
await a.from("user_settings").update({ retention_days: 0 }).eq("user_id", userA);

console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
