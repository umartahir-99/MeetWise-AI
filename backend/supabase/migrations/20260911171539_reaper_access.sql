-- The sweep is for the scheduler, not for callers.
--
-- `reap_stuck_meetings` is security definer so pg_cron can run it over every
-- user's rows. PostgREST exposes public functions to any signed-in user by
-- default, which would let anyone trigger a sweep - harmless in effect, since
-- it only touches rows that are genuinely stale, but not theirs to call.

revoke execute on function reap_stuck_meetings() from public, anon, authenticated;
