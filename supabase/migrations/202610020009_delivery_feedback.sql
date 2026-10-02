-- ============================================================================
-- X (2026-10-02) — DELIVERY FEEDBACK: the customer can say WHY, not just how
-- many stars (202609250008 only stored 1–5).
--
--   tags               quick reasons (late, rude, careless, polite, fast …)
--   comment            optional words, ≤ 500 characters
--   feedback_at        when the feedback was given — it can be given ONCE
--                      (the app updates `where feedback_at is null`)
--   hidden_from_rider  staff can keep an abusive / unfair comment from the
--                      rider (staff still see it)
--
-- delivery_ratings stays service-role only (RLS on, no policies): customers
-- are anonymous to riders; riders read only their own through the API.
-- ============================================================================

begin;

alter table delivery_ratings
  add column if not exists tags              text[]      not null default '{}',
  add column if not exists comment           text,
  add column if not exists feedback_at       timestamptz,
  add column if not exists hidden_from_rider boolean     not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_ratings_comment_len') then
    alter table delivery_ratings
      add constraint delivery_ratings_comment_len
      check (comment is null or char_length(comment) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_ratings_tags_known') then
    alter table delivery_ratings
      add constraint delivery_ratings_tags_known
      check (
        cardinality(tags) <= 5
        and tags <@ array['late','rude','careless','wrong_order','unreachable','polite','fast','careful']::text[]
      );
  end if;
end $$;

create index if not exists idx_delivery_ratings_created on delivery_ratings (created_at desc);

notify pgrst, 'reload schema';

commit;
