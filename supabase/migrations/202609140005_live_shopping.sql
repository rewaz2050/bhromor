-- ============================================================================
-- P1 #9 (2026-09-14): Live shopping sessions.
--
-- The shop goes live on its OWN streaming platform (YouTube Live, Facebook
-- Live, …) exactly the way it already does; this table is the SHOPPING
-- SURFACE around that real stream:
--
--   * a scheduled session (title, when, the live URL, the pieces the shop
--     will show, in the order it will show them);
--   * a status machine driven by the shop's hands — scheduled → live
--     (when the stream actually starts) → ended (when it stops). The site
--     never claims "LIVE" on a timer: the shop taps Start.
--   * "showing now" — the one piece on air right now, surfaced first on the
--     live page.
--
-- No video is stored or generated here. If the stream URL is YouTube, the
-- site embeds the shop's real live player; any other platform becomes a
-- prominent "watch live" link. Products are real catalog rows at their real
-- prices — live shopping is a discovery + ordering surface, not a price
-- engine.
--
-- RLS: enabled, no public policy — reads go through the service-role
-- /api/live route, writes through the admin API. Same convention as every
-- other table.
-- ============================================================================

begin;

create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 500),
  -- The shop's live URL (YouTube Live, Facebook Live, …). May be empty for a
  -- freshly scheduled session — the link is often only known once the stream
  -- exists, and scheduled sessions are editable until they start.
  stream_url text not null default '' check (char_length(stream_url) <= 500),
  scheduled_start timestamptz not null,
  -- When the shop actually tapped start / ended — the honest timestamps.
  live_at timestamptz,
  ended_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended')),
  -- The one piece on air right now (null = not set / session not live).
  showing_product_id uuid references products (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- state consistency, enforced in one place
  constraint live_sessions_state check (
    case
      when status = 'scheduled' then (live_at is null and ended_at is null)
      when status = 'live'      then (live_at is not null and ended_at is null)
      when status = 'ended'     then (ended_at is not null)
    end
  )
);

create table live_session_products (
  session_id uuid not null references live_sessions (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  position int not null check (position between 1 and 30),
  primary key (session_id, product_id),
  unique (session_id, position)
);

create index idx_live_sessions_status on live_sessions (status, scheduled_start);
create index idx_live_session_products_pos on live_session_products (session_id, position);

alter table live_sessions enable row level security;
alter table live_session_products enable row level security;

-- Keep updated_at honest (the schema's own trigger helper).
drop trigger if exists trg_live_sessions_touch on live_sessions;
create trigger trg_live_sessions_touch
  before update on live_sessions
  for each row execute function ps_touch_updated();

commit;
