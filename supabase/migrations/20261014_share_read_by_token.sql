-- Read a share only with its token, and read suggestions only with the owner
-- secret. Part 1 of 2.
--
-- Before this, the read policies were open. Anyone with the public key could
-- list every token in shared_closets, in suggestions (closet_token) and in the
-- photo bucket (one folder for each token), and then read every closet.
--
-- This part only adds functions, so it is safe to apply first. The viewer and
-- the app use them from over-the-air update 5. Part 2
-- (20261014_share_close_open_reads.sql) removes the open policies.

begin;

-- --------------------------------------------------- 1. one closet by token
-- The caller must know the token. The row is not visible after it expires.
-- The owner secret hash stays on the server.
create or replace function public.get_shared_closet(p_token text)
returns table (items_json jsonb, outfits_json jsonb, scope text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.items_json, c.outfits_json, c.scope
    from public.shared_closets c
   where c.token = p_token
     and (c.expires_at is null or c.expires_at > now());
$$;

-- ------------------------------------------- 2. suggestions, owner only
create or replace function public.list_suggestions(p_token text, p_secret text)
returns setof public.suggestions
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_share_owner(p_token, p_secret) then
    raise exception 'not authorised';
  end if;

  return query
    select s.*
      from public.suggestions s
     where s.closet_token = p_token
     order by s.created_at desc;
end;
$$;

-- p_since is the time the owner last opened the suggestions. Null counts all.
create or replace function public.count_suggestions(
  p_token  text,
  p_secret text,
  p_since  timestamptz default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_share_owner(p_token, p_secret) then
    raise exception 'not authorised';
  end if;

  return (
    select count(*)::integer
      from public.suggestions s
     where s.closet_token = p_token
       and (p_since is null or s.created_at > p_since)
  );
end;
$$;

-- ------------------------------------------------------------- 3. grants
revoke all on function public.get_shared_closet(text) from public;
revoke all on function public.list_suggestions(text, text) from public;
revoke all on function public.count_suggestions(text, text, timestamptz) from public;
grant execute on function public.get_shared_closet(text) to anon, authenticated;
grant execute on function public.list_suggestions(text, text) to anon, authenticated;
grant execute on function public.count_suggestions(text, text, timestamptz) to anon, authenticated;

commit;
