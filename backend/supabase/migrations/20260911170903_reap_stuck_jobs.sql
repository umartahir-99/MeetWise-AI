-- No job is ever lost.
--
-- A meeting moves through the pipeline because something external calls back:
-- Gladia's webhook, or the hand-off to analysis. If that call never arrives,
-- the row sits at `transcribing` or `analyzing` forever - not `failed`, so the
-- retry button never appears, and a recording that cost real minutes is stuck
-- behind a progress bar that will not finish.
--
-- This sweeps every five minutes and turns a stage that has run far past
-- anything measured into a failure with a reason a person can read. Retry then
-- works as it always does - and a retry after a stuck analysis reuses the
-- transcript, so nothing is transcribed twice.
--
-- The windows are generous on purpose. Transcription of ten minutes of audio
-- measured under ten seconds; twenty minutes is not a tight deadline, it is
-- "something has gone wrong". A function cannot run past 150 s, so five
-- minutes at `analyzing` means it died.

create extension if not exists pg_cron;

create or replace function reap_stuck_meetings() returns integer
language plpgsql security definer set search_path = public as $$
declare
  reaped integer := 0;
  n integer;
begin
  -- Each stage has its own window and its own message.
  update meetings set
    status = 'failed',
    failed_stage = 'uploaded',
    failure_reason = 'The upload never completed. The browser may have been closed mid-transfer - upload the file again.'
  where status = 'uploaded' and stage_started_at < now() - interval '2 hours';
  get diagnostics n = row_count; reaped := reaped + n;

  update meetings set
    status = 'failed',
    failed_stage = 'queued',
    failure_reason = 'Processing did not start within five minutes. Retry to hand the recording to transcription again.'
  where status = 'queued' and stage_started_at < now() - interval '5 minutes';
  get diagnostics n = row_count; reaped := reaped + n;

  update meetings set
    status = 'failed',
    failed_stage = 'transcribing',
    failure_reason = 'The transcription service did not report back within twenty minutes. Retry to submit the recording again.'
  where status = 'transcribing' and stage_started_at < now() - interval '20 minutes';
  get diagnostics n = row_count; reaped := reaped + n;

  update meetings set
    status = 'failed',
    failed_stage = 'analyzing',
    failure_reason = 'Analysis did not finish within five minutes. Retry to analyse the saved transcript again - it will not be transcribed twice.'
  where status = 'analyzing' and stage_started_at < now() - interval '5 minutes';
  get diagnostics n = row_count; reaped := reaped + n;

  -- Keep the job row's record honest too.
  update processing_jobs j set last_error = m.failure_reason
  from meetings m
  where j.meeting_id = m.id and m.status = 'failed' and j.last_error is distinct from m.failure_reason;

  return reaped;
end;
$$;

-- Idempotent: re-running this migration replaces the schedule rather than
-- adding a second copy of it.
do $$
begin
  perform cron.unschedule('reap-stuck-meetings')
  where exists (select 1 from cron.job where jobname = 'reap-stuck-meetings');
end;
$$;

select cron.schedule('reap-stuck-meetings', '*/5 * * * *', 'select reap_stuck_meetings()');
