-- Remove the open read policies. Part 2 of 2.
--
-- Apply this after 20261014_share_read_by_token.sql, and after the viewer and
-- the app use its functions (over-the-air update 5). An older app cannot count
-- or list suggestions and cannot delete old photos until it updates.
--
-- After this, the public key cannot list tokens:
-- - shared_closets: no select policy. The viewer calls get_shared_closet.
-- - suggestions: no select policy. The app calls list_suggestions and
--   count_suggestions with the owner secret. Friends can still insert.
-- - photos: only the owner of a link can list its folder (x-share-secret
--   header). Storage also needs this policy for an upsert and a delete. Photos
--   still load from the public address, because the bucket is public.

begin;

drop policy if exists "View unexpired shared closets" on public.shared_closets;
drop policy if exists "Anyone can view suggestions" on public.suggestions;

-- Realtime checks the select policy of each listener, so no listener can get
-- these rows now. The app no longer listens.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestions'
  ) then
    alter publication supabase_realtime drop table public.suggestions;
  end if;
end;
$$;

drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Share owner can list photos" on storage.objects;

create policy "Share owner can list photos"
  on storage.objects for select
  using (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
  );

commit;
