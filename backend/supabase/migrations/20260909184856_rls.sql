-- Row Level Security.
--
-- Get this wrong and one user reads another user's meetings. Every table is
-- locked, and every policy is the same single comparison because `owner_id` is
-- carried on the child tables rather than joined back through `meetings`.
--
-- `for all` covers select/insert/update/delete in one policy, so there is no
-- gap to forget. `(select auth.uid())` is evaluated once per statement instead
-- of once per row, which matters on a long transcript. `with check` is what
-- stops somebody inserting a row owned by someone else — `using` alone only
-- controls reading.

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

create policy "own rows" on profiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own rows" on user_settings
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on people
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on voices
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on meetings
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on meeting_speakers
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on transcript_lines
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on topics
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on decisions
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on action_items
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on quotes
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own rows" on processing_jobs
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
