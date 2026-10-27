-- Separate direct operational column access from private wallet reads.
-- Existing accounting/storage, row policies and service clients are unchanged.
begin;

create or replace function public.ps_read_riders()
returns setof public.riders
language sql stable security definer set search_path = public as $$
  select (jsonb_populate_record(null::public.riders,
    to_jsonb(r) || jsonb_build_object('earnings_balance',
      case when public.ps_can_manage_finance() or r.user_id=auth.uid()
        then r.earnings_balance else null end)
  )).*
  from public.riders r
  where auth.uid() is not null
    and (public.ps_is_admin() or r.user_id=auth.uid());
$$;
revoke all on function public.ps_read_riders() from public, anon;
grant execute on function public.ps_read_riders() to authenticated, service_role;

-- A table SELECT grant overrides individual column restrictions. Remove it,
-- including any explicit private-column grant, before granting operational
-- columns. Future columns are NOT automatically made readable.
revoke select on public.riders from public, anon, authenticated;
revoke select (earnings_balance) on public.riders from public, anon, authenticated;
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns_sql
  from pg_attribute where attrelid='public.riders'::regclass
    and attnum>0 and not attisdropped and attname<>'earnings_balance';
  if columns_sql is null then raise exception 'Rider operational columns missing'; end if;
  execute format('grant select (%s) on public.riders to authenticated',columns_sql);
end $$;

-- SELECT * / RETURNING * against the base table is intentionally denied to
-- authenticated callers, including Admin. Read through ps_read_riders instead.
-- Explicit operational projections still obey existing RLS. Own-Rider and
-- Admin wallets remain readable only through the guarded projection/RPCs.
notify pgrst,'reload schema';
commit;
