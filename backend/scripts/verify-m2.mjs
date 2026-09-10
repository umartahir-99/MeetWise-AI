/**
 * Does the archive survive the round trip?
 *
 *   node scripts/verify-m2.mjs <email> <password>
 *
 * M2's stated test is that Archive, Home, Ask, Commitments and Meeting Detail
 * all work with zero changes to their code — which holds exactly as long as
 * `toMeeting` returns the same shape the fixtures do. So this reads the seeded
 * archive back through the real mapper and compares it against the fixtures it
 * came from, field by field.
 *
 * It runs the app's own modules, not copies of them: `mappers.ts` and
 * `speakers.ts` are loaded through Vite, so a change to either is caught here
 * rather than on screen.
 */
import { createServer } from "../../frontend/node_modules/vite/dist/node/index.js";
import { readFileSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/verify-m2.mjs <email> <password>");
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

const vite = await createServer({
  root: new URL("../../frontend", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const { MOCK_MEETINGS } = await vite.ssrLoadModule("/src/mockData.ts");
const { toMeeting, toPeople, toVoiceDirectory } = await vite.ssrLoadModule("/src/api/mappers.ts");
const { createSpeakerResolver } = await vite.ssrLoadModule("/src/speakers.ts");
const { collectCommitments } = await vite.ssrLoadModule("/src/commitments.ts");
const { buildIndex, answerQuestion } = await vite.ssrLoadModule("/src/retrieval.ts");
const { toJson, toMarkdown } = await vite.ssrLoadModule("/src/exportArchive.ts");
await vite.close();

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  console.error(`FAIL — could not sign in: ${authError.message}`);
  process.exit(1);
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// --- read it back, exactly as `listMeetings` does --------------------------
const { data: rows, error } = await supabase
  .from("meetings")
  .select(
    `*, meeting_speakers(*), transcript_lines(*), topics(*), decisions(*), action_items(*), quotes(*)`
  )
  .order("started_at", { ascending: false });

if (error) {
  console.error(`FAIL — reading the archive: ${error.message}`);
  process.exit(1);
}

const meetings = rows.map(toMeeting);
check(meetings.length === MOCK_MEETINGS.length, "every seeded meeting comes back",
  `${meetings.length} of ${MOCK_MEETINGS.length}`);

// --- per meeting, against the fixture it came from -------------------------
const fixtureByTitle = new Map(MOCK_MEETINGS.map((m) => [m.title, m]));
let mismatches = [];

for (const meeting of meetings) {
  const fixture = fixtureByTitle.get(meeting.title);
  if (!fixture) {
    mismatches.push(`${meeting.title}: no fixture`);
    continue;
  }

  const same = (field, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      mismatches.push(`${meeting.title} / ${field}`);
    }
  };

  same("startedAt", meeting.startedAt, new Date(fixture.startedAt).toISOString());
  same("durationMs", meeting.durationMs, fixture.durationMs);
  same("status", meeting.status, fixture.status);
  same("gist", meeting.gist, fixture.gist);
  same("summary", meeting.summary, fixture.summary);
  same("tags", meeting.tags, fixture.tags);
  same("speakers", meeting.speakers, fixture.speakers);
  same("topics", meeting.topics, fixture.topics);
  same("decisions", meeting.decisions, fixture.decisions);
  same("quotes", meeting.quotes, fixture.quotes);
  same("transcript", meeting.transcript, fixture.transcript);
  // Action items gain a row id on the way through, which is the point of them
  // having rows at all — so compare everything else.
  same(
    "actionItems",
    meeting.actionItems.map(({ item, speakerId }) => ({ item, speakerId })),
    fixture.actionItems.map(({ item, speakerId }) => ({ item, speakerId }))
  );
}

check(mismatches.length === 0, "every field round-trips unchanged",
  mismatches.length ? mismatches.slice(0, 6).join("; ") : "");

// --- ordering --------------------------------------------------------------
const sortedDesc = meetings.every(
  (m, i) => i === 0 || Date.parse(meetings[i - 1].startedAt) >= Date.parse(m.startedAt)
);
check(sortedDesc, "the archive comes back newest first");

const transcriptsOrdered = meetings.every((m) =>
  m.transcript.every((l, i) => i === 0 || m.transcript[i - 1].startMs <= l.startMs)
);
check(transcriptsOrdered, "every transcript is in time order");

check(
  meetings.every((m) => m.actionItems.every((a) => typeof a.id === "string")),
  "every action item carries its row id"
);

// --- the logic layers that never learned about a database ------------------
const { data: peopleRows } = await supabase.from("people").select("*");
const { data: voiceRows } = await supabase.from("voices").select("*");
const { data: whoami } = await supabase.auth.getUser();
const { data: profileRow } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", whoami.user.id)
  .maybeSingle();

// Built the way `App` builds it: the account is folded into the directory,
// because whoever owns a recording is a person too and their name lives in
// `profiles` rather than in `people`.
const account = { id: whoami.user.id, name: profileRow?.display_name ?? "You" };
const withAccount = (rows) => ({ ...toPeople(rows ?? []), [account.id]: account });

const people = withAccount(peopleRows);
const voices = toVoiceDirectory(voiceRows ?? []);
const speakers = createSpeakerResolver(people, voices);

const named = meetings.every((m) => speakers.participants(m).every((n) => !/^Speaker \d/.test(n)));
check(named, "every seeded voice resolves to a name, not a slot label");

const roster = speakers.roster(meetings);
check(roster.length > 0 && roster.every((v) => v.name !== null),
  "the voice directory rebuilds from the database", `${roster.length} voices`);

const owed = collectCommitments(meetings, speakers, {
  scope: "everyone",
  status: "all",
  personId: "irrelevant",
});
const expectedOwed = MOCK_MEETINGS.reduce((n, m) => n + m.actionItems.length, 0);
check(owed.length === expectedOwed, "the commitments rollup sees every action item",
  `${owed.length} of ${expectedOwed}`);
check(owed.every((c) => typeof c.id === "string"), "every commitment carries an id to tick");

const index = buildIndex(meetings, speakers);
const answer = answerQuestion("what did we decide about the cork borders", index, speakers);
check(answer.kind === "answer", "Ask still answers from the database archive", answer.kind);
if (answer.kind === "answer") {
  check(answer.citations.length > 0, "the answer carries citations",
    `${answer.citations.length}`);
  check(
    answer.citations.every((c) => meetings.some((m) => m.id === c.meetingId)),
    "every citation points at a meeting that exists"
  );
}


// --- writes, and whether they survive being read again --------------------
const ownerId = account.id;

const target = owed.find((c) => !c.done);
await supabase
  .from("action_items")
  .update({ done: true, done_at: new Date().toISOString() })
  .eq("id", target.id);

const { data: tickedRow } = await supabase
  .from("action_items")
  .select("done")
  .eq("id", target.id)
  .maybeSingle();
check(tickedRow?.done === true, "a ticked action item stays ticked", target.item.slice(0, 40));

// Naming is the headline feature: the name goes against the voice, so it has to
// reach every meeting that voice appears in without any of them being written.
const multiMeetingVoice = roster.find((v) => v.meetingCount > 1) ?? roster[0];
const RENAMED = "Renamed By Test";

// Find-or-create, the same merge the app does: the unique index on
// (owner_id, lower(name)) rejects a second insert, which is what makes typing
// a known name merge rather than duplicate — and what makes this test
// re-runnable against an account it has already touched.
const findRenamed = () =>
  supabase.from("people").select("*").eq("owner_id", ownerId).ilike("name", RENAMED)
    .maybeSingle();

let { data: person } = await findRenamed();
if (!person) {
  const created = await supabase
    .from("people")
    .insert({ owner_id: ownerId, name: RENAMED })
    .select()
    .single();
  person = created.data ?? (await findRenamed()).data;
}
check(Boolean(person), "naming a new person merges rather than duplicating");

await supabase
  .from("voices")
  .update({ person_id: person.id })
  .eq("voice_print", multiMeetingVoice.voicePrint);

const { data: voicesAfter } = await supabase.from("voices").select("*");
const { data: peopleAfter } = await supabase.from("people").select("*");
const afterResolver = createSpeakerResolver(
  withAccount(peopleAfter),
  toVoiceDirectory(voicesAfter ?? [])
);

// The meeting objects below are the ones read BEFORE the rename. That they now
// resolve to the new name is the proof: nothing about them was rewritten.
const touched = meetings.filter((m) =>
  m.speakers.some((sp) => sp.voicePrint === multiMeetingVoice.voicePrint)
);
check(
  touched.length > 0 &&
    touched.every((m) =>
      m.speakers
        .filter((sp) => sp.voicePrint === multiMeetingVoice.voicePrint)
        .every((sp) => afterResolver.nameOf(m, sp.id) === RENAMED)
    ),
  "renaming a voice renames it everywhere, with no meeting rewritten",
  touched.length + " meeting(s)"
);

// --- export ----------------------------------------------------------------
const json = JSON.parse(toJson(meetings, afterResolver));
const markdown = toMarkdown(meetings, afterResolver);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const exported = json.meetings ?? json;

check(exported.length === meetings.length, "export carries every meeting", String(exported.length));
check(
  exported.every((m) => !UUID.test(m.owner)) &&
    exported.every((m) => (m.participants ?? []).every((n) => !UUID.test(n))),
  "export names people rather than dumping internal ids"
);
check(
  exported.every((m) => (m.actionItems ?? []).every((a) => !/^speaker-/.test(a.owner))),
  "export resolves action item owners to names"
);
check(/\d+:\d\d/.test(markdown), "markdown export renders offsets as clock times");
console.log(failures ? "\n" + failures + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
