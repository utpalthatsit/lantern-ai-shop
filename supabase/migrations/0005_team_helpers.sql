-- ============================================================
-- 0005_team_helpers.sql — safe user lookups for the invite flow.
-- The browser cannot read auth.users directly; these security
-- definer functions expose only what the invite flow needs and
-- are scoped to the caller's own shops.
-- ============================================================

-- Members of the caller's shops (owner or member), with emails.
create or replace function public.my_shop_members()
returns table (id uuid, role text, email text)
language sql stable security definer set search_path = public
as $$
  select sm.id, sm.role, u.email
  from public.shop_members sm
  join auth.users u on u.id = sm.user_id
  where sm.shop_id in (select public.my_shop_ids())
  order by sm.created_at;
$$;

grant execute on function public.my_shop_members() to authenticated;

-- Exact email lookup, used only to attach an existing account to a shop.
-- Only callers who own (or belong to) at least one shop may look up an
-- email — this stops arbitrary account enumeration by random users.
create or replace function public.find_user_by_email(target text)
returns table (id uuid, email text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email
  from auth.users u
  where lower(u.email) = lower(target)
    and exists (select 1 from public.shop_members where user_id = auth.uid())
  limit 1;
$$;

grant execute on function public.find_user_by_email(text) to authenticated;

-- ============================================================
-- my_shop_ids — redefined to include team memberships.
-- The 0002 version only covered owned shops, which locked
-- managers/staff out of every RLS policy. This supersedes it.
-- ============================================================
create or replace function public.my_shop_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.shop_members where user_id = auth.uid()
  union
  select id from public.shops where owner_id = auth.uid();
$$;
