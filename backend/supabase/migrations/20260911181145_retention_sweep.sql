-- Retention, enforced while nobody is looking.
--
-- The Settings screen lets a person delete meetings past their retention
-- window by hand. This does it nightly, for every account, whether or not they
-- ever open the app again - and it deletes the stored recordings too.
--
-- The files are the reason this is not plain SQL. Deleting a row from
-- storage.objects does not delete the object behind it; the file stays in the
-- bucket, orphaned and billed. Only the Storage API removes it. So the sweep
-- itself is an edge function, and this migration is the alarm clock that calls
-- it - through pg_net, once a night.
--
-- The function must know the call is ours. The shared secret is generated here,
-- inside the database, straight into Vault: the scheduler reads it from Vault
-- to send, the function reads it from Vault to check, and it never exists in
-- any file. A different project runs this migration and gets its own.

create extension if not exists pg_net;
create extension if not exists supabase_vault;
create extension if not exists pgcrypto with schema extensions;

-- Generated once. Re-running the migration keeps the existing secret.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Shared secret for scheduled calls into edge functions. Generated in-database; never in a file.'
    );
  end if;
end;
$$;

-- The function reads the secret through this, because PostgREST does not
-- expose the vault schema. Service-role only.
create or replace function cron_secret() returns text
language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
$$;
revoke execute on function cron_secret() from public, anon, authenticated;

-- The scheduled call. The project URL is not secret - it is in every browser
-- request - so it lives here in plain text, alongside the project ref in
-- config.toml.
create or replace function run_retention_sweep() returns bigint
language plpgsql security definer set search_path = public, vault, net as $$
declare
  request_id bigint;
begin
  select net.http_post(
    url     := 'https://wvvexjktntliwkrwhohk.supabase.co/functions/v1/retention-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', cron_secret()
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke execute on function run_retention_sweep() from public, anon, authenticated;

-- 03:15 UTC, nightly. Off the hour so it does not queue behind everything
-- else that runs on the hour.
do $$
begin
  perform cron.unschedule('retention-sweep')
  where exists (select 1 from cron.job where jobname = 'retention-sweep');
end;
$$;
select cron.schedule('retention-sweep', '15 3 * * *', 'select run_retention_sweep()');
