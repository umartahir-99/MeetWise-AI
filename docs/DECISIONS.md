# MeetWise AI — Decision Log

Every decision that shaped the build, in one place. Each entry records what was
decided, why, and what it commits us to. Where a decision departed from the
original plan, the departure is named.

**Companion documents:** [PRD.md](./PRD.md) · [TRD.md](./TRD.md) ·
[SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md) · [STATUS.md](./STATUS.md)

---

## 1. Principles

### 1.1 The database is built only from files

Never write SQL into the dashboard. Every change is a migration under
`backend/supabase/migrations/`; project settings are pulled, edited and pushed
through `config.toml`. If the files cannot rebuild the database, the files are
wrong.

*Consequence:* a second project runs the same migrations and gets the same
result. Two exceptions had to be worked around — see 4.3 and 4.4.

### 1.2 Nothing ships as working that has not run

Every milestone has a verification script in `backend/scripts/` that exercises
the deployed system, not a copy of it. Code that compiled but never ran is
recorded as unverified. When a feasibility test could not run (7.2), nothing
was written on the assumption it would work.

### 1.3 Strictly free tier

No paid service, no paid model, no billing, no paid fallback. Any setting that
could reach paid usage is removed or routed to a free option. The tightest
limit in the stack is Gemini's twenty requests a day, so every script that
spends one says so in its header.

### 1.4 The interface says what is real

Retrieval is keyword matching, so the screen says `KEYWORD RETRIEVAL`, never
"AI". A progress bar cannot claim a stage is done before the database says so.
Live Capture is labelled a demo. Copy that called the product a prototype was
removed only when the thing it described stopped being one.

---

## 2. Architecture

### 2.1 Supabase, three edge functions, no server

Auth, Postgres, Storage, Realtime and edge functions from one provider; Gladia
for speech-to-text; Gemini for analysis. Nothing runs while idle, so nothing
costs money while idle.

### 2.2 Nothing waits

Transcribing a long recording takes minutes and no request may live that long.
Work is handed off and the result arrives later through a different door: the
browser calls `start-processing`, which returns in under a second; Gladia calls
`transcription-webhook` when done; the webhook hands off to `analyze-meeting`
and answers Gladia immediately.

### 2.3 The `Meeting` interface is the API contract

The frontend's `Meeting` type already had real ISO instants, offsets in
milliseconds and a proper status enum. The backend's job was to produce that
exact shape from rows, not to design a new one. `frontend/src/api/mappers.ts`
does that, and roughly 3,000 lines of tested UI logic were not touched.

*Rule that follows:* when a screen looks wrong after a data change, the mapper
is wrong. Fix it there, not in the screen.

### 2.4 Analysis is handed off with `EdgeRuntime.waitUntil`, not a database webhook

**Departure from TRD 7.3.** The plan fires `analyze-meeting` from a database
webhook, which needs `pg_net` and a secret the trigger can read — either a
secret inside a migration file, or a Vault entry set by hand. Neither is
reproducible from files. The transcription webhook triggers analysis itself and
still answers Gladia in milliseconds. Same decoupling; nothing secret in SQL.

### 2.5 Realtime carries status; there is no timer

The processing screen advances because the browser is subscribed to its own
meeting row. `meetings` is in the `supabase_realtime` publication by migration.
The fake five-stage timer, `Meeting.sim`, `plannedFailure()` and the "any file
named *fail* dies" trick were deleted, not disabled.

---

## 3. Data

### 3.1 Normalized tables, not JSON blobs

Action items need a stable id to tick; citations point at real transcript
lines; search will live on those lines as rows. Twelve tables.

### 3.2 `owner_id` on every child table

Looks redundant — a transcript line belongs to a meeting, which has an owner —
but it makes every security policy one comparison instead of a join. Simpler
rules are harder to get wrong.

### 3.3 `people.unique(owner_id, lower(name))` is an index, not a constraint

**Departure from TRD 4.** Postgres cannot put an expression in a table
constraint. Same effect. It also means `upsert … onConflict` cannot target it,
so naming a voice is find-then-insert, with the insert allowed to lose a race.

### 3.4 `rows.ts` is hand-written

Generating it needs a live project, and the app should not carry a generated
file it cannot rebuild offline. Drift is the price; `verify-schema.mjs` pays it
by diffing the interfaces against the live schema after every migration.
**When the two disagree, the migration is the truth.**

