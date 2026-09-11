# MeetWise AI — Backend migration progress

**Last worked:** 2026-09-11
**Branch:** `backend/supabase-migration`
**Companion documents:** [PRD.md](./PRD.md) · [TRD.md](./TRD.md) · [SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md)

This file is the resume point. It records what is done, what is half-done, what
is blocked and on whom, and the exact next command to run.

---

## The nine steps

| Step | Milestone | State |
|---|---|---|
| 1 | M0a — scaffolding and migration files | **Done** |
| 2 | M0b — link, push, prove security | **Done** — all 11 checks pass |
| 3 | M1 — sign in, settings persist | **Done** — 12 checks pass |
| 4 | M2 — the archive lives in the database | **Done** — 19 checks pass |
| 5 | M3 — real uploads, Realtime status | **Done** — 11 checks pass, fake pipeline deleted |
| 6 | M4 — Gladia + Gemini, real AI | **Done** — 25 checks pass on a real recording |
| 7 | M5 — retention, audio housekeeping | Not started |
| 8 | M6 — cross-meeting voice identity (optional) | Not started |


---

## What is actually true right now

### Done and verified

- **Supabase CLI 2.117.0** installed globally. Account already logged in.
- **Project linked:** `wvvexjktntliwkrwhohk` ("Meetwise", ap-south-1 / Mumbai).
  The other project on the account, `zonjbhmbtqvwejvzdrcv` (Seoul), is **not**
  the target and should be left alone.
- **All four migrations applied** to that project via `supabase db push`, against
  an empty database. `supabase migration list` shows local and remote matching:

  ```
  20260909184852_schema     20260909184856_rls
  20260909184900_storage    20260909184904_triggers
  ```

- **Frontend builds clean.** `npm run build` passes; `oxlint` reports only two
  pre-existing `StrokeText.tsx` warnings that predate this work.
- A **baseline build failure was fixed**: `Hero.tsx` had an unused `Logo` import
  breaking `tsc -b`. The build did not pass before this session.

### Written but never executed

Everything in Step 3 compiles and every module transforms through Vite, but not
one line has run against a real database. Treat all of it as unverified:

- `frontend/src/lib/supabase.ts`, `frontend/src/useSession.ts`
- `frontend/src/api/{rows,mappers,settings}.ts`
- `frontend/src/components/Auth.tsx`
- the session gate and settings wiring in `App.tsx`
- `backend/scripts/isolation-test.mjs`

### Verified against the live database

Run on 2026-09-10 with `supabase gen types typescript --linked`, which reads the
real schema and needs only the CLI login:

- **All twelve tables exist** in the project.
- **The `meeting_status` enum has exactly the six values** `MeetingStatus` does.
- **All twelve interfaces in `rows.ts` match their table column-for-column.**
  `backend/scripts/verify-schema.mjs` re-runs this check; it caught `ProcessingJobRow`
  missing entirely, which is now added.

### The security proof passed

`node backend/scripts/isolation-test.mjs`, 2026-09-10, all eleven checks:

```
PASS  handle_new_user created a profile row
PASS  handle_new_user created a user_settings row
PASS  settings defaults match DEFAULT_SETTINGS
PASS  all 12 tables exist and are readable by their owner
PASS  no table is readable by a signed-out client
PASS  user A can insert their own meeting
PASS  user A sees exactly their own meeting
PASS  user B sees ZERO of user A's meetings
PASS  user B cannot insert a meeting owned by user A
PASS  user B cannot delete user A's meeting
PASS  user A's meeting survived B's delete attempt
```

Two things had to change to get there. **Email confirmation was on**, which
throttles signup behind Supabase's built-in SMTP — turned off through
`supabase config pull`, one line, `config push`, so the setting is in a file
rather than clicked into a dashboard. And the project issues a **publishable**
key, not an `anon` one; both names are now accepted wherever the key is read.

### Not done — do not assume otherwise

