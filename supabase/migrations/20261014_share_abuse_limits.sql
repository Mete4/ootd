-- Limit what a stranger can do with the public key.
--
-- Found in the audit of 2026-10-14:
-- - anon and authenticated had every table right on shared_closets and
--   suggestions (delete, truncate, update...). RLS blocked most of it, but
--   truncate ignores RLS. The app and the viewer need none of these rights.
-- - Supabase gives anon every right on each new table and function in public
--   by default, so a new helper function would be open to everyone.
-- - Anyone could make unlimited links with create_share, write unlimited data
--   to them, and upload 10 MB photos to them. That can fill the free plan
--   (500 MB database, 1 GB storage) and stop the app.
-- - Anyone could insert unlimited suggestions of any size, set their own
--   created_at, and suggest to an expired link.
-- - adopt_legacy_share was still open. No link is left without a secret.
--
-- Trade-off: the limits below can also stop the owner. If a stranger makes 20
-- links, the owner cannot make a new one until an owner deletes them.

begin;

-- ------------------------------------------------------------ 1. table rights
revoke all on table public.shared_closets from anon, authenticated;
revoke all on table public.suggestions from anon, authenticated;
-- A friend sends these three fields only. id and created_at take their default.
grant insert (closet_token, suggested_by, item_ids) on table public.suggestions to anon;

-- New tables and functions in public are closed until a migration opens them.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- --------------------------------------------------------- 2. function rights
-- The app has no sign-in, so it always calls as anon.
revoke execute on function public.adopt_legacy_share(text) from public, anon, authenticated;
revoke execute on function public.create_share(text, int) from authenticated;
revoke execute on function public.save_share(text, text, jsonb, jsonb, text, int) from authenticated;
-- delete_suggestion still had the default grant to PUBLIC, which every role has.
revoke execute on function public.delete_suggestion(uuid, text) from public, authenticated;
grant execute on function public.delete_suggestion(uuid, text) to anon;
revoke execute on function public.get_shared_closet(text) from authenticated;
revoke execute on function public.list_suggestions(text, text) from authenticated;
revoke execute on function public.count_suggestions(text, text, timestamptz) from authenticated;
revoke execute on function public.is_share_owner(text, text) from authenticated;

-- ------------------------------------------------------------- 3. suggestions
alter table public.suggestions
  drop constraint if exists suggestions_suggested_by_length_chk,
  drop constraint if exists suggestions_item_ids_count_chk,
  drop constraint if exists suggestions_item_ids_length_chk;
alter table public.suggestions
  add constraint suggestions_suggested_by_length_chk
    check (suggested_by is null or char_length(suggested_by) between 1 and 60),
  add constraint suggestions_item_ids_count_chk
    check (cardinality(item_ids) between 1 and 50),
  add constraint suggestions_item_ids_length_chk
    check (char_length(array_to_string(item_ids, '')) <= 50 * 64);

-- Yes when the link is open. The insert policy runs as the caller, who cannot
-- read shared_closets.
create or replace function public.can_suggest(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.shared_closets c
     where c.token = p_token
       and (c.expires_at is null or c.expires_at > now())
  );
$$;
revoke all on function public.can_suggest(text) from public, anon, authenticated;
grant execute on function public.can_suggest(text) to anon;

-- At most 30 suggestions for one link in one hour. A policy cannot count this:
-- it sees the table as it was when the statement started, so one request with
-- many rows would pass. This trigger runs after the whole statement.
create or replace function public.limit_suggestion_rate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1
      from (select distinct closet_token from new_rows) t
     where (select count(*) from public.suggestions s
             where s.closet_token = t.closet_token
               and s.created_at > now() - interval '1 hour') > 30
  ) then
    raise exception 'too many suggestions for this link, try again in an hour';
  end if;
  return null;
end;
$$;
revoke all on function public.limit_suggestion_rate() from public, anon, authenticated;

drop trigger if exists suggestions_rate_limit on public.suggestions;
create trigger suggestions_rate_limit
  after insert on public.suggestions
  referencing new table as new_rows
  for each statement
  execute function public.limit_suggestion_rate();

drop policy if exists "Anyone can insert suggestions" on public.suggestions;
drop policy if exists "Friends can suggest to an open link" on public.suggestions;
create policy "Friends can suggest to an open link"
  on public.suggestions for insert
  to anon
  with check (public.can_suggest(closet_token));

-- ------------------------------------------------------------------- 4. links
alter table public.shared_closets
  add column if not exists created_at timestamptz;
