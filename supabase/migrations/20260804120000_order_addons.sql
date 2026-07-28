-- Add-On packing lists (epic #6, 6.4).
--
-- After a job is confirmed and its main packing list is printed/signed, the
-- crew still needs to add gear on the shoot day WITHOUT rewriting the main list.
-- An add-on is a labelled supplementary list hanging off the order, with its own
-- equipment lines (same shape as order_lines) — so the main order_lines are
-- never touched. Each add-on prints its own packing list and has its own digital
-- checklist (sign-offs reuse packing_signoffs, keyed with an `addon:<id>::`
-- prefix so they don't collide with the main list's lines).
create table if not exists public.order_addons (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  label      text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_order_addons_order on public.order_addons (order_id, created_at);

create table if not exists public.addon_lines (
  id                uuid primary key default gen_random_uuid(),
  addon_id          uuid not null references public.order_addons(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity          int not null default 1 check (quantity > 0),
  kit_id            uuid references public.kits(id) on delete set null,
  unit_id           uuid references public.units(id) on delete set null,
  slot_label        text,
  source            text not null default 'in_house' check (source in ('in_house', 'sub_rental')),
  vendor_company_id uuid references public.companies(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_addon_lines_addon on public.addon_lines (addon_id);

alter table public.order_addons enable row level security;
alter table public.addon_lines enable row level security;
create policy "auth_read_order_addons"  on public.order_addons for select to authenticated using (true);
create policy "auth_write_order_addons" on public.order_addons for all    to authenticated using (true) with check (true);
create policy "auth_read_addon_lines"   on public.addon_lines  for select to authenticated using (true);
create policy "auth_write_addon_lines"  on public.addon_lines  for all    to authenticated using (true) with check (true);