- `MOCK_QUESTIONS` in `mockData.ts` is dead code now: its `sourceMeetings` name
  fixture ids that no database row has, so the gate in `retrieval.ts` never
  lets them fire. Left in place because removing it touches `retrieval.ts`,
  which is 800 documented lines with no user-visible gain from the change.

- `supabase db reset --linked` has never run, so "the files alone can rebuild
  the database" is proven only for a one-shot push onto an empty project, not
  repeatably.

---

## The archive lives in the database

`node backend/scripts/verify-m2.mjs <email> <password>` — nineteen checks, all
passing. The ones that matter:

- every seeded meeting round-trips **field for field** against the fixture it
  came from, transcripts in time order and the archive newest first
- `retrieval.ts`, `commitments.ts`, `speakers.ts` and `exportArchive.ts` all work
  against database-backed meetings **with no changes to any of them**
- renaming a voice renames it in every meeting it appears in, **with no meeting
  row rewritten** — proven against `Meeting` objects read before the rename
- a ticked action item stays ticked
- export names people rather than dumping uuids

Two things had to move for that last one. `ownerName()` read `MOCK_USERS`
directly, so it is now `SpeakerResolver.ownerNameOf` — both call sites already
had a resolver in hand. And the **account is folded into the people directory**,
because whoever owns a recording is a person too and their name lives in
`profiles`, not `people`. Without that a meeting's byline renders as a raw uuid.

`ActionItem` gained an optional `id`, and ticking is addressed by row id rather
than array position, exactly as TRD 4 calls for.

## The product is real

`node backend/scripts/verify-m4.mjs <email> <password> <audio>` — twenty-five
checks on a real two-voice recording, all passing on the first run:

```
uploaded → queued → transcribing → analyzing → ready      31 seconds for 78s of audio
transcript: 35 lines, 2 speakers, heard 4/4 of the words that were said
gist: "The team decided to delay the mobile app beta launch from Friday to next Tuesday…"
action items: speaker-2 owns the cache fix, speaker-1 owns the release notes
quotes: 3, every startMs landing on a real transcript line
silent file: fails at `transcribing` with "No speech was detected…", retry re-enters
```

Three edge functions in `backend/supabase/functions/`, deployed with
`--use-api`. `start-processing` signs a URL and hands it to Gladia;
`transcription-webhook` is the public door with all three defences from TRD
7.2; `analyze-meeting` asks Gemini with a `responseSchema` and validates every
slot and timestamp before writing.

**One deviation from the plan, on purpose.** The plan has a *database webhook*
fire `analyze-meeting` when status turns `analyzing`. That needs `pg_net` plus a
secret the trigger can read, which means either a secret in a migration file or
a Vault entry set by hand. Instead the transcription webhook hands the meeting
to `analyze-meeting` itself, through `EdgeRuntime.waitUntil`, so it still
answers Gladia in milliseconds. Same decoupling, no secret in SQL, fully
reproducible from files.

**Model names, and what happens when the vendor moves them.** There is no
`gemini-3-flash`; the Flash line runs 3.5 → 3.8. And Google has withdrawn
`gemini-2.5-pro` from new accounts entirely — the API answers 404 and names
`gemini-3.1-pro-preview` as the replacement, while the docs still list 2.5 Pro
as stable. Found by Umar on a real upload on 2026-09-11.

So the settings screen keeps product-facing ids and `analyze-meeting` maps them
to vendor ids in one table. The old `gemini-2-5-pro` id stays in the map as a
legacy entry pointing at 3.1 Pro, so anyone who saved it is not stranded; the
dropdown now offers "Gemini 3.1 Pro". And **a 404 or 429 on the chosen model
falls back to the default Flash model** rather than failing the meeting — the
transcript already cost real minutes to make, and a vendor retiring a model or
an account lacking Pro entitlement is not the recording's fault. The downgrade
is logged and reported in the function's response, not hidden. If even Flash
returns 429, the failure reason says the quota is spent and to retry later.

**Only Gladia transcribes.** The transcription-model setting is saved and shown,
but Deepgram and Whisper are not wired; every job runs through Gladia and
`processing_jobs.provider` says so. The language setting *is* honoured.

