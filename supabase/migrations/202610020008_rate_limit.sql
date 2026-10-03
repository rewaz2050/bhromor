-- ============================================================================
-- P (2026-10-02) — DURABLE RATE LIMIT for the public write routes.
--
-- The in-memory limiter keeps one bucket per serverless instance, so an
-- attacker who is routed across instances (or waits for a cold start) gets
-- many times the intended allowance. This is the shared counter: one row per
-- key, one atomic upsert per hit, so every instance sees the same number.
--
--   rate_limit_hits        RLS on, NO policies → only the service role touches it.
--   ps_rate_limit_hit(...) SERVICE ROLE ONLY. Fixed window, atomic:
--                          returns (allowed, retry_after_sec).
--
-- The app treats this as a SECOND opinion: it never makes a request fail when
-- this file has not been run or the database hiccups (the in-memory limiter
-- still applies), so running it is an upgrade, not a prerequisite.
-- ============================================================================

begin;

create table if not exists rate_limit_hits (
  key      text primary key,
  hits     integer     not null,
  reset_at timestamptz not null
);

alter table rate_limit_hits enable row level security;

create index if not exists idx_rate_limit_hits_reset on rate_limit_hits (reset_at);

create or replace function ps_rate_limit_hit(p_key text, p_limit int, p_window_ms int)
returns table (allowed boolean, retry_after_sec int)
language plpgsql security definer set search_path = public as $$
declare
  v_window interval;
  v_hits   int;
  v_reset  timestamptz;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'bad key';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'bad limit';
  end if;
  if p_window_ms is null or p_window_ms < 1000 or p_window_ms > 86400000 then
    raise exception 'bad window';
  end if;
  v_window := make_interval(secs => p_window_ms / 1000.0);

  -- Housekeeping, ~2% of calls: forget buckets that ended more than an hour ago.
  if random() < 0.02 then
    delete from rate_limit_hits where reset_at < now() - interval '1 hour';
  end if;

  insert into rate_limit_hits as t (key, hits, reset_at)
  values (p_key, 1, now() + v_window)
  on conflict (key) do update
    set hits     = case when t.reset_at <= now() then 1 else t.hits + 1 end,
        reset_at = case when t.reset_at <= now() then now() + v_window else t.reset_at end
  returning t.hits, t.reset_at into v_hits, v_reset;

  allowed := v_hits <= p_limit;
  retry_after_sec := greatest(1, ceil(extract(epoch from (v_reset - now())))::int);
  return next;
end $$;

revoke all on function ps_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function ps_rate_limit_hit(text, int, int) to service_role;

notify pgrst, 'reload schema';

commit;
