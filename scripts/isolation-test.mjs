/**
 * The security test from SUPABASE_BACKEND_PLAN.md M0.
 *
 * "Create two users. Sign in as user A, insert a meeting. Sign in as user B and
 * select * from meetings. You must get zero rows."
 *
 * Run through the public API with the anon key rather than as postgres, because
 * that is the door the app actually knocks on — a service-role connection
 * bypasses RLS entirely and would pass this test while the app leaked.
 *
 *   node scripts/isolation-test.mjs
 *
 * Reads frontend/.env.local. Prints nothing secret.
 */
import { readFileSync } from "node:fs";
import { createClient } from "../frontend/node_modules/@supabase/supabase-js/dist/module/index.js";

const env = Object.fromEntries(
  readFileSync(new URL("../frontend/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("FAIL — frontend/.env.local is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const stamp = Date.now();
const A = { email: `iso-a-${stamp}@meetwise.test`, password: `pw-a-${stamp}!` };
const B = { email: `iso-b-${stamp}@meetwise.test`, password: `pw-b-${stamp}!` };

const client = () => createClient(url, key, { auth: { persistSession: false } });

async function makeUser(who) {
  const c = client();
  const { data, error } = await c.auth.signUp(who);
  if (error) throw new Error(`sign-up failed: ${error.message}`);
  if (!data.session) {
    throw new Error(
      "sign-up returned no session — email confirmation is ON for this project. " +
        "Turn it off under Authentication -> Providers -> Email for local testing, then re-run."
    );
  }
  return { c, id: data.user.id };
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const a = await makeUser(A);
const b = await makeUser(B);

// The trigger should have made a profile and a settings row for each.
const { data: profA } = await a.c.from("profiles").select("*").eq("id", a.id).maybeSingle();
check(Boolean(profA), "handle_new_user created a profile row");
const { data: setA } = await a.c.from("user_settings").select("*").eq("user_id", a.id).maybeSingle();
check(Boolean(setA), "handle_new_user created a user_settings row");
check(
  setA?.transcription_model === "gladia-solaria-3" && setA?.analysis_model === "gemini-3-flash",
  "settings defaults match DEFAULT_SETTINGS",
  setA ? `${setA.transcription_model} / ${setA.analysis_model}` : "no row"
);

// A inserts a meeting.
const { data: meeting, error: insErr } = await a.c
  .from("meetings")
  .insert({
    owner_id: a.id,
    title: "Isolation probe",
    started_at: new Date().toISOString(),
    status: "ready",
  })
  .select()
  .single();
check(!insErr && Boolean(meeting), "user A can insert their own meeting", insErr?.message ?? "");

// A can read it back.
const { data: aSees } = await a.c.from("meetings").select("*");
check(aSees?.length === 1, "user A sees exactly their own meeting", `saw ${aSees?.length ?? 0}`);

// THE test. B must see nothing.
const { data: bSees, error: bErr } = await b.c.from("meetings").select("*");
check(
  !bErr && Array.isArray(bSees) && bSees.length === 0,
  "user B sees ZERO of user A's meetings",
  bErr ? bErr.message : `saw ${bSees?.length ?? 0}`
);

// B must not be able to forge a row owned by A — that is what `with check` is for.
const { error: forgeErr } = await b.c.from("meetings").insert({
  owner_id: a.id,
  title: "Forged",
  started_at: new Date().toISOString(),
});
check(Boolean(forgeErr), "user B cannot insert a meeting owned by user A", forgeErr?.message ?? "IT SUCCEEDED");

// B must not be able to delete A's meeting.
if (meeting) {
  const { data: gone } = await b.c.from("meetings").delete().eq("id", meeting.id).select();
  check((gone?.length ?? 0) === 0, "user B cannot delete user A's meeting");
  const { data: still } = await a.c.from("meetings").select("id").eq("id", meeting.id);
  check(still?.length === 1, "user A's meeting survived B's delete attempt");
  await a.c.from("meetings").delete().eq("id", meeting.id);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
