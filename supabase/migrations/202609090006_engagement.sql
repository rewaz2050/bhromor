-- Demo-to-live engagement tables (contact inbox, newsletter, media
-- library) + the public read policy the storefront homepage needs.
--
-- `notifications` and `site_settings` already exist in schema.sql with staff
-- policies; this migration only ADDS what is missing:
--   - contact_messages / newsletter_subscribers / media_library (+ staff RLS)
--   - public SELECT on site_settings for the single 'homepage' key so the
--     storefront can render staff-published CMS copy without a session.
-- Run after 005, in the same one-sequence launch. Safe to re-run the
-- policy/table blocks independently (IF NOT EXISTS / DROP IF EXISTS).

begin;

create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  topic       text not null default 'Order support',
  message     text not null,
  status      text not null default 'new'
              check (status in ('new', 'read', 'replied')),
  created_at  timestamptz not null default now()
);

create table if not exists newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  status      text not null default 'subscribed'
              check (status in ('subscribed', 'unsubscribed')),
  token       uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists media_library (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  alt         text not null default '',
  label       text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_contact_status
  on contact_messages (status, created_at desc);
create index if not exists idx_newsletter_status
  on newsletter_subscribers (status);
create index if not exists idx_media_created
  on media_library (created_at desc);

alter table contact_messages      enable row level security;
alter table newsletter_subscribers enable row level security;
alter table media_library          enable row level security;

drop policy if exists "admin all contact" on contact_messages;
create policy "admin all contact" on contact_messages
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all newsletter" on newsletter_subscribers;
create policy "admin all newsletter" on newsletter_subscribers
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all media library" on media_library;
create policy "admin all media library" on media_library
  for all using (ps_is_admin()) with check (ps_is_admin());

-- The storefront homepage renders this one key for anonymous visitors.
-- Every other site_settings key stays staff-only.
drop policy if exists "homepage public read" on site_settings;
create policy "homepage public read" on site_settings
  for select using (key = 'homepage');

commit;
