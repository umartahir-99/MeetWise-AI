-- Live status updates.
--
-- The processing screen used to advance on a timer. From here it advances
-- because the database says so: the browser subscribes to its own meeting row
-- and the bar moves when a stage actually finishes.
--
-- Realtime only broadcasts tables that are in this publication, and it
-- respects row level security, so a user can only ever subscribe to their own
-- rows. Nothing else needs to change for that to hold.

alter publication supabase_realtime add table meetings;