**Voice prints are per-meeting.** `meeting_id:slot` — deterministic, but with no
cross-meeting meaning. Naming a voice works within one recording; the
retroactive cross-meeting rename waits on M6, exactly as TRD 10.1 says.

## Uploads are real, and the timer is gone

`node backend/scripts/verify-m3.mjs <email> <password>` — eleven checks, stable
across repeated runs:

- the row is inserted **before** the file moves, so a refresh mid-upload finds
  the job in the right state
- the file lands in storage under `{user_id}/{meeting_id}/`, and **another user
  cannot download it** (storage policy, separate from RLS)
- `start-processing` — the first edge function, deployed with `--use-api` so no
  Docker — accepts the owner and **refuses another user's meeting**
- **a status change reaches a subscribed client on its own.** This is the check
  that means the fake pipeline is really gone
- discard removes the row and the file

Deleted: `useProcessingEngine.ts`, `Meeting.sim`, `plannedFailure()`,
`buildReadyMeeting()`, `MOCK_UPLOAD_ANALYSIS`, and the "any file with *fail* in
its name dies" trick. The stage model in `processing.ts` now carries
`expectedMs` — an estimate for animating the bar *between* real updates, never a
deadline — and within-stage progress is asymptotic, so the bar cannot claim a
stage finished before the database does. The screen says "taking longer than
usual" out loud rather than sitting on a countdown stuck at zero.

**The upload limit is 50 MiB, not 2 GB.** That is the storage tier's ceiling,
set in `backend/supabase/config.toml` and mirrored in `MAX_UPLOAD_BYTES` so the
refusal is immediate and readable. Raising it needs a paid tier; raise both
places together. 50 MiB is roughly an hour of speech-quality M4A, which is why
the upload screen nudges toward audio-only exports.

**Realtime needed a migration**, not a dashboard click: `meetings` is added to
the `supabase_realtime` publication in `..._realtime.sql`. The first run after
pushing it missed the event — the replication slot takes a moment to pick up a
new table — and every run since has heard it.

## Nothing is blocking

`frontend/.env.local` holds a working publishable key. Step 3's code still has
to be exercised by hand — see below.

### The plan's "no Docker" claim is not quite true

`SUPABASE_BACKEND_PLAN.md` line 20 says every step runs against the cloud
project with no Docker needed. That holds for `link`, `db push`,
`migration list` and `gen types`, all of which have been run here successfully.

It does **not** hold for `supabase db dump`, which fails with
`docker: command not found`. The CLI runs `pg_dump` inside a container even when
the target is remote.

`supabase db reset --linked` is very likely the same — it is documented as
rebuilding through the same machinery — which means the M0 step "prove the files
can rebuild the database" may need Docker Desktop installed after all, or has to
be replaced by dropping and re-pushing. Not yet confirmed, because that command
is refused to the agent for being destructive.

This does not block anything today. `db push` applied all four migrations to an
empty project, which demonstrates the same property once.

### Three commands were blocked by the permission classifier

Not worked around, deliberately. Any of these needs either the user to run it or
a Bash permission rule in `.claude/settings.json`:

| Command | Wanted for |
|---|---|
| `supabase projects api-keys --project-ref wvvexjktntliwkrwhohk` | Reading the anon key |
| `supabase db reset --linked` | The rebuild-from-files proof |
| `supabase inspect db …` | Read-only table and RLS confirmation |

---

## Pick up here

**M4 review and optimisation pass, 2026-09-11.** Umar asked for measurement
before change. Five timed runs through the deployed pipeline (`backend/scripts/
bench-pipeline.mjs`) overturned the earlier extrapolation:

| Audio | start | transcribing | analyzing | total |
|---|---|---|---|---|
| 1:18 (×3) | 5.7–7.8s | 4.6–13.2s | 8.1–12.2s | 21–33s |
| 9:46 (×2) | 7.2–7.6s | **6.6–7.6s** | 15–20s | 29–36s |

