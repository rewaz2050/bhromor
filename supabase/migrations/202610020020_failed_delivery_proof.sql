-- ============================================================================
-- FAILED-DELIVERY PROOF (2026-10-03): an optional photo when a rider reports a failed attempt.
--
-- "Customer not answering" is the rider's word alone. Staff can now (optionally) ask for a photo
-- — the closed door, the locked gate — so a disputed failure, a returned parcel or a "failed
-- delivery fee" is backed by something. Whether it is asked for is a staff decision, stored as the
-- site_settings key `failed_delivery_proof`:  0 = not asked (the default — nothing changes),
-- 1 = optional (the rider app offers it), 2 = required (a photo, or a written reason why none
-- could be taken — same escape hatch as the delivery proof). No SQL reads the setting.
--
--   delivery_failed_proofs   one row per failed attempt that carried a photo and/or a "no photo"
--                            reason. Written by the server after the attempt is recorded
--                            (service role). Staff read it (RLS ps_is_admin()) — the customer-facing
--                            order view never includes it. Deleted with its order.
--
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.delivery_failed_proofs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  assignment_id uuid,
  rider_id      uuid references public.riders(id) on delete set null,
  photo_url     text,
  no_photo_note text,
  created_at    timestamptz not null default now(),
  check (photo_url is not null or no_photo_note is not null)
);

create index if not exists idx_delivery_failed_proofs_order
  on public.delivery_failed_proofs (order_id, created_at desc);

alter table public.delivery_failed_proofs enable row level security;
drop policy if exists "failed proofs admin read" on public.delivery_failed_proofs;
create policy "failed proofs admin read" on public.delivery_failed_proofs
  for select using (ps_is_admin());
revoke all on table public.delivery_failed_proofs from anon, authenticated;
grant select on table public.delivery_failed_proofs to authenticated;
grant all on table public.delivery_failed_proofs to service_role;

notify pgrst, 'reload schema';

commit;
