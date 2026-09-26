-- Password reset requests without SMS or e-mail (2026-09-26).
--
-- The vendor / rider onboarding sends no e-mail and no SMS, so "I forgot my
-- password" cannot be a reset link. Instead it is a REQUEST the person files
-- from the login page (email + phone on file), which staff verify by phone
-- and approve; approval opens a 24-hour window in which the same person sets
-- a new password themselves. No secret is ever generated or transported:
-- identity = the email + phone pair, the staff phone call, and the window.
--
-- Rows are written only by the API with the service role; staff read and
-- decide through RLS. One open (pending / approved) request per login.
begin;

create table if not exists password_reset_requests(
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('vendor','rider')),
  user_id       uuid not null references auth.users(id) on delete cascade,
  subject_id    uuid not null,                       -- shops.id / riders.id
  subject_name  text not null default '',
  email         text not null,
  phone         text not null,                       -- normalized 01XXXXXXXXX
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','used','expired')),
  note          text,                                -- staff note on reject
  requested_at  timestamptz not null default now(),
  requested_ip  text,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  expires_at    timestamptz,                         -- approval window end
  used_at       timestamptz
);

create unique index if not exists password_reset_requests_one_open
  on password_reset_requests(user_id) where status in ('pending','approved');
create index if not exists idx_password_reset_requests_queue
  on password_reset_requests(status, requested_at desc);

alter table password_reset_requests enable row level security;

-- Staff (manager / admin / super_admin) read and decide. Nobody else has a
-- policy: the login page never touches the table directly, it talks to
-- /api/auth/reset-request which uses the service role.
drop policy if exists "password_reset_requests staff all" on password_reset_requests;
create policy "password_reset_requests staff all" on password_reset_requests
  for all using (ps_is_admin()) with check (ps_is_admin());

notify pgrst, 'reload schema';
commit;
