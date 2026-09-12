-- Seed the display name from sign-up, instead of the placeholder.
--
-- The sign-up form now sends the person's name as user metadata. Copying it
-- here means a new account is called by its name from the first render;
-- the column default 'You' is kept only for accounts created without one
-- (the dashboard, a script), and the app treats it as "not named yet".
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'You')
  )
  on conflict (id) do nothing;
  insert into user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
