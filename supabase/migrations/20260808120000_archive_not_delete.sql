-- Archive instead of delete: nothing leaves the database.
--
-- Requested: "Можем сделать так, чтобы из базы по факту ничего не удалялось, а
-- просто архивировалось?" Until now every Delete in the UI was a real DELETE,
-- with the damage spread by the FKs: an item took its units with it, a company
-- quietly detached its people and orders, and a person who had worked a job
-- could not be removed at all (roster_entries is RESTRICT).
--
-- An archived row keeps every foreign key intact, so there is nothing to
-- cascade, nothing to detach and nothing to refuse. The app filters archived
-- records out of lists, pickers and availability — NOT out of its reads, so a
-- past order still shows the name of gear that has since been written off.
--
-- The line: the ten tables below are the things with their own identity and
-- card. The CONTENTS of a document (order_lines, addon_lines, kit_slots,
-- scenario_list_entries, set_units, roster_entries, packing_signoffs) are still
-- replaced wholesale on save and keep their DELETE — what changed there is
-- already recorded in `events` (see lib/activity.js diffOrderLines).

-- 1. The archive columns ----------------------------------------------------

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.sets
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.inventory_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.units
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.contacts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.companies
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.kits
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.scenario_lists
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.order_addons
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.company_types
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

-- Partial indexes for the hot lists: the live rows are what every screen reads.
create index if not exists idx_orders_live          on public.orders (starts_on)      where archived_at is null;
create index if not exists idx_sets_live            on public.sets (date)             where archived_at is null;
create index if not exists idx_inventory_items_live on public.inventory_items (name)  where archived_at is null;
create index if not exists idx_units_live           on public.units (inventory_item_id) where archived_at is null;
create index if not exists idx_contacts_live        on public.contacts (full_name)    where archived_at is null;

-- 2. Take DELETE away from the app -----------------------------------------
--
-- Each of these tables carried ONE blanket `for all` policy, which includes
-- DELETE. Replacing it with explicit insert + update policies means the
-- guarantee is enforced by Postgres, not by convention: even a bug in the
-- frontend cannot destroy a row. `service_role` bypasses RLS, so seeding and
-- genuine cleanup still work.
--
-- Policy names are recreated verbatim where they existed so a re-run is clean.

-- orders
drop policy if exists "auth_write_orders" on public.orders;
create policy "auth_insert_orders" on public.orders
  for insert to authenticated with check (true);
create policy "auth_update_orders" on public.orders
  for update to authenticated using (true) with check (true);

-- sets (the shoots)
drop policy if exists "auth_write_sets" on public.sets;
create policy "auth_insert_sets" on public.sets
  for insert to authenticated with check (true);
create policy "auth_update_sets" on public.sets
  for update to authenticated using (true) with check (true);

-- inventory_items
drop policy if exists "auth_write_inventory_items" on public.inventory_items;
create policy "auth_insert_inventory_items" on public.inventory_items
  for insert to authenticated with check (true);
create policy "auth_update_inventory_items" on public.inventory_items
  for update to authenticated using (true) with check (true);

-- units
drop policy if exists "auth_write_units" on public.units;
create policy "auth_insert_units" on public.units
  for insert to authenticated with check (true);
create policy "auth_update_units" on public.units
  for update to authenticated using (true) with check (true);

-- contacts (people)
drop policy if exists "auth_write_contacts" on public.contacts;
create policy "auth_insert_contacts" on public.contacts
  for insert to authenticated with check (true);
create policy "auth_update_contacts" on public.contacts
  for update to authenticated using (true) with check (true);

-- companies
drop policy if exists "auth_write_companies" on public.companies;
create policy "auth_insert_companies" on public.companies
  for insert to authenticated with check (true);
create policy "auth_update_companies" on public.companies
  for update to authenticated using (true) with check (true);

-- kits
drop policy if exists "auth_write_kits" on public.kits;
create policy "auth_insert_kits" on public.kits
  for insert to authenticated with check (true);
create policy "auth_update_kits" on public.kits
  for update to authenticated using (true) with check (true);

-- scenario_lists
drop policy if exists "auth_write_scenario_lists" on public.scenario_lists;
create policy "auth_insert_scenario_lists" on public.scenario_lists
  for insert to authenticated with check (true);
create policy "auth_update_scenario_lists" on public.scenario_lists
  for update to authenticated using (true) with check (true);

-- order_addons
drop policy if exists "auth_write_order_addons" on public.order_addons;
create policy "auth_insert_order_addons" on public.order_addons
  for insert to authenticated with check (true);
create policy "auth_update_order_addons" on public.order_addons
  for update to authenticated using (true) with check (true);

-- company_types
drop policy if exists "auth_write_company_types" on public.company_types;
create policy "auth_insert_company_types" on public.company_types
  for insert to authenticated with check (true);
create policy "auth_update_company_types" on public.company_types
  for update to authenticated using (true) with check (true);
