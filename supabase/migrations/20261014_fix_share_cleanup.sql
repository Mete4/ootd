-- Makes the daily cleanup work again.
--
-- Supabase now refuses a delete from storage.objects with "Direct deletion
-- from storage tables is not allowed. Use the Storage API instead."
-- cleanup_expired_shares() deletes the photo records of expired links that way,
-- so the first expired link would make the job fail, and the failure undoes
-- the whole cleanup. Found on 2026-10-14. No link had expired before then, so
-- nothing was left behind.
--
-- The fix turns on Supabase's own exception, storage.allow_delete_query, for
-- this one transaction only.
--
-- The known limit in 20260921_share_cleanup_cron.sql stays: the public URL of
-- each photo stops working at once, but the file bytes stay in storage and
-- count toward the quota. To delete the bytes, the cleanup must call the
-- Storage API from an Edge Function.

create or replace function public.cleanup_expired_shares()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tokens text[];
begin
  select coalesce(array_agg(token), '{}') into v_tokens
    from public.shared_closets
   where expires_at is not null and expires_at <= now();

  if array_length(v_tokens, 1) is null then
    return 0;
  end if;

  -- Only for this transaction. The third argument true makes it local.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- Photos first. Removing the storage.objects row makes the public URL
  -- stop working, so the images stop being reachable.
  delete from storage.objects
   where bucket_id = 'closet-images'
     and split_part(name, '/', 1) = any(v_tokens);

  delete from public.suggestions    where closet_token = any(v_tokens);
  delete from public.shared_closets where token        = any(v_tokens);

  return array_length(v_tokens, 1);
end;
$$;

revoke execute on function public.cleanup_expired_shares() from public, anon, authenticated;
