/**
 * Does `handle_new_user` seed the display name from sign-up?
 *
 *   node scripts/verify-profile-name.mjs
 *
 * Migration 20260912090000 makes the trigger copy `display_name` out of the
 * sign-up metadata. This proves it by behaviour: one account signs up with a
 * name and must read it back from `profiles`; one signs up without and must
 * still get the placeholder, so accounts made by a script or the dashboard are
 * not left with an empty name.
 *
 * Same throwaway-account pattern as isolation-test.mjs. Reads
 * frontend/.env.local. Prints nothing secret.
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
if (!url || !key) {
  console.error("FAIL — frontend/.env.local needs VITE_SUPABASE_URL and an anon key");
  process.exit(1);
}

const stamp = Date.now();
const NAME = `Verify Name ${stamp}`;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function signUpAndReadProfile(email, options) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email, password: `pw-${stamp}!`, options });
  if (error) throw new Error(`sign-up failed: ${error.message}`);
  if (!data.session) throw new Error("sign-up returned no session — email confirmation is ON");
  const { data: profile, error: readError } = await c
    .from("profiles")
    .select("display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (readError) throw new Error(`profile read failed: ${readError.message}`);
  return profile?.display_name;
}

const named = await signUpAndReadProfile(`name-a-${stamp}@gmail.com`, {
  data: { display_name: NAME },
});
check(named === NAME, "sign-up name lands in profiles.display_name", `${named}`);

const unnamed = await signUpAndReadProfile(`name-b-${stamp}@gmail.com`, undefined);
check(unnamed === "You", "sign-up without a name keeps the placeholder", `${unnamed}`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
