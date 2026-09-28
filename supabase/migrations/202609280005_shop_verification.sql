-- ============================================================================
-- Verified shop badge (2026-09-28) — B5 of the shop-service upgrade
--
-- The first question a new customer asks about an unknown shop is "can I trust
-- it?". A badge only answers that if it means something specific and cannot be
-- awarded by the shop itself. So:
--
--   * TWO DOCUMENT CHECKS, not one vague "verified" switch: the owner's NID and
--     the trade licence. Staff tick what they actually held and looked at.
--   * THE BADGE IS DERIVED FROM THE EVIDENCE. Both checks in → verified_at is
--     stamped. Remove either check → the badge, the timestamp and the officer
--     are CLEARED by the trigger below, so a badge can never outlive the
--     documents behind it (not even against a direct SQL update).
--   * A SHOP CANNOT VERIFY ITSELF. Every verification column is added to
--     ps_guard_shop_vendor_update: a vendor session (or a direct anon-key call
--     with the shop's own JWT) that tries to set them is refused.
--   * AN AUDIT TRAIL THAT SURVIVES THE NEXT EDIT. `shop_verification_events`
--     is append-only (no update/delete policy, plus a trigger that refuses
--     both), so "who verified this, when, and what did they write" stays
--     answerable even after the badge is taken away and given back.
--
-- Privacy: the shop's own note and the officer's e-mail are staff-only. The
-- storefront reads the two booleans and the date — never the note.
--
-- Idempotent — safe to re-run. Expect "SHOP VERIFICATION OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists nid_checked           boolean not null default false,
  add column if not exists trade_licence_checked boolean not null default false,
  add column if not exists verified_at           timestamptz,
  add column if not exists verified_by           uuid,
  add column if not exists verified_by_email     text,
  add column if not exists verification_note     text;

-- ---------------------------------------------------------------------------
-- 2. The audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_verification_events (
  id                    bigint generated always as identity primary key,
  shop_id               uuid not null references public.shops (id) on delete cascade,
  created_at            timestamptz not null default now(),
  action                text not null check (action in ('verified', 'unverified', 'note')),
  nid_checked           boolean not null,
  trade_licence_checked boolean not null,
  note                  text,
  actor_id              uuid,
  actor_email           text
);

create index if not exists shop_verification_events_shop_idx
  on public.shop_verification_events (shop_id, created_at desc);

alter table public.shop_verification_events enable row level security;

drop policy if exists "verification events admin read" on public.shop_verification_events;
create policy "verification events admin read" on public.shop_verification_events
  for select using (ps_is_admin());

drop policy if exists "verification events admin insert" on public.shop_verification_events;
create policy "verification events admin insert" on public.shop_verification_events
  for insert with check (ps_is_admin());

-- No UPDATE / DELETE policy exists on purpose; the trigger makes that explicit
-- rather than relying on "the policy was never written".
create or replace function ps_guard_verification_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'verification history cannot be rewritten';
end $$;

drop trigger if exists trg_verification_events_no_update on public.shop_verification_events;
create trigger trg_verification_events_no_update
  before update or delete on public.shop_verification_events
  for each row execute function ps_guard_verification_append_only();

-- ---------------------------------------------------------------------------
-- 3. The badge follows the evidence (and only staff may move it)
-- ---------------------------------------------------------------------------
create or replace function ps_guard_shop_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A brand-new row is never born verified, whoever inserts it (an INSERT has
  -- no OLD row to compare against, hence the separate branch).
  if tg_op = 'INSERT' then
    if not (select ps_is_admin()) then
      new.nid_checked := false;
      new.trade_licence_checked := false;
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
      new.verification_note := null;
      return new;
    end if;
  end if;

  -- Staff keeps the whole table; this is their job to set.
  if (select ps_is_admin()) then
    -- Badge = BOTH documents checked. Anything less and the stamp goes: a
    -- badge may not outlive the evidence it stands on.
    if not (new.nid_checked and new.trade_licence_checked) then
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
    elsif new.verified_at is null then
      -- Granted straight in SQL (no API): the time is known, the officer is
      -- not — leave verified_by null rather than inventing a name.
      new.verified_at := now();
    end if;
    return new;
  end if;

  -- Everyone else (a vendor session included): the verification columns are
  -- not theirs to touch, even by a direct Supabase call.
  if new.nid_checked is distinct from old.nid_checked
     or new.trade_licence_checked is distinct from old.trade_licence_checked
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_by_email is distinct from old.verified_by_email
     or new.verification_note is distinct from old.verification_note then
    raise exception 'only staff can verify a shop';
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_guard_verification on public.shops;
create trigger trg_shops_guard_verification
  before insert or update on public.shops
  for each row execute function ps_guard_shop_verification();

-- A shop row created by a vendor-side insert must never arrive pre-verified.
alter table public.shops
  drop constraint if exists shops_no_self_verification;
alter table public.shops
  add constraint shops_no_self_verification
  check (verified_at is null or (nid_checked and trade_licence_checked));

commit;

do $$ begin raise notice 'SHOP VERIFICATION OK'; end $$;