-- The real creation time of an old link is not known. Its last save is the
-- closest value, and it keeps old links out of the hourly limit.
update public.shared_closets set created_at = updated_at where created_at is null;
alter table public.shared_closets
  alter column created_at set default now(),
  alter column created_at set not null;

create or replace function public.create_share(
  p_scope    text default 'full',
  p_ttl_days int  default null
)
returns table (out_token text, out_secret text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token  text;
  v_secret text;
begin
  if p_scope not in ('full', 'vacation') then
    raise exception 'unknown scope %', p_scope;
  end if;
  if p_ttl_days is not null and p_ttl_days not between 1 and 365 then
    raise exception 'ttl must be 1 to 365 days';
  end if;
  -- Serialise the limit checks, so that parallel calls cannot pass together.
  perform pg_advisory_xact_lock(hashtext('public.create_share'));
  if (select count(*) from public.shared_closets
       where created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many new links, try again in an hour';
  end if;
  if (select count(*) from public.shared_closets
       where expires_at is null or expires_at > now()) >= 20 then
    raise exception 'too many open links';
  end if;

  v_token  := encode(gen_random_bytes(16), 'hex');
  v_secret := encode(gen_random_bytes(32), 'hex');

  insert into public.shared_closets
    (token, items_json, outfits_json, scope, owner_secret_hash, expires_at, updated_at)
  values
    (v_token, '[]'::jsonb, '[]'::jsonb, p_scope,
     encode(sha256(convert_to(v_secret, 'utf8')), 'hex'),
     case when p_ttl_days is null then null
          else now() + make_interval(days => p_ttl_days) end,
     now());

  return query select v_token, v_secret;
end;
$$;

-- Same as before, with limits on size and expiry. The closet of 2026-10-14 is
-- 101 items, 284 outfits and 110 KB.
create or replace function public.save_share(
  p_token   text,
  p_secret  text,
  p_items   jsonb,
  p_outfits jsonb,
  p_scope   text default null,
  p_ttl_days int  default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select owner_secret_hash into v_hash
    from public.shared_closets where token = p_token;

  if v_hash is null then
    raise exception 'unknown or unclaimed share';
  end if;
  if v_hash <> encode(sha256(convert_to(p_secret, 'utf8')), 'hex') then
    raise exception 'not authorised';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_outfits) <> 'array' then
    raise exception 'items and outfits must be arrays';
  end if;
  if jsonb_array_length(p_items) > 2000 or jsonb_array_length(p_outfits) > 20000 then
    raise exception 'too many items or outfits';
  end if;
  if octet_length(p_items::text) + octet_length(p_outfits::text) > 2 * 1024 * 1024 then
    raise exception 'closet data is larger than 2 MB';
  end if;
  if p_ttl_days is not null and p_ttl_days not between 1 and 365 then
    raise exception 'ttl must be 1 to 365 days';
  end if;

  update public.shared_closets set
    items_json   = p_items,
    outfits_json = p_outfits,
    scope        = coalesce(p_scope, scope),
    expires_at   = case when p_ttl_days is null then expires_at
                        else now() + make_interval(days => p_ttl_days) end,
    updated_at   = now()
  where token = p_token;
end;
$$;

revoke all on function public.create_share(text, int) from public, authenticated;
revoke all on function public.save_share(text, text, jsonb, jsonb, text, int) from public, authenticated;
grant execute on function public.create_share(text, int) to anon;
grant execute on function public.save_share(text, text, jsonb, jsonb, text, int) to anon;

-- ------------------------------------------------------------------ 5. photos
-- Yes when the link's folder has fewer than 1000 files and the bucket holds
-- less than 900 MB. The free plan stops at 1 GB.
create or replace function public.has_photo_room(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select (select count(*) from storage.objects
           where bucket_id = 'closet-images'
             and (storage.foldername(name))[1] = p_token) < 1000
     and (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects
           where bucket_id = 'closet-images') < 900 * 1024 * 1024;
$$;
revoke all on function public.has_photo_room(text) from public, anon, authenticated;
grant execute on function public.has_photo_room(text) to anon;

drop policy if exists "Share owner can upload photos" on storage.objects;
drop policy if exists "Share owner can replace photos" on storage.objects;

create policy "Share owner can upload photos"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'closet-images'
    and public.is_share_owner(
      (storage.foldername(name))[1],
      current_setting('request.headers', true)::json ->> 'x-share-secret'
    )
    and public.has_photo_room((storage.foldername(name))[1])
  );

-- An upload with x-upsert replaces the old photo, which is an update.
create policy "Share owner can replace photos"
  on storage.objects for update
  to anon
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
    and public.has_photo_room((storage.foldername(name))[1])
  );

commit;