### 3.5 A name lives against the voice, never inside a recording

Diarization returns slots (`speaker-1`); a meeting stores slots; the name is
resolved through the voice directory at render time. Naming once renames
everywhere without rewriting a single meeting row. This is the product's
headline feature and the reason `speakers.ts` exists.

### 3.6 The account is folded into the people directory

Whoever owns a recording is a person too, and their name lives in `profiles`,
not `people`. Without folding the account in, a meeting's byline and the export's
owner field render as a raw UUID. Caught by the export check, not by a person.

### 3.7 Action items are addressed by row id, not array position

An index is a fact about an array, not about a promise. The Owed list is a
projection over the archive; an index there means nothing once anything sorts.

### 3.8 Voice prints are per-meeting until M6 delivers a model

`meeting_id:slot` — deterministic, with no cross-meeting meaning. Naming works
within one recording. The schema for real matching (7.1) is in place and inert.

---

## 4. Security

### 4.1 One `for all` policy per table, with `with check`

`using` alone controls reading and would let somebody insert a row owned by
someone else. `(select auth.uid())` rather than bare `auth.uid()` so it is
evaluated once per statement, not once per row.

### 4.2 Edge functions check ownership themselves

They run with the service-role key, which bypasses RLS entirely. A mismatch is
reported as not-found rather than forbidden, so the endpoint cannot be used to
learn which ids exist.

### 4.3 The public webhook has three defences, all required

Verify the shared secret in the callback URL; confirm the transcription id
matches a job we issued; take the meeting id from that job row, never from the
body. Then fetch the result from Gladia with our own key — a payload we did not
fetch ourselves is a payload anyone could have sent.

### 4.4 The scheduler's secret is generated inside the database

`pg_cron` calls `retention-sweep` through `pg_net` and must authenticate. The
migration generates the secret with `gen_random_bytes` straight into Vault; the
scheduler reads it from Vault to send, the function reads it back through a
service-role-only RPC to check. It never exists in any file. A different
project running the migration gets its own.

### 4.5 Tests go through the publishable key, never service-role

A service-role connection bypasses RLS and would pass the isolation test while
the app leaked. The seed inserts as the signed-in user for the same reason: a
seed that needs superuser proves nothing.

### 4.6 `retention-sweep` and `reap_stuck_meetings` are revoked from callers

Both are security definer. PostgREST exposes public functions to any signed-in
user by default; these are for the scheduler.

---

## 5. Pipeline

### 5.1 Gladia is the only transcriber

Deepgram and Whisper appear in settings but are not wired; every job runs
through Gladia and `processing_jobs.provider` says so. The language setting is
honoured. Gladia's seconds-as-floats are multiplied by 1000 in the webhook —
miss that and every citation is off by a thousand.

### 5.2 Gemini with a `responseSchema`, and everything validated

The schema constrains the output; the prompt merely asks. A speaker slot the
meeting does not have is dropped. A quote timestamp inside no transcript line
is snapped to the nearest within five seconds or dropped — an invented
timestamp is a citation that fails silently when clicked.

### 5.3 Product model ids are mapped to vendor ids in one table

Google renamed and withdrew models mid-build: there is no `gemini-3-flash`, and
`gemini-2.5-pro` was withdrawn from new accounts with a 404. The settings screen
keeps product-facing ids; `MODEL_FOR` in `analyze-meeting` maps them. A vendor
rename is a one-line change and no saved setting goes stale.

### 5.4 Thinking level `low`, measured

Gemini 3.x defaults to `medium`. This is extraction from a transcript shown in
full, not reasoning. Analysis went from 8–12 s to 4.4 s with zero thinking
tokens. Decisions, action items and owners identical; **quotes came back 2
instead of 3** on both `low` runs against 3 on every `medium` run. A real,
small effect, recorded rather than rounded away. One constant flips it; every
job records the level that ran.

### 5.5 A 404 or 429 on the chosen model falls back to Flash

The transcript already cost real minutes to produce. A vendor retiring a model
or an account lacking entitlement is not the recording's fault. The downgrade
is logged and reported, not hidden. Only if Flash itself is out of quota does
the meeting fail — with a reason naming the reset time.

