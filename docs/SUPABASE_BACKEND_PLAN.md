# MeetWise AI — Supabase Backend Build Plan

**The order to build it in.** Each milestone leaves the app working. You never have a week where
nothing runs.

**Companion documents:** [PRD.md](./PRD.md) · [TRD.md](./TRD.md)

---

## Before you start

### What you need

| Thing | Why | Cost |
|---|---|---|
| A Supabase account | Database, auth, storage, functions | Free tier is enough to build on |
| A Gladia API key | Speech to text, diarization included | Free — 480 min/month, ongoing |
| A Gemini API key | Analysis | Free — ~15 requests/min, 1,500/day, ongoing |

No Docker in this version of the plan — every step below runs directly against your cloud
Supabase project instead of a local copy. See M0 for what that trades away and what it saves you.

### The folder layout you are heading towards

```
MeetWiseAi/
├── frontend/            ← already exists, mostly unchanged
├── supabase/            ← new
│   ├── config.toml
│   ├── migrations/      ← the SQL that builds the database
│   ├── functions/
│   │   ├── start-processing/
│   │   ├── transcription-webhook/
│   │   └── analyze-meeting/
│   └── seed.sql         ← the sample meetings, seeded into the cloud project
└── docs/                ← these three documents
```

### One rule to follow the whole way

**Never write SQL directly into the dashboard.** Always write a migration file. The dashboard is
for looking, not for changing. If the database is only ever built from files, you can throw it
away and rebuild it in ten seconds — and you will want to, often.

---

## M0 — Set the ground up

**Goal:** the schema and security in place on your real cloud project, with the full undo
button proven to work — and no application code changed yet.

### What skipping Docker actually trades away

Every command below runs against your real, hosted project instead of a disposable local copy.
That has one real cost and one real benefit, both worth knowing before you start:

- **The cost:** there's no free "break it and restart in ten seconds" sandbox. Mistakes land on
  the same project your app will eventually run on — though since it's empty and free-tier,
  that's a low-stakes place to make them.
- **The benefit that shows up later:** in M4, Edge Functions deployed to the cloud already have
  a real public HTTPS address the moment they're deployed. Testing webhooks needs no tunnel —
  no ngrok, no local port to expose. That's a step the Docker version of this plan would have
  needed and this one doesn't.

### Steps

```bash
cd C:/Users/DELL/Desktop/MeetWiseAi
npm install -g supabase        # or: npx supabase
supabase init
supabase login
supabase link --project-ref <your-project-ref>   # found in Project Settings → General
```

Then create the schema, in this order, as separate migration files:

```bash
supabase migration new schema        # tables and the enum
supabase migration new rls           # row level security
supabase migration new storage       # the recordings bucket and its policies
supabase migration new triggers      # new-user setup, updated_at
```

