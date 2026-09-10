-- MeetWise AI — core schema.
--
-- Normalized rather than JSON blobs for three reasons (TRD 4): an action item
-- needs a stable id to tick off, a citation points at a real transcript line,
-- and search will eventually live on those lines as rows.

-- Exactly the six values in MeetingStatus. No more, no fewer.
create type meeting_status as enum (
  'uploaded', 'queued', 'transcribing', 'analyzing', 'ready', 'failed'
);

-- Who you are. One row per signed-in user.
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default 'You',
  created_at   timestamptz not null default now()
);

-- Everyone you know. Replaces MOCK_USERS.
create table people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
-- Typing a name that already exists merges into that person, never duplicates.
-- An expression can only be unique through an index, not a table constraint.
create unique index people_owner_name_key on people (owner_id, lower(name));

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
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,

  title       text not null,
  started_at  timestamptz not null,
  duration_ms bigint not null default 0,
  status      meeting_status not null default 'uploaded',

  gist    text   not null default '',
  summary text   not null default '',
  tags    text[] not null default '{}',

  -- Where the file lives in Storage. NOT a URL: URLs expire, paths do not.
  audio_path          text,
  source_file_name    text,
  source_file_size    bigint,
  source_duration_sec double precision,

  uploaded_at      timestamptz,
  stage_started_at timestamptz,
  failed_stage     meeting_status,
  failure_reason   text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_owner_started_idx on meetings (owner_id, started_at desc);
create index meetings_owner_status_idx  on meetings (owner_id, status);

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
create index meeting_speakers_meeting_idx on meeting_speakers (meeting_id);

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
create index transcript_lines_meeting_start_idx on transcript_lines (meeting_id, start_ms);

create table topics (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  title      text not null,
  details    text not null,
  position   int  not null default 0
);
create index topics_meeting_idx on topics (meeting_id);

create table decisions (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  text       text not null,
  position   int  not null default 0
);
create index decisions_meeting_idx on decisions (meeting_id);

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
create index action_items_meeting_idx on action_items (meeting_id);
create index action_items_owner_done_idx on action_items (owner_id, done);

create table quotes (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings on delete cascade,
  owner_id     uuid not null references auth.users on delete cascade,
  quote        text   not null,
  speaker_slot text   not null,
  start_ms     bigint not null,
  position     int    not null default 0
);
create index quotes_meeting_idx on quotes (meeting_id);

-- Mirrors AppSettings exactly. Defaults ARE DEFAULT_SETTINGS, so the two
-- cannot drift.
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
create index processing_jobs_provider_job_idx on processing_jobs (provider_job_id);
create index processing_jobs_meeting_idx on processing_jobs (meeting_id);
