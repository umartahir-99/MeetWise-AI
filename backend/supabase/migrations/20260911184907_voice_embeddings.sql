-- Voices that survive the recording they were heard in.
--
-- Diarization labels are per file: speaker-1 in Monday's recording has no
-- connection to speaker-1 in Tuesday's. The headline promise - name a voice
-- once and it is named everywhere - needs something that does connect them: a
-- voice embedding, a vector that lands close to itself across recordings and
-- far from anybody else.
--
-- This is the half of that feature the database owns. Where the vectors come
-- from is the other half (a speaker-verification model run in the browser, so
-- nothing costs money); this holds them, compares them, and records what was
-- matched so a person can see it and undo it. Never a silent merge - TRD 10.1.

create extension if not exists vector with schema extensions;

-- 512 dimensions: the x-vector size of WavLM-base-plus-sv, the model chosen
-- because it runs in a browser. A different model means a different size and
-- a new column, not a resize.
alter table meeting_speakers
  add column embedding extensions.vector(512);

-- Cosine distance, which is what speaker embeddings are compared by.
create index meeting_speakers_embedding_idx
  on meeting_speakers using hnsw (embedding extensions.vector_cosine_ops);

-- When a voice was named by a match rather than by a person, say so - which
-- voice it matched and how confidently - so the panel can show "matched to
-- Sarah Chen (91%) - not them?" and a click can undo it.
alter table voices
  add column matched_from_voice_print text,
  add column match_score double precision;

comment on column voices.match_score is
  'Cosine similarity that produced this link, 0..1. Null when a person typed the name.';

/**
 * The best-matching named voice for an embedding, if any clears the bar.
 *
 * Runs as the caller, so row level security scopes it to their own voices
 * without a filter here to forget. Only voices that already have a person
 * are candidates: an unnamed voice matching another unnamed voice is a fact
 * worth knowing later, but not a name.
 */
create or replace function match_voice(
  query extensions.vector(512),
  min_score double precision default 0.75
) returns table (
  voice_print text,
  person_id uuid,
  score double precision
)
language sql stable security invoker set search_path = public, extensions as $$
  select
    ms.voice_print,
    v.person_id,
    1 - (ms.embedding <=> query) as score
  from meeting_speakers ms
  join voices v on v.voice_print = ms.voice_print and v.owner_id = ms.owner_id
  where ms.embedding is not null
    and v.person_id is not null
    and 1 - (ms.embedding <=> query) >= min_score
  order by ms.embedding <=> query
  limit 1;
$$;