Copy the SQL from [TRD section 4](./TRD.md#4-database-schema) and
[section 5](./TRD.md#5-row-level-security) into them.

Then apply them, and prove the files are complete by rebuilding from scratch:

```bash
supabase db push          # first time, applies cleanly to an empty project
supabase db reset --linked   # wipes the public schema and reapplies every migration + seed
```

`--linked` is the remote equivalent of the local `db reset` — it drops everything you created in
the `public` schema and rebuilds it purely from the files in `supabase/migrations/`, which is
the whole point: if the files can't rebuild it, the files are wrong.

### How to know it worked

- [ ] `supabase db reset --linked` finishes with no errors, from an empty project
- [ ] All twelve tables exist in your project's dashboard, under **Table Editor**
- [ ] Every table shows RLS **enabled**
- [ ] **The security test.** Create two users in the dashboard's **Authentication** panel. Sign
      in as user A, insert a meeting. Sign in as user B and run `select * from meetings` in the
      SQL editor. **You must get zero rows.**

That last check is the single most important test in this entire plan. Do not move on until it
passes.

### What usually goes wrong

- *`supabase link` asks for a database password* — this is the one you set when the project was
  created, not your Supabase account password. Reset it from Project Settings → Database if
  you've lost it.
- *A migration fails halfway* — fix the file and run `supabase db reset --linked` again. Never
  patch by hand; the file is the truth.
- *`db reset --linked` prompts a confirmation* — read it before answering. It only clears the
  `public` schema (auth, storage-metadata, and extensions are untouched), and it does **not**
  delete files already sitting in a storage bucket — those need clearing separately if you're
  iterating on the `recordings` bucket itself.
- *User B can see user A's rows* — you enabled RLS but forgot the policy, or you wrote `using`
  without `with check`. Go back to [TRD section 5](./TRD.md#5-row-level-security).

---

## M1 — Sign in

**Goal:** a real account, and settings that survive a refresh.

### Steps

1. `cd frontend && npm install @supabase/supabase-js`
2. Create `frontend/.env.local` (already git-ignored), using the values from your project's
   dashboard under **Project Settings → API** — not a `supabase start` output, since there is
   no local instance in this version of the plan:

   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<the anon/public key from the same page>
   ```

3. Write `src/lib/supabase.ts` — one client, created once.
4. Write `src/components/Auth.tsx` — email and password, sign up and sign in. **Match the
   existing design:** walnut background, cream text, ember accent, uppercase tracked labels. It
   should look like it was always there.
5. In `App.tsx`, show `Auth` when there is no session and the app when there is. Listen to
   `onAuthStateChange`.
6. Write `src/api/settings.ts` and point `Settings.tsx` at it.
7. Replace the hardcoded `CURRENT_USER_ID` with the real user id, and the account name with
   `profiles.display_name`.

### How to know it worked

- [ ] Sign up creates rows in `profiles` **and** `user_settings` automatically (the trigger)
- [ ] Change the analysis model, refresh the page — it is still changed
- [ ] Rename your account, refresh — still renamed
- [ ] Sign out and back in — your settings come back

### Note

Meetings are still `MOCK_MEETINGS` at this point. That is fine. One thing at a time.

---

## M2 — Read and write the archive

**Goal:** meetings live in the database. Ticking a box and naming a voice both persist.

This is the largest milestone. Take it in three parts.

### Part A — get data out

1. Write `src/api/mappers.ts`. **This is the most important file in the migration.** It converts
   database rows into exactly the `Meeting` shape the app already expects. Snake case becomes
   camel case, timestamps become ISO strings, child tables become arrays.
2. Write `src/api/meetings.ts` with the nested select from
   [TRD section 2](./TRD.md#reading-a-meeting).
3. Write `src/useArchive.ts` to load them.
4. In `App.tsx`, swap `useState(MOCK_MEETINGS)` for `useArchive()`.
5. Write `supabase/seed.sql` from the existing fixtures so you have something to look at.

**The test that proves the mapper is right:** the Archive, Home, Ask, Commitments and Meeting
Detail screens all work with **zero changes to their code**. If you find yourself editing a
component, the mapper is wrong — fix the mapper, not the component.

### Part B — write data back

- `src/api/voices.ts` — naming a voice creates a `people` row if the name is new, or reuses the
  existing person if it is not, then upserts into `voices`.
- Ticking an action item updates that row. **Change the handler to take the item's id instead of
  its array position.**
- Retention purge deletes real rows.
- "Delete all" clears the archive.

### Part C — check the real logic still works

Export, Ask, and the commitments rollup all read from the same `Meeting` objects, so they should
need nothing. Confirm each one.

### How to know it worked

- [ ] Tick an action item, refresh — still ticked
- [ ] Name a voice in one meeting, open another meeting that voice is in — the name is there
- [ ] Rename that voice — every meeting updates, including answers already on screen
- [ ] Ask a question and get an answer with working citations
- [ ] Export produces a file with real names, not internal ids
- [ ] User B still cannot see any of it

---

## M3 — Real uploads

**Goal:** the file actually goes somewhere, and the progress screen moves because the database
moved.

### Steps

1. In the Supabase dashboard, raise the file-size limit for the `recordings` bucket (see
   [TRD 10.2](./TRD.md#102-2-gb-uploads-need-resumable-upload)).
2. Write `src/api/storage.ts` — upload with progress, and a signed-URL helper for playback.
3. Change `Upload.tsx`'s submit: insert the meeting row, upload the file, then call
   `start-processing`. Leave every validation rule alone.
4. Write the `start-processing` function, but have it **stop after uploading** — do not call
   Gladia yet. Just set status to `queued`.
5. Add the Realtime subscription to the Processing screen.
6. Delete `useProcessingEngine.ts`, and with it `Meeting.sim` and `plannedFailure()`.

### How to know it worked

- [ ] Upload a file and see it in Storage under `{your-user-id}/{meeting-id}/`
- [ ] The meeting appears in the archive with status `queued`
- [ ] Change the status by hand in the dashboard — **the browser screen updates on its own**
- [ ] Refresh mid-upload — the meeting is still there, still in the right state
- [ ] Discard removes both the row and the stored file

That third check is the moment the fake pipeline is really gone.

---

## M4 — Real AI

**Goal:** upload a real recording, get a summary that is actually about it.

### Steps

1. Set the secrets:

   ```bash
   supabase secrets set GLADIA_API_KEY=...
   supabase secrets set GEMINI_API_KEY=...
   supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 32)
   ```

2. Finish `start-processing`: sign a URL, POST to Gladia's `/v2/pre-recorded` with
   `diarization: true` and a `callback_config` pointing at `transcription-webhook` with the
   webhook secret riding in the URL's query string, save the returned transcription id, set
   status `transcribing`.
3. Write `transcription-webhook`. **No tunnel needed** — the function is already deployed with
   a real public HTTPS address the moment you run `supabase functions deploy`, so give that URL
   to Gladia directly. This is the one step the Docker version of this plan would have needed
   ngrok for.
4. Write `analyze-meeting`. Call Gemini's `generateContent` with `responseMimeType:
   "application/json"` and a **`responseSchema`** so the reply is shaped, not parsed out of
   prose. Model comes from `user_settings`.
5. Add the database webhook that fires `analyze-meeting` when status becomes `analyzing`.
6. Delete `MOCK_UPLOAD_ANALYSIS`. It has no purpose now.

### How to know it worked

- [ ] Upload a **real 5-minute recording** of a real conversation
- [ ] Status walks: `uploaded → transcribing → analyzing → ready`, without a timer anywhere
- [ ] The transcript is what was actually said
- [ ] The summary, topics and decisions describe **that** meeting
- [ ] Speakers are separated correctly and can be named
- [ ] Clicking a quote's "HEAR IT" plays the right moment of the real audio
- [ ] Upload a silent file — it fails, with a reason you can read, and retry works

### What usually goes wrong

- *The webhook never arrives* — the URL in `callback_config` is stale, or the deployed function
  URL changed. Check Gladia's dashboard, which shows delivery attempts.
- *The webhook arrives but does nothing* — the `key` query parameter didn't match
  `WEBHOOK_SECRET`, or the transcription id didn't match any row in `processing_jobs`. Both fail
  silently by design; check the function's logs in the dashboard, not the response.
- *Gemini returns something unparseable* — you asked for JSON in the prompt instead of setting
  `responseSchema` in the generation config. Use the schema field, not the prompt.
- *Quote timestamps do not line up* — either the analysis invented them, or Gladia's
  seconds-as-floats never got multiplied into milliseconds during the webhook step. Validate
  every `startMs` against a real transcript line and drop the ones that do not fit, as described
  in [TRD 7.3](./TRD.md#73-analyze-meeting).

---

## M5 — Housekeeping

**Goal:** retention and audio handling work for real.

1. Enable `pg_cron`. Add a nightly job that deletes meetings past each user's retention window,
   and their stored files with them.
2. Honour "discard audio after processing" in `analyze-meeting`.
3. Generate signed playback URLs on demand, refreshing before they expire.
4. Add a database trigger to keep `meetings.updated_at` accurate.

**Verify:** set retention to 30 days, back-date a meeting, run the job, confirm the row **and**
the file are gone. Turn on discard-audio, process something, confirm the file is deleted and the
player falls back to narration by itself.

---

## M6 — Optional: voices across meetings

**Only after M5, and only if you want the headline feature to be fully true.**

Read [TRD 10.1](./TRD.md#101-cross-meeting-voice-identity-is-not-free) first — this is a real
piece of work, not a switch.

1. Enable `pgvector`. Add `embedding vector(192)` to `meeting_speakers`.
2. Add a speaker-embedding step (pyannote, or Azure Speaker Recognition) after transcription.
3. When a new voice appears, compare it against known ones. Above the similarity threshold,
   attach it to that person automatically. Below it, leave it unnamed for the user to decide.
4. Never auto-merge silently — show that it was matched, and let it be undone.

**Verify:** record two separate meetings with the same person. Name them in the first. They
should already be named in the second.

---

## Order at a glance

```
M0  ground      database + security          nothing visible changes
M1  auth        sign in, settings persist    login screen appears
M2  archive     meetings from the database   refresh stops erasing things
M3  upload      real files, live status      the fake pipeline is deleted
M4  AI          real transcripts + summaries the product becomes real
M5  cleanup     retention, audio, playback   it can be left running
M6  voices      cross-meeting identity       the headline promise is kept
```

Live Capture stays a labelled demo throughout all of it.

---

## Things worth doing early

**Keep two test accounts** and check the isolation between them after every milestone. Security
holes are cheap to fix on day one and expensive on day ninety.

**Run the checks after each milestone:**

```bash
cd frontend && npm run build && npx oxlint src/
```

**Commit each milestone separately.** `supabase db reset --linked` should always rebuild
everything from migration files alone.

**Watch the cost from M4.** Store the token counts and audio minutes on `processing_jobs` so you
can see what a meeting actually costs before the bill tells you.

---

## The final test

The product is real when this works:

1. Sign up with an email and password.
2. Upload a real recording of a real meeting.
3. Watch the progress move because real work is finishing.
4. Read a summary that is genuinely about that recording.
5. Put a name to each voice.
6. Ask the archive a question, get an answer with citations.
7. Click a citation, hear the real audio at the right second.
8. Tick off an action item.
9. Export the archive.
10. **Close the browser. Come back tomorrow. Everything is still there.**

Step 10 is the whole point.
