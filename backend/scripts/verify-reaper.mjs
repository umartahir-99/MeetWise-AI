/**
 * Does a job that stops moving get turned into something the user can retry?
 *
 *   node scripts/verify-reaper.mjs <email> <password>
 *
 * Plants a meeting that looks stuck at `analyzing` for ten minutes, then waits
 * for the five-minute pg_cron sweep to find it. Takes up to six minutes; costs
 * no Gladia or Gemini quota.
 */
import { readFileSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password] = process.argv.slice(2);
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
const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error(error.message);
  process.exit(1);
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// A caller must not be able to run the sweep themselves.
const { error: rpcErr } = await supabase.rpc("reap_stuck_meetings");
check(
  Boolean(rpcErr),
  "a signed-in user cannot invoke the sweep directly",
  rpcErr?.message?.slice(0, 60) ?? "IT RAN"
);

const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
const { data: stuck } = await supabase
  .from("meetings")
  .insert({
    owner_id: auth.user.id,
    title: "reaper probe",
    started_at: tenMinutesAgo,
    duration_ms: 60_000,
    status: "analyzing",
    stage_started_at: tenMinutesAgo,
    uploaded_at: tenMinutesAgo,
  })
  .select()
  .single();
console.log(
  `      planted ${stuck.id.slice(0, 8)} at analyzing, stage_started_at = 10 min ago; waiting for the sweep (up to 6 min)`
);

const deadline = Date.now() + 6 * 60_000;
let final = null;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 15_000));
  const { data } = await supabase
    .from("meetings")
    .select("status, failed_stage, failure_reason")
    .eq("id", stuck.id)
    .maybeSingle();
  if (data?.status === "failed") {
    final = data;
    break;
  }
  process.stdout.write(".");
}
console.log();
check(final?.status === "failed", "the sweep turned the stuck job into a failure", final ? "" : "still analyzing after 6 min");
check(final?.failed_stage === "analyzing", "it names the stage that stalled", final?.failed_stage);
check(/retry/i.test(final?.failure_reason ?? ""), "the reason tells the user what to do", final?.failure_reason);

await supabase.from("meetings").delete().eq("id", stuck.id);
console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