**The pipeline takes 21–36 s regardless of recording length.** Gladia
transcribes at ~80× real time; its wall time is queue plus overhead, not audio.
Umar's 2:30 for a 21 MB / 5:44 WAV is **not explained** by these numbers — the
instrumentation below is what will explain it on his next real upload.

### What changed (all approved, all verified)

1. **Gemini thinking level → `low`.** Analysis 8–12 s → **4.4 s**, zero thinking
   tokens. Decisions, action items and their owners identical to `medium` across
   the comparison; quotes came back **2 instead of 3** on both `low` runs (n=2)
   against 3 on every `medium` run (n=5). Within the "2–5" the prompt asks for,
   but a real, small effect on quote recall. One constant to flip back:
   `THINKING_LEVEL` in `analyze-meeting`. Every job records which level ran.
2. **Free tier only.** Pro removed from the settings screen; the legacy Pro ids
   in `MODEL_FOR` now land on Flash. No model that costs money can be called.
   The 429 message names the reset (midnight Pacific).
3. **Stuck-job sweep.** `reap_stuck_meetings()` runs every five minutes via
   `pg_cron` and turns a stage that has run far past anything measured into a
   `failed` with a readable reason, so the retry button appears. Windows:
   uploaded 2 h, queued 5 min, transcribing 20 min, analyzing 5 min.
   `verify-reaper.mjs` plants a stuck row and waits for the sweep.
4. **Progress estimates from measurement.** Each stage carries a fixed part and
   a per-minute part; "taking longer than usual" fires at 2× the estimate.
5. **Every job records its own timing** — Gladia's `transcription_time` and
   audio length, Gemini's model, thinking level, wall time and token counts —
   on `processing_jobs`. The next performance question is a query.

### Free-tier reality, verified

- **Gemini 3.5 Flash on Umar's key: RPM 5, RPD 20.** Twenty meetings a day is
  the tightest limit in the stack. Nine of today's twenty were spent on
  benchmarks before the quota was known; that will not be repeated.
- **Gladia: 10 hours/month**, refreshing. About 35 minutes used across all
  testing.
- **Supabase free: 150 s function wall-clock** (analysis peaks ~20 s), and
  **5 GB egress/month** — each recording is downloaded once by Gladia, so
  ~100 max-size uploads a month before egress, not storage, is the ceiling.

### Long meetings

