-- Only the owner of a share link can upload or replace its photos.
--
-- Before this, the first schema let anyone with the public key upload any file
-- to the closet-images bucket, and overwrite any photo in it. A stranger could
-- put a different picture into your closet, and your friends would see it.
--
-- Now an upload to `closet-images/<token>/...` must send the owner secret of
-- that token in the `x-share-secret` header. The app has the secret from
-- create_share or adopt_legacy_share. Storage gives the request headers to the
-- policy in `request.headers`.
--
-- Reading stays public: the friend viewer and the photo repair download photos
-- by their public address. Nobody can delete through the API, because there is
-- no delete policy. cleanup_expired_shares deletes with owner rights.
--
-- The bucket also gets a size limit and a type limit, so that the bucket
-- cannot be filled with large or non-image files. The largest photo on
-- 2026-10-14 was 1.5 MB.

begin;

create or replace function public.is_share_owner(p_token text, p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_token is not null
     and p_secret is not null
     and exists (
       select 1
         from public.shared_closets
        where token = p_token
          and owner_secret_hash = encode(sha256(convert_to(p_secret, 'utf8')), 'hex')
          and (expires_at is null or expires_at > now())
     );
$$;

-- The storage policies run as the caller, so the caller must be able to run
-- this. It shows only yes or no, and a secret has 256 bits, so it cannot be
-- used to guess one.
revoke all on function public.is_share_owner(text, text) from public;
grant execute on function public.is_share_owner(text, text) to anon, authenticated;

drop policy if exists "Public Upload" on storage.objects;
drop policy if exists "Public Update" on storage.objects;
drop policy if exists "Share owner can upload photos" on storage.objects;
drop policy if exists "Share owner can replace photos" on storage.objects;

create policy "Share owner can upload photos"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
  );

-- An upload with x-upsert replaces the old photo, which is an update.
create policy "Share owner can replace photos"
  on storage.objects for update
  to anon, authenticated
  using (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
  )
  with check (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
  );

update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg', 'image/png']
 where id = 'closet-images';

commit;
