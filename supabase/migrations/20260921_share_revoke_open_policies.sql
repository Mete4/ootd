-- OOTD share hardening, part 2 of 2
-- Date: 2026-09-21
--
-- Applied 2026-10-14, after app 1.1.0 was on the phone and owned its link.
-- The photo bucket had the same hole. 20261014_share_photo_owner_only.sql
-- closes it.
--
-- This closes the two holes that let anyone with the public anon key destroy
-- your data:
--   * "Anyone can update shared closets" let anyone overwrite any closet.
--   * "Anyone can delete suggestions" let anyone delete anyone's suggestions.
--
-- After this runs, writes go through create_share / save_share / delete_suggestion
-- from part 1, which check the owner secret. An app build that predates those
-- calls will fail to share until you update it.

begin;

-- ---------------------------------------------------- shared_closets: no direct write
drop policy if exists "Anyone can update shared closets" on public.shared_closets;
drop policy if exists "Anyone can insert shared closets" on public.shared_closets;

-- ------------------------------------------------------- suggestions: no direct delete
-- INSERT stays open on purpose: a friend holding your link must be able to
-- leave a suggestion, and the link itself is the permission.
drop policy if exists "Anyone can delete suggestions" on public.suggestions;

commit;

-- ---------------------------------------------------------------------------
-- Residual risk, stated rather than hidden:
--
-- SELECT stays open on public.suggestions. Anyone holding the anon key can
-- therefore list every suggestion across every closet, which exposes the
-- suggester names and the item ids. It is left open because Realtime needs
-- SELECT through RLS, and the app uses a Realtime subscription to show a new
-- suggestion the moment it arrives.
--
-- To close it as well, the app must drop the Realtime subscription and poll a
-- list_suggestions(token, secret) function instead.
-- ---------------------------------------------------------------------------
