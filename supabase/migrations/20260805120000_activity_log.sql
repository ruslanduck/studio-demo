-- Activity log: who did what, and who last touched an order's equipment.
--
-- The `events` table already existed as an append-only history with an actor and
-- three timeline indexes — but it was write-only: a trigger on set_units fed it
-- and nothing ever read it. Three things blocked using it as the app's activity
-- log, all fixed here.

-- 1. actor_id had NO foreign key, so PostgREST could not embed
--    `actor:profiles!actor_id(full_name)` — an actor id could never be resolved
--    to a name. Verified before adding: every non-null actor_id on prod already
--    points at a real profile (no orphans), so this validates immediately.
alter table public.events
  drop constraint if exists events_actor_id_fkey;
alter table public.events
  add constraint events_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

-- 2. RLS granted SELECT only ("logged by triggers"), so the app could not append
--    its own events. The check keeps the existing no-spoofing property: you may
--    only write events attributed to yourself. The set_units trigger is
--    SECURITY DEFINER, so it keeps working regardless of this policy.
drop policy if exists "auth_insert_events" on public.events;
create policy "auth_insert_events" on public.events
  for insert to authenticated
  with check (actor_id = auth.uid());

-- 3. No index on the actor, so "everything X did" was a full scan.
create index if not exists idx_events_actor_id_desc
  on public.events (actor_id, occurred_at desc);

-- The headline the order list and card show: the person who last changed this
-- order's equipment. `events` keeps the full history; this pair is denormalised
-- so a list of orders doesn't need a query per row.
alter table public.orders
  add column if not exists eq_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists eq_updated_at timestamptz;
