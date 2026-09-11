-- Where the time went, on every job.
--
-- The pipeline was tuned once by running benchmarks and reading status
-- transitions off the wire. That cost Gemini requests against a daily quota of
-- twenty. From here every real upload records its own breakdown, so the next
-- performance question is answered by a query rather than by spending quota.
--
-- Two sources. Gladia reports how long it actually spent transcribing and how
-- long the audio was; Gemini reports token counts, including the thinking
-- tokens that decide both latency and quota. The timestamps bracket each stage
-- from the function's own clock.

alter table processing_jobs
  add column audio_seconds            double precision,   -- Gladia: metadata.audio_duration
  add column transcription_seconds    double precision,   -- Gladia: metadata.transcription_time
  add column transcribing_started_at  timestamptz,
  add column transcribing_finished_at timestamptz,
  add column analysis_model           text,               -- the vendor id that actually answered
  add column analysis_thinking        text,               -- thinking level sent, e.g. 'low'
  add column analysis_started_at      timestamptz,
  add column analysis_finished_at     timestamptz,
  add column analysis_total_tokens    integer,
  add column analysis_thinking_tokens integer;

comment on column processing_jobs.transcription_seconds is
  'Seconds Gladia reports spending on the transcription itself, excluding its queue.';
comment on column processing_jobs.analysis_thinking_tokens is
  'Tokens the model spent thinking before answering. Counts against quota and adds latency.';
