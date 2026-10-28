-- Lets the app take ownership of a link it made before 20260921_share_hardening.
--
-- Links from that time have no owner secret, so `save_share` refuses them with
-- "unknown or unclaimed share". The app then had no way to update its own link:
-- it made a new one, and every friend holding the old address kept seeing the
-- old closet.
--
-- The app that holds the token calls this once. It mints a secret, stores its
-- hash, and hands the secret back. From then on the link updates like any other.
--
-- Who else could call it: anyone who knows the token, which means anyone the
-- link was sent to. The first caller wins and later callers get
-- "not authorised". This adds no new exposure while the open UPDATE policy from
-- the first schema is still in place, because that already lets anyone write to
-- any row. Run 20260921_share_revoke_open_policies.sql once the app has claimed
-- its link, and this function stops mattering, since every row then has an owner.

create or replace function public.adopt_legacy_share(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text := encode(gen_random_bytes(32), 'hex');
begin
  -- One statement, so two callers racing for the same row cannot both win: the
  -- second waits on the row lock, then finds the hash already set.
  update public.shared_closets
     set owner_secret_hash = encode(sha256(convert_to(v_secret, 'utf8')), 'hex')
   where token = p_token
     and owner_secret_hash is null
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'not authorised';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.adopt_legacy_share(text) from public;
grant execute on function public.adopt_legacy_share(text) to anon, authenticated;
