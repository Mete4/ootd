-- Lets the owner of a share link delete photos from its folder.
--
-- The app deletes each photo that the link no longer uses: the photos of
-- archived items, of deleted items, and photos that were removed from an item.
-- Before this, those photos stayed in storage, and anyone who had saved one of
-- their addresses could still open it.
--
-- The check is the same as for upload (20261014_share_photo_owner_only.sql):
-- the request must send the owner secret of the folder's token in the
-- `x-share-secret` header. A delete through the Storage API also removes the
-- file bytes, not only the record.

drop policy if exists "Share owner can delete photos" on storage.objects;

create policy "Share owner can delete photos"
  on storage.objects for delete
  to anon, authenticated
  using (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
  );
