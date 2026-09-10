# MeetWise AI — Backend migration progress

**Last worked:** 2026-09-10
**Branch:** `backend/supabase-migration`
**Companion documents:** [PRD.md](./PRD.md) · [TRD.md](./TRD.md) · [SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md)

This file is the resume point. It records what is done, what is half-done, what
is blocked and on whom, and the exact next command to run.

---

## The nine steps

| Step | Milestone | State |
|---|---|---|
| 1 | M0a — scaffolding and migration files | **Done** |
| 2 | M0b — link, push, prove security | **Blocked** — needs the anon key |
| 3 | M1 — sign in, settings persist | **Code written, never run** |
| 4 | M2a — archive reads from the database | Not started |
| 5 | M2b/c — writes persist | Not started |
| 6 | M3 — real uploads, Realtime status | Not started |
| 7 | M4 — Gladia + Gemini, real AI | Not started — needs both API keys |
| 8 | M5 — retention, audio housekeeping | Not started |
| 9 | M6 — cross-meeting voice identity (optional) | Not started |

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
- `scripts/isolation-test.mjs`

### Verified against the live database

Run on 2026-09-10 with `supabase gen types typescript --linked`, which reads the
real schema and needs only the CLI login:

- **All twelve tables exist** in the project.
- **The `meeting_status` enum has exactly the six values** `MeetingStatus` does.
- **All twelve interfaces in `rows.ts` match their table column-for-column.**
  `scripts/verify-schema.mjs` re-runs this check; it caught `ProcessingJobRow`
  missing entirely, which is now added.

### Not done — do not assume otherwise

- **The M0 security test has never run.** The plan calls it the single most
  important test in the whole build and says not to move past it. It has not
  passed, because it has not executed. Table existence is confirmed, but
  *whether RLS actually keeps one user out of another's rows is not*.
- `supabase db reset --linked` has never run, so "the files alone can rebuild
  the database" is proven only for a one-shot push onto an empty project, not
  repeatably.
- RLS enforcement is unconfirmed. The policies are in the migration and the
  migration applied, but nothing has tried to read another user's rows.

---

## The one thing blocking everything

`frontend/.env.local` needs a real `VITE_SUPABASE_ANON_KEY`.

The file exists with the correct URL and a placeholder key. An earlier attempt
put the **project ref** in the key field; those are different strings, and a
`curl` against the REST endpoint with it returned `401 Invalid API key`. The
correct value comes from **Project Settings → API**, and is long — either a JWT
starting `eyJ...` or a string starting `sb_publishable_...`.

The anon key is safe to share and safe to commit-adjacent: it ships inside the
browser bundle on every page load. RLS is what protects the data, not that key.

### Three commands were blocked by the permission classifier

Not worked around, deliberately. Any of these needs either the user to run it or
a Bash permission rule in `.claude/settings.json`:

| Command | Wanted for |
|---|---|
| `supabase projects api-keys --project-ref wvvexjktntliwkrwhohk` | Reading the anon key |
| `supabase db reset --linked` | The rebuild-from-files proof |
| `supabase inspect db …` | Read-only table and RLS confirmation |

---

## Pick up here tomorrow

1. Get the anon key into `frontend/.env.local`, replacing `PASTE_THE_ANON_KEY_HERE`.

2. Check **Authentication → Providers → Email → "Confirm email"** in the
   dashboard. If it is on, the isolation test cannot create its two throwaway
   users and every signup needs a mailbox round-trip. Turn it off for now; turn
   it back on before real users exist.

3. Run the security test:

   ```bash
   node scripts/isolation-test.mjs
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

   If any fail, fix `supabase/migrations/20260909184856_rls.sql` and re-push —
   never patch the database by hand.

4. Only then verify Step 3 by hand: sign up, change the analysis model, refresh,
   confirm it stuck; rename the account, refresh, confirm; sign out and back in.

5. Then Step 4 (M2a): `api/mappers.ts` grows the meeting mapper, plus
   `api/meetings.ts`, `useArchive.ts`, and `supabase/seed.sql`.

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
| Gladia API key | Step 7 (M4) | `supabase secrets set GLADIA_API_KEY=…` |
| Gemini API key | Step 7 (M4) | `supabase secrets set GEMINI_API_KEY=…` |
| `WEBHOOK_SECRET` | Step 7 (M4) | Generated locally, no account needed |

Sign-ups: Gladia at https://app.gladia.io (480 free min/month, diarization
included). Gemini at https://aistudio.google.com/apikey (~15 req/min, 1,500/day).
Neither key ever enters the repo or the browser bundle.
