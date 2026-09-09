-- The recordings bucket.
--
-- Private, so there is no permanent URL: playback goes through a signed URL
-- that expires. Paths are {user_id}/{meeting_id}/{filename} — the user id
-- first, which turns the policy into a cheap prefix check.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

drop policy if exists "own files" on storage.objects;

create policy "own files" on storage.objects
  for all
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
