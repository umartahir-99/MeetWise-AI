/**
 * Does the database recognise a voice it has heard before?
 *
 *   node scripts/verify-m6.mjs
 *
 * The matching half of M6, tested with synthetic vectors so it costs nothing
 * and needs no model: a named voice in one meeting, a near-identical vector in
 * another, and the question of whether `match_voice` finds it - and refuses a
 * stranger, a weak match, and another user's voices.
 *
 * Runs on a throwaway account.
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
const client = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });

const a = client();
const stamp = Date.now();
const { data: authA, error } = await a.auth.signUp({ email: `m6-a-${stamp}@gmail.com`, password: `pw-${stamp}!` });
if (error || !authA?.session) {
  console.error(error?.message ?? "no session");
  process.exit(1);
}
const userA = authA.user.id;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// --- vectors --------------------------------------------------------------
// Deterministic pseudo-random unit vectors, and a way to nudge one so it stays
// close (same voice, different recording) or drifts (weak resemblance).
const DIM = 512;
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const random = () => unit(Array.from({ length: DIM }, rand));
// Add noise of a chosen magnitude relative to the unit vector, so the
// resulting cosine is predictable: 1/sqrt(1 + m^2). In 512 dimensions a
// per-dimension jitter would swamp the signal; the magnitude is what matters.
const nudge = (v, magnitude) => {
  const noise = unit(Array.from({ length: DIM }, rand));
  return unit(v.map((x, i) => x + magnitude * noise[i]));
};
const cos = (x, y) => x.reduce((s, xi, i) => s + xi * y[i], 0);
const lit = (v) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

const sarah = random();
const sarahAgain = nudge(sarah, 0.4); // same voice, another day: cos ~0.93
const sarahFaint = nudge(sarah, 1.3); // a passing resemblance: cos ~0.61
const stranger = random();
console.log(
  `      similarity: same voice ${cos(sarah, sarahAgain).toFixed(3)}, faint ${cos(sarah, sarahFaint).toFixed(3)}, stranger ${cos(sarah, stranger).toFixed(3)}`
);

// --- a named voice in meeting one ------------------------------------------------
const { data: m1 } = await a
  .from("meetings")
  .insert({ owner_id: userA, title: "m6 monday", started_at: new Date().toISOString(), status: "ready" })
  .select()
  .single();
const vp1 = `${m1.id}:0`;
const { error: e1 } = await a.from("meeting_speakers").insert({
  meeting_id: m1.id, owner_id: userA, slot_id: "speaker-1", label: "Speaker 1", voice_print: vp1, position: 0,
  embedding: lit(sarah),
});
check(!e1, "an embedding is stored on a speaker", e1?.message ?? "");

const { data: person } = await a.from("people").insert({ owner_id: userA, name: "Sarah Chen" }).select().single();
await a.from("voices").insert({ owner_id: userA, voice_print: vp1, person_id: person.id });

// --- meeting two: does the database recognise her? -----------------------------
const { data: hit } = await a.rpc("match_voice", { query: lit(sarahAgain), min_score: 0.75 });
check(hit?.[0]?.person_id === person.id, "the same voice in a new recording matches the named one", hit?.[0] ? `score ${hit[0].score.toFixed(3)}` : "no match");

const { data: faint } = await a.rpc("match_voice", { query: lit(sarahFaint), min_score: 0.75 });
check(!faint?.length, "a passing resemblance does not clear the bar", faint?.[0] ? `matched at ${faint[0].score.toFixed(3)}` : "");

const { data: none } = await a.rpc("match_voice", { query: lit(stranger), min_score: 0.75 });
check(!none?.length, "a stranger matches nobody");

// An unnamed voice must never be offered as a match, however close.
const { data: m2 } = await a
  .from("meetings")
  .insert({ owner_id: userA, title: "m6 tuesday", started_at: new Date().toISOString(), status: "ready" })
  .select()
  .single();
const vp2 = `${m2.id}:0`;
await a.from("meeting_speakers").insert({
  meeting_id: m2.id, owner_id: userA, slot_id: "speaker-1", label: "Speaker 1", voice_print: vp2, position: 0,
  embedding: lit(stranger),
});
await a.from("voices").insert({ owner_id: userA, voice_print: vp2, person_id: null });
const { data: unnamed } = await a.rpc("match_voice", { query: lit(stranger), min_score: 0.75 });
check(!unnamed?.length, "an unnamed voice is never offered as a match, even to itself");

// --- the match is recorded, visible, and undoable --------------------------------
const { error: linkErr } = await a
  .from("voices")
  .update({ person_id: person.id, matched_from_voice_print: vp1, match_score: hit?.[0]?.score ?? null })
  .eq("voice_print", vp2);
check(!linkErr, "a match can be recorded with its source and score", linkErr?.message ?? "");

const { data: linked } = await a.from("voices").select("person_id, matched_from_voice_print, match_score").eq("voice_print", vp2).single();
check(
  linked.person_id === person.id && linked.matched_from_voice_print === vp1 && linked.match_score > 0.75,
  "the panel can see it was matched, from what, and how confidently",
  `${(linked.match_score * 100).toFixed(0)}%`
);

await a.from("voices").update({ person_id: null, matched_from_voice_print: null, match_score: null }).eq("voice_print", vp2);
const { data: undone } = await a.from("voices").select("person_id, match_score").eq("voice_print", vp2).single();
check(undone.person_id === null && undone.match_score === null, "undo returns it to an unnamed voice");

// --- another user cannot match against A's voices --------------------------------
const b = client();
const { data: authB } = await b.auth.signUp({ email: `m6-b-${stamp}@gmail.com`, password: `pw-${stamp}!` });
if (authB?.session) {
  const { data: cross } = await b.rpc("match_voice", { query: lit(sarah), min_score: 0.5 });
  check(!cross?.length, "another user's identical voice matches nothing of A's — RLS holds inside the function");
}

await a.from("meetings").delete().in("id", [m1.id, m2.id]);
console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
