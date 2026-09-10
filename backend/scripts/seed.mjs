/**
 * Put the sample archive into the database.
 *
 *   node scripts/seed.mjs <email> <password> [--force]
 *
 * The fixtures are read out of `frontend/src/mockData.ts` rather than copied
 * into a .sql file, so there is exactly one definition of the sample archive.
 * A hand-written seed drifts from the fixtures the first time either changes,
 * and nothing catches it.
 *
 * It inserts through the API as the signed-in user rather than as postgres,
 * which means row level security applies to the seed exactly as it applies to
 * the app. A seed that needs superuser to work is a seed that proves nothing.
 */
// By path, not by name: vite is a dependency of the frontend, and this script
// lives outside that package.
import { createServer } from "../../frontend/node_modules/vite/dist/node/index.js";
import { readFileSync } from "node:fs";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const [email, password] = process.argv.slice(2);
const force = process.argv.includes("--force");

if (!email || !password) {
  console.error("usage: node scripts/seed.mjs <email> <password> [--force]");
  console.error("\nThe account must already exist — sign up in the app first.");
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
if (!url || !key) {
  console.error("FAIL — frontend/.env.local needs a URL and a key.");
  process.exit(1);
}

// Vite compiles the fixtures, so the TypeScript source is the only copy.
const vite = await createServer({
  root: new URL("../../frontend", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const fixtures = await vite.ssrLoadModule("/src/mockData.ts");
await vite.close();

const { MOCK_MEETINGS, MOCK_USERS, INITIAL_VOICE_DIRECTORY } = fixtures;

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (authError) {
  console.error(`FAIL — could not sign in: ${authError.message}`);
  process.exit(1);
}
const ownerId = auth.user.id;
console.log(`signed in as ${email}`);

const { data: already } = await supabase.from("meetings").select("id");
if (already?.length && !force) {
  console.error(`\nThis account already has ${already.length} meeting(s).`);
  console.error("Pass --force to add the samples anyway.");
  process.exit(1);
}

const die = (label, error) => {
  if (!error) return;
  console.error(`FAIL — ${label}: ${error.message}`);
  process.exit(1);
};

// --- people ----------------------------------------------------------------
// The fixture's own ids are thrown away: `people.id` is generated, and the map
// below is what re-points the voice directory at the rows that actually exist.
const personIdByFixtureId = new Map();

for (const person of Object.values(MOCK_USERS)) {
  const { data, error } = await supabase
    .from("people")
    .insert({ owner_id: ownerId, name: person.name })
    .select()
    .single();
  die(`inserting ${person.name}`, error);
  personIdByFixtureId.set(person.id, data.id);
}
console.log(`people: ${personIdByFixtureId.size}`);

// --- voices ----------------------------------------------------------------
const voiceRows = Object.entries(INITIAL_VOICE_DIRECTORY).map(([voicePrint, fixtureId]) => ({
  owner_id: ownerId,
  voice_print: voicePrint,
  person_id: personIdByFixtureId.get(fixtureId) ?? null,
}));
die("inserting voices", (await supabase.from("voices").insert(voiceRows)).error);
console.log(`voices: ${voiceRows.length}`);

// --- meetings --------------------------------------------------------------
for (const meeting of MOCK_MEETINGS) {
  const { data: row, error } = await supabase
    .from("meetings")
    .insert({
      owner_id: ownerId,
      title: meeting.title,
      started_at: meeting.startedAt,
      duration_ms: meeting.durationMs,
      status: meeting.status,
      gist: meeting.gist,
      summary: meeting.summary,
      tags: meeting.tags,
    })
    .select()
    .single();
  die(`inserting "${meeting.title}"`, error);

  const meetingId = row.id;
  const owned = (extra) => ({ meeting_id: meetingId, owner_id: ownerId, ...extra });

  // `position` carries what the analysis meant by the order; without it the
  // rows come back in whatever order the database finds them.
  const children = [
    [
      "meeting_speakers",
      meeting.speakers.map((s, position) =>
        owned({ slot_id: s.id, label: s.label, voice_print: s.voicePrint, position })
      ),
    ],
    [
      "transcript_lines",
      meeting.transcript.map((l) =>
        owned({ speaker_slot: l.speakerId, text: l.text, start_ms: l.startMs, end_ms: l.endMs })
      ),
    ],
    [
      "topics",
      meeting.topics.map((t, position) =>
        owned({ title: t.title, details: t.details, position })
      ),
    ],
    ["decisions", meeting.decisions.map((text, position) => owned({ text, position }))],
    [
      "action_items",
      meeting.actionItems.map((a, position) =>
        owned({ item: a.item, speaker_slot: a.speakerId, done: a.done === true, position })
      ),
    ],
    [
      "quotes",
      meeting.quotes.map((q, position) =>
        owned({ quote: q.quote, speaker_slot: q.speakerId, start_ms: q.startMs, position })
      ),
    ],
  ];

  for (const [table, rows] of children) {
    if (!rows.length) continue;
    die(`inserting ${table}`, (await supabase.from(table).insert(rows)).error);
  }

  console.log(
    `  ${meeting.title.slice(0, 46)} — ` +
      `${meeting.speakers.length} voices, ${meeting.transcript.length} lines, ` +
      `${meeting.actionItems.length} actions`
  );
}

console.log(`\nSeeded ${MOCK_MEETINGS.length} meetings.`);
process.exit(0);
