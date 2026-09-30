-- =====================================================================
-- C4 (2026-09-29) — the commission trail.
--
-- PROSANTI takes a cut of every order, so the number that decides it is the
-- most consequential figure in a shop's file. It is also the one a shop
-- disputes: "আমার তো ১২% ছিল" — and until now there was nothing to answer
-- with but the number sitting there today.
--
-- So the change itself now writes its own history, from a TRIGGER rather than
-- from a screen. A screen can be bypassed, forgotten, or written again later;
-- a trigger on the row cannot. Whether the rate moves from the admin panel,
-- from the Supabase dashboard, or from a psql prompt at midnight, the trail
-- appears the same way: who, when, and from how much to how much.
--
-- Append-only. There is no UPDATE or DELETE policy, and a trigger refuses
-- both outright rather than relying on a policy nobody wrote. A shop's money
-- history is not a document anybody edits.
--
-- Idempotent — safe to re-run. Expect "COMMISSION AUDIT OK" at the end.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The log
-- ---------------------------------------------------------------------------
create table if not exists public.shop_commission_history (
  id           bigint generated always as identity primary key,
  shop_id      uuid not null references public.shops (id) on delete cascade,
  created_at   timestamptz not null default now(),
  /**
   * The rate before the change. NULL means "the rate this shop joined with" —
   * a later "15 → 12" only means something if the starting point is on the
   * record too, so the insert that creates the shop writes the first line.
   */
  old_pct      numeric(5, 2),
  new_pct      numeric(5, 2) not null,
  /** Who moved it. Null when the write carried no staff session (onboarding). */
  actor_id     uuid,
  actor_email  text,
  constraint shop_commission_history_range
    check (new_pct >= 0 and new_pct <= 90 and (old_pct is null or (old_pct >= 0 and old_pct <= 90))),
  /** A line that records no movement would be noise in a money trail. */
  constraint shop_commission_history_moved
    check (old_pct is null or old_pct <> new_pct)
);

create index if not exists shop_commission_history_shop_idx
  on public.shop_commission_history (shop_id, created_at desc);

alter table public.shop_commission_history enable row level security;

-- Staff-only on purpose: the actor's e-mail is a colleague's address, and the
-- trail is the evidence in a dispute with a shop — not public reading.
drop policy if exists "commission history admin read" on public.shop_commission_history;
create policy "commission history admin read" on public.shop_commission_history
  for select using (ps_is_admin());

drop policy if exists "commission history admin insert" on public.shop_commission_history;
create policy "commission history admin insert" on public.shop_commission_history
  for insert with check (ps_is_admin());

-- Append-only: no UPDATE or DELETE policy exists, and this says so out loud
-- instead of leaving it to be inferred from a missing policy. The one DELETE
-- it allows is the cascade that removes a shop altogether — a shop leaving
-- PROSANTI takes its trail with it, which is not the same as crossing a line
-- out. (RLS already refuses a direct DELETE; this is the belt to its braces.)
create or replace function ps_guard_commission_history_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'commission history cannot be rewritten';
  end if;
  if exists (select 1 from public.shops where id = old.shop_id) then
    raise exception 'commission history cannot be rewritten';
  end if;
  return old; -- the shop itself is gone: let the cascade take the trail
end $$;

drop trigger if exists trg_commission_history_no_rewrite on public.shop_commission_history;
create trigger trg_commission_history_no_rewrite
  before update or delete on public.shop_commission_history
  for each row execute function ps_guard_commission_history_append_only();

-- ---------------------------------------------------------------------------
-- 2. Who did it — read from the session the write arrived with.
--
-- Every staff write in this codebase runs on the STAFF session (RLS-bound
-- client), so the request's own claims name the officer. A service-role write
-- carries no claims; the line is still written with a null actor, because
-- "somebody moved it and nobody was signed in" is exactly what an audit
-- should show rather than hide.
-- ---------------------------------------------------------------------------
create or replace function ps_actor_email()
returns text language plpgsql stable set search_path = public as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_email  text := nullif(current_setting('request.jwt.claim.email', true), '');
begin
  if v_claims is null then
    return v_email;                 -- no session: nobody to name
  end if;
  begin
    return coalesce(nullif((v_claims::jsonb ->> 'email'), ''), v_email);
  exception when others then
    -- A claims value that is not JSON (an empty string, a stray setting) must
    -- never stop a commission change from being recorded: the rate moved, and
    -- "the rate moved but we cannot say who did it" is the honest answer.
    return v_email;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The trail writes itself
-- ---------------------------------------------------------------------------
create or replace function ps_audit_shop_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- The rate the shop joined with: the baseline every later change reads
    -- against ("15% when it joined" → "15 → 12 on 12 Oct").
    insert into public.shop_commission_history (shop_id, old_pct, new_pct, actor_id, actor_email)
    values (new.id, null, new.commission_pct, auth.uid(), ps_actor_email());
    return null;
  end if;

  -- An UPDATE that leaves the rate alone writes nothing: renaming a shop is
  -- not a money event, and a trail full of those is a trail nobody reads.
  if new.commission_pct is distinct from old.commission_pct then
    insert into public.shop_commission_history (shop_id, old_pct, new_pct, actor_id, actor_email)
    values (new.id, old.commission_pct, new.commission_pct, auth.uid(), ps_actor_email());
  end if;
  return null;
end $$;

drop trigger if exists trg_shops_audit_commission on public.shops;
create trigger trg_shops_audit_commission
  after insert or update of commission_pct on public.shops
  for each row execute function ps_audit_shop_commission();

commit;

do $$ begin raise notice 'COMMISSION AUDIT OK'; end $$;
