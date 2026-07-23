-- Enable RLS on all tables
alter table if exists public.studios        enable row level security;
alter table if exists public.companies      enable row level security;
alter table if exists public.contacts       enable row level security;
alter table if exists public.orders         enable row level security;
alter table if exists public.order_lines    enable row level security;
alter table if exists public.inventory_items enable row level security;
alter table if exists public.units          enable row level security;
alter table if exists public.kits           enable row level security;
alter table if exists public.kit_items      enable row level security;
alter table if exists public.sets           enable row level security;
alter table if exists public.roster_entries enable row level security;
alter table if exists public.set_units      enable row level security;
alter table if exists public.events         enable row level security;

-- Catalog / Calendar: public read access
create policy "anon_read_inventory_items"
  on public.inventory_items for select using (true);

create policy "anon_read_units"
  on public.units for select using (true);

create policy "anon_read_sets"
  on public.sets for select using (true);

create policy "anon_read_set_units"
  on public.set_units for select using (true);

create policy "anon_read_studios"
  on public.studios for select using (true);

create policy "anon_read_kits"
  on public.kits for select using (true);

create policy "anon_read_kit_items"
  on public.kit_items for select using (true);

-- PII: authenticated staff only
create policy "auth_read_contacts"
  on public.contacts for select to authenticated using (true);

create policy "auth_read_companies"
  on public.companies for select to authenticated using (true);

create policy "auth_read_orders"
  on public.orders for select to authenticated using (true);

create policy "auth_read_order_lines"
  on public.order_lines for select to authenticated using (true);

create policy "auth_read_roster_entries"
  on public.roster_entries for select to authenticated using (true);

-- Staff can write (authenticated)
create policy "auth_write_sets"
  on public.sets for all to authenticated using (true) with check (true);

create policy "auth_write_set_units"
  on public.set_units for all to authenticated using (true) with check (true);

create policy "auth_write_contacts"
  on public.contacts for all to authenticated using (true) with check (true);

create policy "auth_write_companies"
  on public.companies for all to authenticated using (true) with check (true);

create policy "auth_write_orders"
  on public.orders for all to authenticated using (true) with check (true);

create policy "auth_write_order_lines"
  on public.order_lines for all to authenticated using (true) with check (true);

create policy "auth_write_inventory_items"
  on public.inventory_items for all to authenticated using (true) with check (true);

create policy "auth_write_units"
  on public.units for all to authenticated using (true) with check (true);

create policy "auth_write_roster_entries"
  on public.roster_entries for all to authenticated using (true) with check (true);

-- Events: authenticated read-only (logged by triggers)
create policy "auth_read_events"
  on public.events for select to authenticated using (true);
