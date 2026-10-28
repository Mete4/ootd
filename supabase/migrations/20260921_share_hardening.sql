-- OOTD share hardening and link expiry
-- Date: 2026-09-21
--
-- Part 1 of 2. This part only ADDS things, so the app that is already on your
-- phone keeps working while you build the new one.
--
-- Part 2 (20260921_share_revoke_open_policies.sql) closes the open write
-- policies. Run it only after the new build is on your phone.

begin;

-- ---------------------------------------------------------------- 1. columns
alter table public.shared_closets
  add column if not exists expires_at        timestamptz,
  add column if not exists scope             text not null default 'full',
  add column if not exists owner_secret_hash text;

alter table public.shared_closets drop constraint if exists shared_closets_scope_chk;
alter table public.shared_closets
  add constraint shared_closets_scope_chk check (scope in ('full', 'vacation'));

create index if not exists shared_closets_expires_at_idx
  on public.shared_closets (expires_at) where expires_at is not null;

-- ------------------------------------------------ 2. expired links stop working
-- The old policy let anyone read any row. This keeps public read by token, which
-- is how the viewer site works, but an expired row is invisible from that moment.
drop policy if exists "Anyone can view shared closets" on public.shared_closets;
create policy "View unexpired shared closets"
  on public.shared_closets for select
  using (expires_at is null or expires_at > now());

-- ----------------------------------------------------------- 3. mint a share
-- Postgres generates both values. This replaces Math.random() in the app, which
-- is predictable and must never be used for anything secret.
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

-- --------------------------------------------- 4. write to a share you own
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

-- ------------------------------------------- 5. delete a suggestion, owner only
create or replace function public.delete_suggestion(
  p_id     uuid,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select c.owner_secret_hash into v_hash
    from public.suggestions s
    join public.shared_closets c on c.token = s.closet_token
   where s.id = p_id;

  if v_hash is null then
    raise exception 'unknown suggestion';
  end if;
  if v_hash <> encode(sha256(convert_to(p_secret, 'utf8')), 'hex') then
    raise exception 'not authorised';
  end if;

  delete from public.suggestions where id = p_id;
end;
$$;

-- ------------------------------ 6. cleanup: the row, the suggestions, the photos
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

  -- Photos first. Removing the storage.objects row makes the public URL
  -- return 404, so the images stop being reachable.
  delete from storage.objects
   where bucket_id = 'closet-images'
     and split_part(name, '/', 1) = any(v_tokens);

  delete from public.suggestions    where closet_token = any(v_tokens);
  delete from public.shared_closets where token        = any(v_tokens);

  return array_length(v_tokens, 1);
end;
$$;

-- ------------------------------------------------------------------ 7. grants
grant execute on function public.create_share(text, int)                      to anon, authenticated;
grant execute on function public.save_share(text, text, jsonb, jsonb, text, int) to anon, authenticated;
grant execute on function public.delete_suggestion(uuid, text)                to anon, authenticated;

-- Housekeeping only. No client may call this.
revoke execute on function public.cleanup_expired_shares() from anon, authenticated;

commit;
