-- =====================================================================
-- C1 (2026-09-28) — a shop's owner hires their own staff.
--
-- A busy shop is not one person: somebody confirms orders while the owner
-- is at the market, somebody else packs. Until now only PROSANTI staff
-- could create a vendor login (Admin → Shops → Link vendor), so the
-- owner's hands were tied — and the workaround (handing over the owner's
-- own password) is worse than no login at all: that password also opens
-- payouts, the profile and the shop's own sign.
--
-- So the owner may now open STAFF logins for their shop. The rules that
-- make that safe:
--   • a staff login is a STAFF login — no path here creates or becomes an
--     owner (the API only ever writes role='staff', and the trigger below
--     makes role and shop immutable on a row that already exists);
--   • only the owner of THAT shop may add or revoke (RLS + the API, which
--     checks the session role again);
--   • there is a cap, because every staff login is a real auth account;
--   • revoking removes the shop's ACCESS, never the person's login — the
--     same account may be a customer or a rider, and deleting it would
--     take their parcels and history with it;
--   • the shop can never be left with no owner (the last owner row cannot
--     be deleted or demoted by anyone, staff panel included).
--
-- Idempotent: safe to run twice.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. Who is on the roster: a name and the login they sign in with.
-- --------------------------------------------------------------------
alter table vendor_users add column if not exists display_name text;
alter table vendor_users add column if not exists login_email text;
alter table vendor_users add column if not exists added_by    uuid;

-- Existing rows (everyone linked by staff so far) keep their identity:
-- the login is filled from the auth account so the roster is not blank.
update vendor_users v
   set login_email = u.email
  from auth.users u
 where u.id = v.user_id
   and v.login_email is null;

-- --------------------------------------------------------------------
-- 2. Helpers. Both are SECURITY DEFINER: a policy on vendor_users may
--    not query vendor_users itself (infinite recursion).
-- --------------------------------------------------------------------

/** The caller's role in their own shop, or NULL when they are not a vendor. */
create or replace function ps_vendor_role()
returns text language sql stable security definer set search_path = public as $$
  select role from vendor_users where user_id = auth.uid();
$$;

/** How many staff logins one shop may have (a login is a real account). */
create or replace function ps_vendor_staff_max()
returns int language sql immutable as $$ select 5 $$;

-- --------------------------------------------------------------------
-- 3. Policies: every vendor sees their own row; only an OWNER sees the
--    shop's roster and may add or revoke staff.
-- --------------------------------------------------------------------
drop policy if exists "vendor_users self read" on vendor_users;
create policy "vendor_users self read" on vendor_users
  for select using (user_id = auth.uid());

drop policy if exists "vendor_users owner roster" on vendor_users;
create policy "vendor_users owner roster" on vendor_users
  for select using (shop_id = ps_vendor_shop() and ps_vendor_role() = 'owner');

drop policy if exists "vendor_users owner insert" on vendor_users;
create policy "vendor_users owner insert" on vendor_users
  for insert with check (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

drop policy if exists "vendor_users owner update" on vendor_users;
create policy "vendor_users owner update" on vendor_users
  for update using (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  ) with check (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

drop policy if exists "vendor_users owner delete" on vendor_users;
create policy "vendor_users owner delete" on vendor_users
  for delete using (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

-- --------------------------------------------------------------------
-- 4. The guard. RLS decides WHO may write; this decides WHAT may be
--    written, and it stands for the service role too (which bypasses
--    RLS) — so a bug in a screen cannot promote a member of staff.
-- --------------------------------------------------------------------
create or replace function ps_guard_vendor_users()
returns trigger language plpgsql as $$
declare
  v_staff int;
  v_owners int;
begin
  if tg_op = 'INSERT' then
    if new.role = 'staff' then
      select count(*) into v_staff
        from vendor_users
       where shop_id = new.shop_id and role = 'staff';
      if v_staff >= ps_vendor_staff_max() then
        raise exception 'A shop may have at most % staff logins — revoke one first.',
          ps_vendor_staff_max();
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- A row is bound to ONE person, ONE shop and ONE role, for life.
    -- Changing any of the three is how a staff login becomes an owner's,
    -- so it is refused here rather than in whatever screen forgot to check.
    if new.user_id is distinct from old.user_id then
      raise exception 'A vendor login cannot be handed to another person.';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'A vendor login cannot be moved to another shop.';
    end if;
    if new.role is distinct from old.role then
      raise exception 'A vendor login''s role cannot be changed — revoke it and grant a new one.';
    end if;
    return new;
  end if;

  -- DELETE: the shop must keep an owner. Without this, one delete leaves a
  -- shop that nobody can administer — not even PROSANTI, without SQL.
  if old.role = 'owner' then
    select count(*) into v_owners
      from vendor_users
     where shop_id = old.shop_id and role = 'owner' and user_id <> old.user_id;
    if v_owners = 0 then
      raise exception 'This is the shop''s last owner login — it cannot be removed.';
    end if;
  end if;
  return old;
end $$;

drop trigger if exists trg_vendor_users_guard on vendor_users;
create trigger trg_vendor_users_guard
  before insert or update or delete on vendor_users
  for each row execute function ps_guard_vendor_users();

-- A shop's roster should be readable at a glance and cheap to count.
create index if not exists vendor_users_shop_role_idx on vendor_users (shop_id, role);

do $$ begin raise notice 'VENDOR STAFF OK'; end $$;
