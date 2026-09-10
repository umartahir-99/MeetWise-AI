/**
 * M1's checklist, run for real.
 *
 *   node scripts/verify-m1.mjs
 *
 * From SUPABASE_BACKEND_PLAN.md:
 *   - Sign up creates rows in `profiles` AND `user_settings` automatically
 *   - Change the analysis model, refresh the page — it is still changed
 *   - Rename your account, refresh — still renamed
 *   - Sign out and back in — your settings come back
 *
 * "Refresh the page" is the interesting part, and it is what a second client
 * stands in for here: a fresh client shares no memory with the first, so
 * anything it can still see genuinely came back out of the database rather than
 * out of a variable that survived.
 *
 * The queries below are the same ones `src/api/settings.ts` makes. They are
 * written out rather than imported because that module reaches for
 * `import.meta.env`, which only Vite defines — the UI half of M1 is checked in
 * a browser instead.
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
  console.error("FAIL — frontend/.env.local needs a URL and a key.");
  process.exit(1);
}

const client = () => createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const stamp = Date.now();
const account = { email: `m1-${stamp}@gmail.com`, password: `pw-${stamp}!` };

// --- sign up ---------------------------------------------------------------
const first = client();
const { data: signUp, error: signUpErr } = await first.auth.signUp(account);
if (signUpErr) {
  console.error(`FAIL — sign-up: ${signUpErr.message}`);
  process.exit(1);
}
if (!signUp.session) {
  console.error("FAIL — sign-up returned no session; email confirmation is back on.");
  process.exit(1);
}
const userId = signUp.user.id;
check(true, "signed up", account.email);

// --- the trigger -----------------------------------------------------------
const { data: profile } = await first.from("profiles").select("*").eq("id", userId).maybeSingle();
check(Boolean(profile), "trigger created a profiles row");
check(profile?.display_name === "You", "profile starts as the default name", profile?.display_name);

const { data: settings } = await first
  .from("user_settings")
  .select("*")
  .eq("user_id", userId)
  .maybeSingle();
check(Boolean(settings), "trigger created a user_settings row");

// The column defaults ARE DEFAULT_SETTINGS, so the two cannot drift. Read the
// frontend's copy rather than restating the values here, which would just move
// the drift somewhere this test could not see it.
const settingsSrc = readFileSync(new URL("../../frontend/src/settings.ts", import.meta.url), "utf8");
const declared = (field) => settingsSrc.match(new RegExp(`${field}:\\s*"([^"]+)"`))?.[1];

check(
  settings?.transcription_model === declared("transcriptionModel"),
  "transcription default matches DEFAULT_SETTINGS",
  `${settings?.transcription_model} vs ${declared("transcriptionModel")}`
);
check(
  settings?.analysis_model === declared("analysisModel"),
  "analysis default matches DEFAULT_SETTINGS",
  `${settings?.analysis_model} vs ${declared("analysisModel")}`
);

// --- change a setting, then "refresh" --------------------------------------
const CHOSEN = "gemini-2-5-pro";
const { error: saveErr } = await first
  .from("user_settings")
  .update({ analysis_model: CHOSEN })
  .eq("user_id", userId);
check(!saveErr, "changed the analysis model", saveErr?.message ?? "");

// A patch, not a whole row: the untouched columns must be exactly as they were.
const { data: afterSave } = await first
  .from("user_settings")
  .select("*")
  .eq("user_id", userId)
  .maybeSingle();
check(
  afterSave?.transcription_model === declared("transcriptionModel"),
  "changing one setting left the others alone",
  afterSave?.transcription_model
);

// --- rename the account ----------------------------------------------------
const NAME = "Umar Tahir";
const { error: renameErr } = await first
  .from("profiles")
  .update({ display_name: NAME })
  .eq("id", userId);
check(!renameErr, "renamed the account", renameErr?.message ?? "");

// --- sign out, sign back in ------------------------------------------------
await first.auth.signOut();

const second = client();
const { data: signIn, error: signInErr } = await second.auth.signInWithPassword(account);
check(!signInErr && Boolean(signIn.session), "signed back in", signInErr?.message ?? "");

const { data: reread } = await second
  .from("user_settings")
  .select("*")
  .eq("user_id", userId)
  .maybeSingle();
check(
  reread?.analysis_model === CHOSEN,
  "the changed setting survived a sign-out",
  `${reread?.analysis_model}, wanted ${CHOSEN}`
);

const { data: rereadProfile } = await second
  .from("profiles")
  .select("*")
  .eq("id", userId)
  .maybeSingle();
check(
  rereadProfile?.display_name === NAME,
  "the new account name survived a sign-out",
  `${rereadProfile?.display_name}, wanted ${NAME}`
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
