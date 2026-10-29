-- Auth administration remains server-only. Re-check the actor's CURRENT
-- database role under a shared transaction lock, not a cached client rank.
begin;
create table if not exists public.staff_role_audit (
 id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
 actor_id uuid not null, target_id uuid not null, before_role text, after_role text
);
alter table public.staff_role_audit enable row level security;
revoke all on public.staff_role_audit from public,anon,authenticated;
grant select on public.staff_role_audit to authenticated;
drop policy if exists staff_role_audit_read on public.staff_role_audit;
create policy staff_role_audit_read on public.staff_role_audit for select to authenticated
using(public.ps_can_manage_finance());
drop trigger if exists trg_staff_role_audit_immutable on public.staff_role_audit;
create trigger trg_staff_role_audit_immutable before update or delete on public.staff_role_audit
for each row execute function public.ps_financial_history_no_delete();
drop trigger if exists trg_staff_role_audit_no_truncate on public.staff_role_audit;
create trigger trg_staff_role_audit_no_truncate before truncate on public.staff_role_audit
for each statement execute function public.ps_financial_history_no_delete();

create or replace function public.ps_change_staff_role(p_actor_id uuid,p_target_id uuid,p_role text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; prior_role text; result public.admin_users%rowtype; next_role public.admin_users.role%type;
begin
 perform pg_advisory_xact_lock(78203,1);
 select role into actor_role from public.admin_users where id=p_actor_id;
 if actor_role is null or actor_role not in ('admin','super_admin') then raise exception 'forbidden: current Admin access required'; end if;
 if p_actor_id=p_target_id then raise exception 'forbidden: cannot change your own access'; end if;
 if p_role is not null and p_role not in ('manager','admin','super_admin') then raise exception 'invalid staff role'; end if;
 select role into prior_role from public.admin_users where id=p_target_id;
 if actor_role<>'super_admin' and (prior_role='super_admin' or p_role='super_admin') then
   raise exception 'forbidden: only Super Admin may change Super Admin access';
 end if;
 if prior_role='super_admin' and p_role is distinct from 'super_admin'
   and (select count(*) from public.admin_users where role='super_admin')<=1 then
   raise exception 'forbidden: last Super Admin must be retained';
 end if;
 if p_role is null then
   if prior_role is null then raise exception 'not staff'; end if;
   delete from public.admin_users where id=p_target_id returning * into result;
 else
   next_role:=p_role;
   insert into public.admin_users(id,role) values(p_target_id,next_role)
   on conflict(id) do update set role=excluded.role returning * into result;
 end if;
 if prior_role is distinct from p_role then
   insert into public.staff_role_audit(actor_id,target_id,before_role,after_role)
   values(p_actor_id,p_target_id,prior_role,p_role);
 end if;
 return to_jsonb(result);
end $$;
-- Never let an authenticated user spoof p_actor_id. Only the already-gated
-- server service client may invoke this narrow administration workflow.
revoke all on function public.ps_change_staff_role(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ps_change_staff_role(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
