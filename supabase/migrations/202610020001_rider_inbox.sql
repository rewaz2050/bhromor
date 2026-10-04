-- ============================================================================
-- C4 / O (2026-10-02) — RIDER INBOX: office announcements to riders.
--
-- Until now the office had no way to tell riders anything inside the app
-- ("settle by 8pm", "Zindabazar road closed", "your KYC photo is blurry").
-- rider_announcements holds a message either for EVERY rider (rider_id null)
-- or for ONE rider, optionally expiring. rider_inbox_state remembers when
-- each rider last opened the inbox so the app can show an unread badge.
--
-- Writes go through two staff-only SECURITY DEFINER RPCs (ps_is_admin()), so
-- no table grant is needed for staff. Riders read through the app's rider
-- API (service role, scoped to the session rider) — they get no direct table
-- access. Safe to re-run.
-- ============================================================================
begin;

create table if not exists rider_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 1000),
  severity    text not null default 'info' check (severity in ('info', 'important')),
  rider_id    uuid references riders (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  expires_at  timestamptz
);
create index if not exists idx_rider_announcements_recent on rider_announcements (created_at desc);
create index if not exists idx_rider_announcements_rider on rider_announcements (rider_id, created_at desc);

create table if not exists rider_inbox_state (
  rider_id      uuid primary key references riders (id) on delete cascade,
  last_read_at  timestamptz not null default now()
);

alter table rider_announcements enable row level security;
alter table rider_inbox_state enable row level security;

drop policy if exists "rider announcements admin read" on rider_announcements;
create policy "rider announcements admin read" on rider_announcements
  for select using (ps_is_admin());

revoke all on rider_announcements from public, anon, authenticated;
revoke all on rider_inbox_state from public, anon, authenticated;
grant select on rider_announcements to authenticated;
grant select, insert, update, delete on rider_announcements to service_role;
grant select, insert, update, delete on rider_inbox_state to service_role;

-- Staff posts a message. p_rider_id null = everyone. p_expires_hours null/0 = never.
drop function if exists ps_admin_post_announcement(text, text, text, uuid, integer);
create or replace function ps_admin_post_announcement(
  p_title text,
  p_body text default '',
  p_severity text default 'info',
  p_rider_id uuid default null,
  p_expires_hours integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if char_length(v_title) = 0 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;
  if char_length(coalesce(p_body, '')) > 1000 then
    raise exception 'invalid_body';
  end if;
  if p_rider_id is not null and not exists (select 1 from riders where id = p_rider_id) then
    raise exception 'rider_not_found';
  end if;
  insert into rider_announcements (title, body, severity, rider_id, created_by, expires_at)
  values (
    v_title,
    coalesce(p_body, ''),
    case when p_severity = 'important' then 'important' else 'info' end,
    p_rider_id,
    auth.uid(),
    case when coalesce(p_expires_hours, 0) > 0 then now() + make_interval(hours => least(p_expires_hours, 24 * 90)) end
  )
  returning id into v_id;
  return v_id;
end $$;

drop function if exists ps_admin_delete_announcement(uuid);
create or replace function ps_admin_delete_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  delete from rider_announcements where id = p_id;
end $$;

revoke all on function ps_admin_post_announcement(text, text, text, uuid, integer) from public, anon;
revoke all on function ps_admin_delete_announcement(uuid) from public, anon;
grant execute on function ps_admin_post_announcement(text, text, text, uuid, integer) to authenticated, service_role;
grant execute on function ps_admin_delete_announcement(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
