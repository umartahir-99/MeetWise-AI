/**
 * Does `frontend/src/api/rows.ts` still describe the real database?
 *
 *   node scripts/verify-schema.mjs
 *
 * `rows.ts` is hand-written, because generating it needs a live project and the
 * app should not carry a generated file it cannot rebuild offline. The cost of
 * hand-writing it is drift, and this is what pays that cost: it asks the linked
 * project for its own types and diffs the column names against the interfaces.
 *
 * Run it after every migration. When the two disagree, the migration is the
 * truth and `rows.ts` is the bug.
 *
 * Needs only the CLI login — no anon key, no database password.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PAIRS = [
  ["ProfileRow", "profiles"],
  ["PersonRow", "people"],
  ["VoiceRow", "voices"],
  ["MeetingRow", "meetings"],
  ["MeetingSpeakerRow", "meeting_speakers"],
  ["TranscriptLineRow", "transcript_lines"],
  ["TopicRow", "topics"],
  ["DecisionRow", "decisions"],
  ["ActionItemRow", "action_items"],
  ["QuoteRow", "quotes"],
  ["UserSettingsRow", "user_settings"],
  ["ProcessingJobRow", "processing_jobs"],
];

let live;
try {
  live = execFileSync("supabase", ["gen", "types", "typescript", "--linked"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 << 20,
    // Windows resolves the CLI through a .cmd shim, which only a shell can run.
    shell: process.platform === "win32",
  });
} catch (failure) {
  console.error("Could not read the schema from the linked project.");
  console.error(failure.stderr?.toString().trim() || failure.message);
  process.exit(1);
}

// The CLI hands back CRLF on Windows. Every offset below is written in terms of
// the newline alone, so the carriage returns come out once here rather than
// every pattern having to allow for one.
const unixify = (text) => text.split("\r\n").join("\n");

live = unixify(live);
const mine = unixify(
  readFileSync(new URL("../../frontend/src/api/rows.ts", import.meta.url), "utf8")
);

/**
 * The column names on one generated `Row` block.
 *
 * The generated file nests a fixed six spaces deep, and each table's `Row` is
 * followed by `Insert` and `Update` shapes carrying the same field names — so
 * the block is bounded by its closing brace at a known indent rather than by
 * searching for the next field.
 */
function columnsOf(table) {
  const header = "\n      " + table + ": {\n        Row: {\n";
  const start = live.indexOf(header);
  if (start === -1) return null;

  const from = start + header.length;
  const to = live.indexOf("\n        }", from);
  if (to === -1) return null;

  return new Set(
    live
      .slice(from, to)
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.trim().split(":")[0].trim())
  );
}

/** The field names declared on one interface in `rows.ts`. */
function fieldsOf(iface) {
  const header = "export interface " + iface + " {\n";
  const start = mine.indexOf(header);
  if (start === -1) return null;

  const from = start + header.length;
  const to = mine.indexOf("\n}", from);
  if (to === -1) return null;

  return new Set(
    mine
      .slice(from, to)
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return t && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*");
      })
      .map((line) => line.trim().split(":")[0].trim())
  );
}

let bad = 0;

for (const [iface, table] of PAIRS) {
  const cols = columnsOf(table);
  const fields = fieldsOf(iface);

  if (!cols) {
    console.log("FAIL  " + table + " — no such table in the database");
    bad++;
    continue;
  }
  if (!fields) {
    console.log("FAIL  " + iface + " — not declared in rows.ts");
    bad++;
    continue;
  }

  const missing = [...cols].filter((c) => !fields.has(c));
  const extra = [...fields].filter((f) => !cols.has(f));

  if (missing.length || extra.length) {
    bad++;
    console.log("FAIL  " + iface + " vs " + table);
    if (missing.length) {
      console.log("        in the database, missing from rows.ts: " + missing.join(", "));
    }
    if (extra.length) {
      console.log("        in rows.ts, not in the database: " + extra.join(", "));
    }
  } else {
    console.log("ok    " + iface.padEnd(20) + " " + table.padEnd(18) + " " + cols.size + " columns");
  }
}

console.log(
  bad
    ? "\n" + bad + " of " + PAIRS.length + " out of step with the database"
    : "\nAll " + PAIRS.length + " match the live schema."
);
process.exit(bad ? 1 : 0);
