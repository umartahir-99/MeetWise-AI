# MeetWise AI — Technical Requirements Document

**Version:** 1.0
**Date:** 2026-09-08
**Companion documents:** [PRD.md](./PRD.md) · [SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md)

---

## Table of contents

1. [The shape of the system](#1-the-shape-of-the-system)
2. [How a request is received and processed](#2-how-a-request-is-received-and-processed)
3. [The idea that keeps this migration small](#3-the-idea-that-keeps-this-migration-small)
4. [Database schema](#4-database-schema)
5. [Row Level Security](#5-row-level-security)
6. [File storage](#6-file-storage)
7. [The Edge Functions](#7-the-edge-functions)
8. [Live status updates](#8-live-status-updates)
9. [Frontend changes](#9-frontend-changes)
10. [Risks and limits](#10-risks-and-limits)

---

## 1. The shape of the system

There are three parts and no server to maintain.

```
┌──────────────────────────────────────┐
│  BROWSER                             │
│  React 19 + Vite + Tailwind 4        │
│  (the app you already have)          │
└───────────────┬──────────────────────┘
                │  supabase-js
┌───────────────▼──────────────────────┐
│  SUPABASE                            │
│                                      │
│  Auth      — email + password        │
│  Postgres  — every meeting, every    │
│              line, every action item │
│  Storage   — the audio files         │
│  Realtime  — pushes status changes   │
│  Edge Fns  — 3 small Deno functions  │
└───────────────┬──────────────────────┘
                │  HTTPS
┌───────────────▼──────────────────────┐
│  OUTSIDE SERVICES                    │
│  Gladia   — speech to text           │
│  Gemini   — analysis                 │
└──────────────────────────────────────┘
```

### Decisions behind this shape

| Decision | Choice | Why |
|---|---|---|
| Tenancy | **Personal archive** | Every table has one owner. Every security rule is the same single comparison. A `workspace_id` column can be added later without a rewrite. |
| Compute | **Edge Functions + webhooks** | Transcription takes minutes. No web request may live that long, so the work is handed off and the answer arrives later. Nothing runs 24/7, so nothing costs money while idle. |
| Auth | **Email + password** | No third-party setup, works locally, easy to test with two accounts. |
| AI | **Real from the start** | The hard problems — long audio, diarization quality, cost — are found while the design can still change. |
| Providers | **Gladia + Gemini** | Both have genuinely free ongoing tiers (not a one-time trial credit): Gladia gives 480 min/month with diarization included; Gemini Flash gives ~15 requests/min and 1,500/day. AssemblyAI and Claude are drop-in paid alternatives later if the free ceilings become the actual constraint. |

---

## 2. How a request is received and processed

**The one rule that explains the whole design: nothing waits.**

Transcribing a 45-minute recording takes minutes. A browser request cannot stay open that long,
and neither can an Edge Function. So the work is *handed off*, and the result comes back later
through a different door.

### The upload journey, step by step

```
STEP 1  ── Browser
   You pick a file. validateFile() checks the type, the size and that it
   is not empty. This runs locally and does not change.

STEP 2  ── Browser → Postgres
   Insert one row into `meetings` with status = 'uploaded'.
   The database returns the new meeting id.

STEP 3  ── Browser → Storage
   Upload the file DIRECTLY to Supabase Storage at
   recordings/{user_id}/{meeting_id}/{filename}
   It does not pass through any function or server. Your browser talks to
   storage, and storage checks the rules itself.

STEP 4  ── Browser → Edge Function `start-processing`
   Send just the meeting id. The function:
     a. checks you actually own that meeting
     b. creates a short-lived signed URL for the audio
     c. POSTs to Gladia's /v2/pre-recorded with that URL, diarization on,
        and a callback_config pointing at our webhook
     d. saves the returned transcription id into `processing_jobs`
     e. sets status = 'transcribing'
     f. RETURNS IMMEDIATELY — in well under a second

STEP 5  ── Browser
   The Processing screen is already subscribed to that meeting row over
   Realtime. From here on, the progress bar moves because the DATABASE
   moved. There is no timer anywhere.

        ...  minutes pass  ...

STEP 6  ── Gladia → Edge Function `transcription-webhook`
   Gladia calls YOU when it is finished, POSTing the transcription id.
   The function:
     a. checks that id matches a job we actually created in
        `processing_jobs` — an id we never issued is ignored outright
     b. calls Gladia's GET /v2/transcription/{id} ourselves, with our own
        key, to fetch the real result — the incoming call is a doorbell,
        not the data
     c. writes `meeting_speakers` (one row per voice found)
     d. writes `transcript_lines` (one row per sentence, with start and end)
     e. sets status = 'analyzing'
     f. returns 200 straight away, so Gladia does not retry

STEP 7  ── Postgres → Edge Function `analyze-meeting`
   A database webhook watches for status becoming 'analyzing' and fires
   this function. It:
     a. reads the transcript back out
     b. sends it to Gemini with a response schema, so the reply is
        already structured JSON rather than something to parse out of
        prose
     c. writes topics, decisions, action_items, quotes, gist, summary, tags
     d. deletes the audio file if "discard audio" is switched on
     e. sets status = 'ready'

STEP 8  ── Browser
   Realtime delivers status = 'ready'. The app refetches the meeting,
   fully populated. Done.
```

### Why a separate function for step 7

The webhook in step 6 must answer Gladia fast. If it also waited for Gemini to read a
45-minute transcript, Gladia would time out and retry, and you would analyse the same
meeting three times. Splitting them means each function does one job and finishes quickly.

### When something goes wrong

Any step that fails writes three fields to the meeting:

```sql
status         = 'failed'
failed_stage   = 'transcribing'   -- where it died
failure_reason = 'No speech detected in the first 90 seconds.'
```

These are **the exact fields the existing failure screen already reads**. No UI work is needed
to make real failures display correctly — the screen was built for them.

A retry sets status back to `'queued'`, clears those two fields, and calls `start-processing`
again. The audio is still in storage, which is why the screen can truthfully promise that
retrying reuses the same upload.

### Reading a meeting

Much simpler. One request:

```ts
supabase.from('meetings').select(`
  *,
  meeting_speakers(*),
  transcript_lines(*),
  topics(*),
  decisions(*),
  action_items(*),
  quotes(*)
`).eq('id', meetingId).single()
```

Supabase turns that into a single round trip. Security is applied by the database itself, so
there is no "check the user owns this" code to write or forget.

---

## 3. The idea that keeps this migration small

**The `Meeting` TypeScript interface is already a good API contract.**

Look at what `frontend/src/mockData.ts` already does right:

- `startedAt` is a real ISO timestamp, not a display string
- `durationMs` and every transcript offset are numbers in milliseconds
- `status` is a proper six-value enum
- speakers are referenced by slot id, and names are resolved separately

That is what an API would return anyway. So the backend's job is not to design a new shape —
it is to **produce that exact shape from database rows.**

One file does that: `frontend/src/api/mappers.ts`. If it returns a valid `Meeting`, then all of
this needs **zero changes**:

`Archive.tsx` · `Home.tsx` · `Ask.tsx` · `Commitments.tsx` · `MeetingDetail.tsx` ·
`SpeakerPanel.tsx` · `AudioPlayer.tsx` · `retrieval.ts` · `commitments.ts` · `speakers.ts` ·
`exportArchive.ts` · `datetime.ts`

That is roughly 3,000 lines of working, tested logic that the backend does not get to break.

---

## 4. Database schema

### Why normalized tables and not JSON blobs

The simplest option would be storing topics, decisions and the transcript as JSON columns on the
meeting. Three specific reasons not to:

1. **Action items need a stable id.** The current code ticks an item off by its *position in an
   array* (`App.tsx:236-249`). That breaks the moment anything reorders. A row id fixes it
   permanently.
2. **Citations point at transcript lines.** A citation is a real thing — a line, a speaker, a
   millisecond. It deserves a row.
3. **Search lives here later.** Postgres full-text search, and eventually `pgvector` for
   semantic search, both need transcript lines as rows.

### The enum

```sql
create type meeting_status as enum (
  'uploaded', 'queued', 'transcribing', 'analyzing', 'ready', 'failed'
);
```

Exactly the six values in `MeetingStatus`. No more, no fewer.

### Tables

```sql
-- Who you are. One row per signed-in user.
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null default 'You',
  created_at    timestamptz not null default now()
);

-- Everyone you know. Replaces MOCK_USERS.
create table people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, lower(name))     -- typing a known name merges, never duplicates
);

-- Which voice belongs to which person. Replaces VoiceDirectory.
create table voices (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  voice_print text not null,
  person_id   uuid references people on delete set null,   -- null = not named yet
  created_at  timestamptz not null default now(),
  unique (owner_id, voice_print)
);

-- The archive.
create table meetings (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users on delete cascade,

  title               text not null,
  started_at          timestamptz not null,
  duration_ms         bigint not null default 0,
  status              meeting_status not null default 'uploaded',

  gist                text not null default '',
  summary             text not null default '',
  tags                text[] not null default '{}',

  -- Where the file lives in Storage. NOT a URL: URLs expire, paths do not.
  audio_path          text,
  source_file_name    text,
  source_file_size    bigint,
  source_duration_sec double precision,

  uploaded_at         timestamptz,
  stage_started_at    timestamptz,
  failed_stage        meeting_status,
  failure_reason      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on meetings (owner_id, started_at desc);
create index on meetings (owner_id, status);

-- The voices found in one recording. 'speaker-1', 'speaker-2', ...
create table meeting_speakers (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings on delete cascade,
  owner_id    uuid not null references auth.users on delete cascade,
  slot_id     text not null,
  label       text not null,               -- 'Speaker 1'
  voice_print text not null,
  position    int  not null default 0,
  unique (meeting_id, slot_id)
);

-- The transcript, one row per line.
create table transcript_lines (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings on delete cascade,
  owner_id     uuid not null references auth.users on delete cascade,
  speaker_slot text   not null,
  text         text   not null,
  start_ms     bigint not null,
  end_ms       bigint not null
);
create index on transcript_lines (meeting_id, start_ms);

create table topics (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  title      text not null,
  details    text not null,
  position   int  not null default 0
);

create table decisions (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  text       text not null,
  position   int  not null default 0
);

create table action_items (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings on delete cascade,
  owner_id     uuid not null references auth.users on delete cascade,
  item         text not null,
  speaker_slot text not null,
  done         boolean not null default false,
  done_at      timestamptz,
  position     int  not null default 0
);
create index on action_items (owner_id, done);

create table quotes (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings on delete cascade,
  owner_id     uuid not null references auth.users on delete cascade,
  quote        text   not null,
  speaker_slot text   not null,
  start_ms     bigint not null,
  position     int    not null default 0
);

-- Mirrors AppSettings exactly. Defaults ARE DEFAULT_SETTINGS.
create table user_settings (
  user_id                        uuid primary key references auth.users on delete cascade,
  transcription_model            text    not null default 'gladia-solaria-3',
  analysis_model                 text    not null default 'gemini-3-flash',
  language                       text    not null default 'auto',
  retention_days                 int     not null default 0,
  discard_audio_after_processing boolean not null default false
);

-- Lets a webhook find its way back to the right meeting.
create table processing_jobs (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references meetings on delete cascade,
  owner_id        uuid not null references auth.users on delete cascade,
  provider        text not null,            -- 'gladia'
  provider_job_id text,
  stage           meeting_status not null,
  attempts        int  not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on processing_jobs (provider_job_id);
```

### Why `owner_id` is repeated on every child table

It looks redundant — a transcript line already belongs to a meeting, and the meeting has an
owner. But carrying the owner directly means every security rule is one comparison instead of a
join back to `meetings`. Simpler rules are harder to get wrong, and they are faster.

### New user setup

```sql
create function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id) values (new.id);
  insert into user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

`DEFAULT_SETTINGS` from `settings.ts` becomes the column defaults, so the two can never drift.

---

## 5. Row Level Security

This is the most important section in the document. Get it wrong and one user reads another
user's meetings.

Turn it on for every table, with no exceptions:

```sql
alter table profiles         enable row level security;
alter table people           enable row level security;
alter table voices           enable row level security;
alter table meetings         enable row level security;
alter table meeting_speakers enable row level security;
alter table transcript_lines enable row level security;
alter table topics           enable row level security;
alter table decisions        enable row level security;
alter table action_items     enable row level security;
alter table quotes           enable row level security;
alter table user_settings    enable row level security;
alter table processing_jobs  enable row level security;
```

Then one policy per table, all the same shape:

```sql
create policy "own rows" on meetings
  for all
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
```

Repeat for every table. `profiles` and `user_settings` compare on `id` / `user_id` instead.

Three notes:

- **`for all`** covers select, insert, update and delete in one policy. Fewer policies, fewer
  gaps.
- **`(select auth.uid())`** rather than bare `auth.uid()` — Postgres evaluates the subquery once
  instead of once per row. On a long transcript this matters a lot.
- **`with check`** stops somebody inserting a row owned by someone else. `using` alone only
  controls reading.

**Edge Functions bypass all of this** when they use the service-role key, which is exactly why
they must check ownership themselves before doing anything.

---

## 6. File storage

One private bucket, `recordings`.

**Path:** `{user_id}/{meeting_id}/{filename}`

The user id goes first on purpose — it makes the storage policy a simple prefix check:

```sql
create policy "own files" on storage.objects
  for all
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

**Playing audio back.** The bucket is private, so there is no permanent URL. When a meeting is
opened, ask for a signed URL that expires in an hour and put it in `Meeting.audioUrl`. The
player already handles this field, so nothing in the UI changes.

**Discarding audio.** When "discard audio after processing" is on, `analyze-meeting` deletes the
object and sets `audio_path = null`. The player then falls back to narration by itself, because
that fallback already exists and keys off exactly this.

---

## 7. The Edge Functions

Three functions, in `backend/supabase/functions/`. All in TypeScript on Deno.

### 7.1 `start-processing`

| | |
|---|---|
| **Called by** | The browser, with the user's login token |
| **Input** | `{ meetingId }` |
| **Returns** | `202` immediately |

Steps:

1. Read the user from the token. Reject if there is no token.
2. Load the meeting **and confirm `owner_id` matches**. This is not optional — the function uses
   the service-role key, so the database will not check for you.
3. Load `user_settings` for the chosen model and language.
4. Create a signed URL for `audio_path`, valid a few hours.
5. POST to Gladia's `/v2/pre-recorded` with that URL as `audio_url`, `diarization: true`, the
   language, and `callback_config: { url: "<transcription-webhook URL>?key=<WEBHOOK_SECRET>",
   method: "POST" }`. Gladia's callback has no signing of its own, so the secret riding in the
   URL's query string is what makes the call ours to trust — see 7.2 step 1.
6. Insert a `processing_jobs` row holding the returned `id` (Gladia calls it the transcription
   id — this is `provider_job_id`).
7. Set the meeting to `transcribing` with `stage_started_at = now()`.
8. Return.

Any failure sets `status = 'failed'` with a reason a person can read, and still returns cleanly.

### 7.2 `transcription-webhook`

| | |
|---|---|
| **Called by** | Gladia, with no login token |
| **Input** | `{ id }` — just the transcription id. Gladia's webhook is a doorbell, not a payload; the real result is fetched separately in step 3. |
| **Returns** | `200` fast |

This one is public, so it must defend itself:

1. Compare the `key` query parameter against the stored `WEBHOOK_SECRET`.
2. Look up `processing_jobs` by `provider_job_id`. **If there is no matching row, stop.** A
   webhook for a job we never created is not ours.
3. Call Gladia's `GET /v2/transcription/{id}` ourselves, with our own `x-gladia-key` header, to
   fetch the actual transcript. Never trust a payload we didn't fetch ourselves.
4. If the result reports an error, mark the meeting failed with its message and return.
5. Gladia returns numeric speaker indices (`0`, `1`, `2`…), not letters. Map them to slots
   (`speaker-1`, `speaker-2`) and insert `meeting_speakers`. See
   [risk 1](#101-cross-meeting-voice-identity-is-not-free) about `voice_print`.
6. Bulk-insert `transcript_lines`. **Gladia's utterance times are in seconds as floats** —
   multiply by 1000 when writing `start_ms` / `end_ms`. Miss this and every citation and
   audio-jump in the app is off by a factor of 1000.
7. Set status to `analyzing`.
8. Return 200.

### 7.3 `analyze-meeting`

| | |
|---|---|
| **Called by** | A database webhook, when status becomes `analyzing` |
| **Input** | `{ meetingId }` |
| **Returns** | `200` when written |

1. Read the transcript back, with speaker slots attached.
2. Call Gemini with the model from `user_settings`, using `generateContent` with
   `responseMimeType: "application/json"` and a **`responseSchema`** describing the exact shape
   below — this constrains the output directly rather than asking nicely and parsing prose.
3. The requested shape mirrors the existing types exactly:

   ```
   gist         : one sentence
   summary      : one paragraph
   topics       : [{ title, details }]
   decisions    : [ text ]
   actionItems  : [{ item, speakerSlot }]
   quotes       : [{ quote, speakerSlot, startMs }]
   tags         : [ text ]
   ```

4. Every `speakerSlot` returned must exist in `meeting_speakers`; drop anything that does not.
   Every `startMs` on a quote must land inside a real transcript line — that contract is what
   makes a quote playable, and a made-up timestamp would break the citation click silently.
5. Insert all of it, then set status `ready`.
6. If `discard_audio_after_processing`, delete the file and null `audio_path`.

### Secrets

Set with `supabase secrets set`, never in the repository:

```
GLADIA_API_KEY
GEMINI_API_KEY
WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY   (provided automatically)
```

The frontend only ever sees `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, both of which are
safe to ship because RLS is what actually protects the data.

---

## 8. Live status updates

`useProcessingEngine.ts` is deleted and replaced by a subscription:

```ts
supabase
  .channel(`meeting:${meetingId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'meetings',
    filter: `id=eq.${meetingId}`,
  }, ({ new: row }) => {
    // status changed — update the screen, and refetch fully on 'ready'
  })
  .subscribe()
```

Realtime respects RLS, so a user can only ever subscribe to their own rows.

The Processing screen keeps its own 150 ms tick for the *smooth animation* of the bar between
updates. That is a rendering detail and stays. What changes is where the truth comes from: the
database, not a timer.

---

## 9. Frontend changes

### New files

| File | Purpose |
|---|---|
| `src/lib/supabase.ts` | The client, created once |
| `src/api/mappers.ts` | Database rows ↔ `Meeting` / `User` / `AppSettings`. **The file that protects every component.** |
| `src/api/meetings.ts` | List, read, create, update, delete |
| `src/api/voices.ts` | Name a voice, forget a voice, load the directory |
| `src/api/settings.ts` | Read and write settings |
| `src/api/storage.ts` | Upload a file, get a signed playback URL |
| `src/useArchive.ts` | Replaces `useState(MOCK_MEETINGS)` and `useProcessingEngine` |
| `src/components/Auth.tsx` | Sign up / sign in screen |

These follow the existing convention: plain modules with no React in them, the same way
`processing.ts`, `retrieval.ts`, `commitments.ts` and `speakers.ts` are already written.

### Changed files

**`App.tsx`** — the state source changes, the handler signatures do not:

```ts
// before
const [meetings, setMeetings] = useState<Meeting[]>(MOCK_MEETINGS);

// after
const { meetings, loading, refresh } = useArchive();
```

Every handler (`handleNameVoice`, `handleToggleActionItem`, `handlePurgeExpired`, …) keeps its
name and arguments and gains an `await` on a database call. One exception:
`handleToggleActionItem(meetingId, index)` becomes `handleToggleActionItem(actionItemId)`,
because rows have ids and array positions are fragile.

**`Upload.tsx`** — submit now inserts a row, uploads the file, then calls `start-processing`.
Validation is untouched.

**`Settings.tsx`** — changes write to `user_settings`.

### Deleted, once milestone M4 lands

- `src/useProcessingEngine.ts` — the fake job runner, in full
- `MOCK_UPLOAD_ANALYSIS` — the canned result every upload currently gets
- `plannedFailure()` and the `Meeting.sim` field — the "fail" filename trick
- `MOCK_QUESTIONS` — canned Ask answers, once real content exists

`mockData.ts` **keeps every type**. Only the fixtures leave, into a seed script for local
development.

### Untouched

`retrieval.ts`, `commitments.ts`, `speakers.ts`, `exportArchive.ts`, `datetime.ts`, `motion.ts`,
`easing.ts`, `useSmoothScroll.ts`, `useMeetingAudio.ts`, and every presentational component.

---

## 10. Risks and limits

### 10.1 Cross-meeting voice identity is not free

**This is the most important limitation in the project, and it affects the headline feature.**

The PRD promises: *name a voice once, and it is named in every meeting.* Today that works
because the sample data ships with hardcoded fingerprints like `vp-sarah-chen`.

Real speech-to-text does not give you that. Gladia's diarization returns **per-file labels**
— numeric indices, speaker 0, speaker 1 — and speaker 0 in Monday's recording has no connection
at all to speaker 0 in Tuesday's. There is no fingerprint that survives across files.

**What this means in practice.** At milestone M4, naming works perfectly *within* one meeting,
and you will name people again in the next recording. The retroactive magic does not appear on
its own.

**The options, honestly:**

| Option | Cost | Result |
|---|---|---|
| Accept per-meeting naming for now | Free | Feature degraded, promise unmet |
| Add a speaker-embedding step (pyannote, Azure Speaker Recognition), store vectors in `pgvector`, match new voices against known ones | An extra service, extra cost, tuning a similarity threshold | The promise actually kept |

**Recommendation:** ship M4 with per-meeting naming, keep `voice_print` in the schema (a
deterministic value per meeting slot), and add real matching as milestone M6. Say plainly in the
interface that naming applies to this recording until then — the app's existing habit of
labelling what is real is worth continuing.

### 10.2 2 GB uploads need resumable upload

`MAX_UPLOAD_BYTES` is 2 GB — raised from an earlier 500 MB once real recording sizes were
checked against it. Video exports (MP4, MOV, WEBM) and uncompressed audio (WAV) both blow past
500 MB well before the 100-minute mark; 2 GB comfortably covers a 2-hour video meeting at
typical export quality. The standard `supabase.storage.upload()` call is meant for much smaller
files, and the project has its own file-size ceiling that must be raised to match.

**Fix:** raise the limit in project settings, and use the resumable (TUS) upload endpoint for
anything large. It also gives real progress, which is more honest than a fake bar.

The Upload screen also nudges toward audio-only exports for long meetings — smaller file,
faster upload, identical transcription result, since only the audio track is ever used. It's a
suggestion, not an enforced format restriction.

### 10.3 Edge Functions have a time limit

Gemini reading a 45-minute transcript can take a while, and functions are not allowed to run
forever.

**Mitigations, in order:**

1. Splitting the webhook from the analysis, which the design already does.
2. Sending Gemini the transcript as compact text, not verbose JSON.
3. For very long meetings, analysing in chunks and merging.
4. Sonnet instead of Opus, which is both faster and much cheaper.

### 10.4 The webhook is a public door

`transcription-webhook` runs without a login token, because Gladia does not have one.

**Defences, all three required:** verify the shared secret; confirm the `provider_job_id` exists
in `processing_jobs`; never trust a meeting id sent in the body — always look it up from the job
row.

### 10.5 Cost is now real

Every upload costs money: transcription is charged per hour of audio, and analysis per token.
Worth adding early, before a bug becomes an invoice:

- A per-user monthly minutes cap.
- Rejecting files over a sensible length.
- Recording actual token counts on `processing_jobs`, so cost per meeting is visible.

### 10.6 What happens on a page refresh mid-processing

Nothing bad, and this is a genuine improvement over today. The job lives in the database, not the
tab. Close the browser during transcription, come back an hour later, and the meeting is ready.
The Processing screen's existing promise — *"YOU CAN LEAVE THIS PAGE — PROCESSING CONTINUES"* —
becomes true for the first time.

---

**Next:** [SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md) — the order to build it in.
