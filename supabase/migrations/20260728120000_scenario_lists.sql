-- Predefined scenario lists (Build order #3, 3.5).
--
-- A scenario list is a named preset for a *type of shoot* — "Loft e-commerce on
-- figure", "Still life", … — that names everything usually pulled for it. Unlike
-- a kit (one physical bundle with slots), a list is a shopping list: it can mix
-- whole KITS and individual a-la-carte ITEMS with quantities.
--
-- When a booking is created the crew picks a list instead of hand-adding every
-- line: the app resolves it into concrete units and the crew edits from there.
-- Applying a list never mutates the list itself (same rule as kit staging).
create table if not exists public.scenario_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                -- loose grouping, e.g. "E-commerce", "Editorial"
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.scenario_list_entries (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.scenario_lists(id) on delete cascade,
  entry_type        text not null check (entry_type in ('item','kit')),
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  kit_id            uuid references public.kits(id) on delete cascade,
  quantity          int  not null default 1 check (quantity > 0),
  position          int  not null default 0,
  note              text,
  created_at        timestamptz not null default now(),
  -- An entry points at exactly one target, matching its declared type. Kits are
  -- staged one at a time, so a kit entry is always quantity 1.
  constraint scenario_entry_target_ck check (
    (entry_type = 'item' and inventory_item_id is not null and kit_id is null)
    or
    (entry_type = 'kit' and kit_id is not null and inventory_item_id is null and quantity = 1)
  )
);
create index if not exists idx_scenario_entries_list on public.scenario_list_entries (list_id, position);

alter table public.scenario_lists        enable row level security;
alter table public.scenario_list_entries enable row level security;

create policy "auth_read_scenario_lists"  on public.scenario_lists
  for select to authenticated using (true);
create policy "auth_write_scenario_lists" on public.scenario_lists
  for all    to authenticated using (true) with check (true);
create policy "auth_read_scenario_entries"  on public.scenario_list_entries
  for select to authenticated using (true);
create policy "auth_write_scenario_entries" on public.scenario_list_entries
  for all    to authenticated using (true) with check (true);