### 5.6 A retry after a failed analysis skips transcription

The transcript already exists. `start-processing` sees `failed_stage =
analyzing` with lines present and goes straight to analysis.

### 5.7 Stuck jobs are reaped, not left

A callback that never arrives left a meeting at `transcribing` forever — not
`failed`, so never retryable. `reap_stuck_meetings` runs every five minutes:
uploaded > 2 h, queued > 5 min, transcribing > 20 min, analyzing > 5 min become
failures with a reason and a next step. Windows are generous on purpose;
transcription of ten minutes measured under ten seconds.

### 5.8 Every job records its own timing

Gladia's `transcription_time` and audio length; Gemini's model, thinking level,
wall time and token counts — on `processing_jobs`. The pipeline was tuned once
by spending quota on benchmarks. From here the next performance question is a
query.

---

## 6. Housekeeping

### 6.1 The retention sweep is a function, not SQL

Deleting from `storage.objects` in SQL leaves the file in the bucket, orphaned
and billed, with no row left to find it by. Only the Storage API removes an
object. `retention-sweep` deletes files first, then rows — the order that cannot
orphan — and the Settings button calls the same function with the user's token,
so the manual path and the schedule cannot drift.

### 6.2 Delete-all removes recordings

It did not. Rows went, files stayed and were still billed. Files first, then
rows.

### 6.3 Playback URLs are re-signed before they expire

An hour's URL, re-minted five minutes early while a meeting stays open. A long
listen never hits a dead link.

### 6.4 The upload limit is 50 MiB and mirrors storage

The PRD says 2 GB; the storage tier says 50 MiB. `MAX_UPLOAD_BYTES` mirrors the
tier so the refusal is immediate and readable. An hour fits only as compressed
audio at ≤ ~96 kbps. Raise both places together, never one.

---

## 7. Deferred, with reasons

### 7.1 Cross-meeting voice identity — the model half

The database half is built: `pgvector`, a 512-dimension column, HNSW cosine
index, `match_voice()` scoped by RLS, and match provenance so a match is shown
and undoable — never a silent merge. The model that produces the vector is not.
The plan's options need a GPU server or a paid service. The zero-cost route is
a ~90 MB speaker-verification model in the browser (`WavLM-base-plus-sv` via
transformers.js); its feasibility test could not run because the 150 MB Node
runtime timed out three times on this connection. Per 1.2, nothing was written
blind. Until decided, naming stays per recording.

### 7.2 Owed's `MINE` filter

It filters to action items owned by the account's person, but nothing links a
voice to the account: naming a speaker, even with your own name, creates a
separate `people` row. `MINE` is empty for real uploads; `EVERYONE` works. The
fix — a `people` row whose id is the user id, created on signup and renamed
with the account — is small and written down. Deferred until a real meeting
with assigned tasks makes the case.

### 7.3 The 2:30 first-upload time

A 21 MB WAV of 5:44 took 2:30 from upload to ready. Measurement says the
pipeline takes 21–36 s regardless of length and upload of that size takes ~30 s.
The rest is unexplained. The instrumentation in 5.8 will say where it went on
the next real upload; guessing a third time was declined.

### 7.4 The 25-minute near-cap test

Would spend ~25 of Gladia's 600 monthly minutes to see a genuinely long
transcript through analysis. Declined for now.

### 7.5 `MOCK_QUESTIONS`

Dead code: its `sourceMeetings` name fixture ids no row has, so the gate in
`retrieval.ts` never lets it fire. Left because removing it touches 800
documented lines for no user-visible gain.

---

## 8. Mistakes, owned

- **Benchmarks spent nine of twenty daily Gemini requests** before the quota
  was known. Every script that costs a request now says so in its header.
- **The first retention test pointed at the seeded account** with a 30-day
  window and correctly deleted two sample meetings. The test now creates its
  own throwaway account; the seed was restored.
- **`db reset --linked` and `db dump` need Docker**, contrary to the plan's
  "no Docker" claim. `db push` onto an empty project demonstrated the same
  property once. Recorded, not hidden.
- **A migration file was emptied in the working tree after being committed
  and applied**, and was briefly marked reverted in history on the assumption
  it was a no-op. The live schema showed it had applied; history was repaired
  and the file restored from git. Git is the truth for files; the live schema
  is the truth for what ran.
