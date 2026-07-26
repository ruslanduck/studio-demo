-- Kits (Build order #3, 3.1). A kit is a named bundle of a-la-carte items —
-- the second inventory "entry type" alongside single items. Its composition is
-- a list of slots (one component each). Slot typing (FIXED / GENERIC) and the
-- fixed-unit binding come in 3.3; here a slot is just (item, label, position).
alter table public.kits add column if not exists category text;

-- Writable by staff (the original schema only granted read on kits).
drop policy if exists "auth_write_kits" on public.kits;
create policy "auth_write_kits" on public.kits for all to authenticated using (true) with check (true);

create table if not exists public.kit_slots (
  id                uuid primary key default gen_random_uuid(),
  kit_id            uuid not null references public.kits(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  label             text,               -- display label for the slot, e.g. "Monitor"
  position          int not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_kit_slots_kit on public.kit_slots (kit_id, position);

alter table public.kit_slots enable row level security;
create policy "auth_read_kit_slots"  on public.kit_slots for select to authenticated using (true);
create policy "auth_write_kit_slots" on public.kit_slots for all    to authenticated using (true) with check (true);
