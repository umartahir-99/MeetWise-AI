/**
 * Fills in frontend/.env.local from the linked Supabase project.
 *
 *   node scripts/write-env.mjs
 *
 * Exists because reading project API keys is refused to the agent by the
 * permission classifier, and quite reasonably so. Running it yourself keeps the
 * key out of the conversation entirely: nothing is printed but a masked
 * fingerprint, enough to confirm which key landed without disclosing it.
 *
 * The anon key is safe in a browser bundle — RLS is what protects the data —
 * but there is still no reason for it to travel further than it must.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REF = "wvvexjktntliwkrwhohk"; // Meetwise, ap-south-1. Not the Seoul one.
const ENV_PATH = new URL("../frontend/.env.local", import.meta.url);

let raw;
try {
  raw = execFileSync(
    process.platform === "win32" ? "supabase.cmd" : "supabase",
    ["projects", "api-keys", "--project-ref", REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
} catch (failure) {
  console.error("Could not reach the Supabase CLI.");
  console.error(failure.stderr?.toString().trim() || failure.message);
  console.error("\nIf it says you are not logged in, run:  supabase login");
  process.exit(1);
}

// The CLI has shipped a few shapes for this over versions, so take the first
// thing that looks like a key rather than trusting one field name.
const parsed = JSON.parse(raw.slice(raw.indexOf("[") >= 0 ? raw.indexOf("[") : 0));
const rows = Array.isArray(parsed) ? parsed : parsed.keys ?? [];

const wanted = rows.find((r) => {
  const name = String(r.name ?? r.type ?? "").toLowerCase();
  return name === "anon" || name === "publishable" || name.includes("publishable");
});

const key = wanted && (wanted.api_key ?? wanted.apiKey ?? wanted.key ?? wanted.value);

if (!key) {
  console.error("No anon / publishable key came back. What the CLI returned had these entries:");
  console.error(rows.map((r) => `  - ${r.name ?? r.type ?? "?"}`).join("\n") || "  (none)");
  process.exit(1);
}

writeFileSync(
  ENV_PATH,
  [
    "# Git-ignored. Written by scripts/write-env.mjs from the linked project.",
    "# Both values are safe in a browser bundle; RLS is what protects the data.",
    `VITE_SUPABASE_URL=https://${REF}.supabase.co`,
    `VITE_SUPABASE_ANON_KEY=${key}`,
    "",
  ].join("\n"),
  "utf8"
);

// Masked: enough to tell one key from another, not enough to use.
const shape = key.startsWith("eyJ") ? "JWT" : key.startsWith("sb_") ? "publishable" : "unknown";
console.log(`Wrote frontend/.env.local`);
console.log(`  URL   https://${REF}.supabase.co`);
console.log(`  KEY   ${shape}, ${key.length} chars, ${key.slice(0, 6)}…${key.slice(-4)}`);
console.log(`\nNext:  node scripts/isolation-test.mjs`);

// Sanity: does it actually authenticate?
const probe = await fetch(`https://${REF}.supabase.co/rest/v1/meetings?select=id&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log(
  probe.ok || probe.status === 200
    ? "\nKey authenticates against the REST endpoint."
    : `\nWARNING — the endpoint answered ${probe.status}. ${await probe.text()}`
);
