-- New-user setup, and keeping `updated_at` honest.

-- A signed-up user needs a profile and a settings row before the app can read
-- either. Doing it in a trigger means the client never has to remember to,
-- and a user can never exist without them.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  insert into user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- `updated_at` is what Realtime consumers and the processing screen read to
-- know something moved, so it cannot be left to whoever wrote the row.
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meetings_touch_updated_at
  before update on meetings
  for each row execute function touch_updated_at();

create trigger processing_jobs_touch_updated_at
  before update on processing_jobs
  for each row execute function touch_updated_at();