An hour fits under 50 MiB only as compressed audio at ≤ ~96 kbps (M4A/MP3 at
64 kbps ≈ 29 MB). WAV and video do not fit at any length that matters. The
transcript for an hour is ~55 KB / ~700 lines — under every guard. The 25-minute
near-cap test was **not run** (Umar's call, to save Gladia minutes).

### The seven browser checks — all confirmed by Umar, 2026-09-11

HEAR IT plays the real recording at the quote's moment; transcript lines seek;
naming both voices updates transcript, quotes and action items; Ask answers
from the real meeting and its citation opens and plays; a ticked item stays
ticked across refresh and sorts below the open ones; Markdown export carries
the real meeting with the given names; sign out and in keeps everything.

**M4 is complete.**

### A gap found while checking Owed

Owed defaults to **MINE** — action items whose speaker resolves to the
account. But nothing links a voice to the account: naming a speaker, even with
your own name, creates a `people` row whose id is never the user id. So
`MINE` is permanently empty for real uploads and only EVERYONE works. The
fixtures hid this by wiring `vp-sarah-chen` to the fixture user by hand.

Proposed fix, awaiting approval: every account gets a `people` row whose id
**is** the user id, created by `handle_new_user` and renamed with the account;
existing accounts backfilled by the same migration. Typing your own name on a
voice then merges into it and `MINE` works as the PRD promises.

### Still to do, in order

1. The `MINE` fix above, if approved.
2. Watch `processing_jobs` on Umar's next real upload: it will say where the
   2:30 went, and whether `low` keeps producing fewer quotes on real meetings.
3. Step 7 (M5): retention sweep on the same `pg_cron`, signed-URL refresh,
   discard-audio verification.

---

## Original pick-up notes (superseded above, kept for the record)

1. Get the anon key into `frontend/.env.local`, replacing `PASTE_THE_ANON_KEY_HERE`.

2. Check **Authentication → Providers → Email → "Confirm email"** in the
   dashboard. If it is on, the isolation test cannot create its two throwaway
   users and every signup needs a mailbox round-trip. Turn it off for now; turn
   it back on before real users exist.

3. Run the security test:

   ```bash
   node backend/scripts/isolation-test.mjs
   ```

   Ten checks, covering the whole of M0's list in one command: all twelve
   tables exist and are readable by their owner, **no table is readable by a
   signed-out client**, the `handle_new_user` trigger made both rows, the
   settings defaults match `DEFAULT_SETTINGS`, A can insert and read their own
   meeting, **B sees zero of A's meetings**, B cannot forge a row owned by A,
   and B cannot delete A's meeting.

   RLS is checked by behaviour rather than by reading `pg_class.relrowsecurity`,
   because a table can have the flag on and still leak if the policy is wrong —
   and the flag would not say so.

   If any fail, fix `backend/supabase/migrations/20260909184856_rls.sql` and re-push —
   never patch the database by hand.

4. Only then verify Step 3 by hand: sign up, change the analysis model, refresh,
   confirm it stuck; rename the account, refresh, confirm; sign out and back in.

5. Then Step 4 (M2a): `api/mappers.ts` grows the meeting mapper, plus
   `api/meetings.ts`, `useArchive.ts`, and `backend/supabase/seed.sql`.

---

## Decisions worth not relitigating

- **`people.unique (owner_id, lower(name))` is a unique index, not a table
  constraint.** Postgres cannot put an expression in a constraint. Same effect;
  the TRD's SQL as written would not run.

- **`src/api/rows.ts` is hand-written, not generated.** Generation needs a live
  project. If the row types and the migrations ever disagree, **the migration is
  the truth and `rows.ts` is the bug.**

- **The model lists in `settings.ts` were wrong** and have been replaced. The
  code shipped AssemblyAI + Claude options; PRD §5.8 specifies Gladia Solaria-3
  / Deepgram Nova-3 / Whisper Large-v3 and Gemini 3 Flash / 3.1 Flash-Lite / 2.5
  Pro. `DEFAULT_SETTINGS` now matches the `user_settings` column defaults
  exactly so the two cannot drift.

- **`account.id` is still `CURRENT_USER_ID`, deliberately.** `account.name` is
  genuinely from `profiles`, but the archive it indexes into is still
  `MOCK_MEETINGS`; swapping the id to the real UUID now would empty the Owed
  list rather than fill it. Both halves become the signed-in user's at Step 4.
  Commented in place in `App.tsx`.

- **The session gate lives in its own `Root` component**, not at the top of
  `AppShell`. `AppShell` is all hooks and React does not allow an early return
  above them. It also means the archive fully unmounts on sign-out, so no
  previous user's state survives into the next session.

- **`Auth.tsx` adds no CSS.** It is built from `upload-input`, `upload-error`,
  `hero__cta` and `divider-dashed` so the sign-in page looks like it was always
  there rather than like the screen added last.

- **The isolation test goes through the anon key, not service-role.** A
  service-role connection bypasses RLS entirely and would pass the test while
  the app leaked.

---

## Credentials still needed later

| Credential | Needed at | Where it goes |
|---|---|---|
| Supabase anon key | **Now** — Step 2 | `frontend/.env.local` |
| Gladia API key | **Set** | `supabase secrets set GLADIA_API_KEY=…` |
| Gemini API key | **Set** | `supabase secrets set GEMINI_API_KEY=…` |
| `WEBHOOK_SECRET` | **Set** | Generated locally, 32 random bytes |

Sign-ups: Gladia at https://app.gladia.io (480 free min/month, diarization
included). Gemini at https://aistudio.google.com/apikey (~15 req/min, 1,500/day).
Neither key ever enters the repo or the browser bundle.
