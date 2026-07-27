-- Equipment entry + estimate (epic #5, 5.3 + 5.4).
--
-- 5.3 — an order's equipment can arrive three ways: a-la-carte items, whole kits
-- (staged through the epic-3 window, which pins specific units to slots), and
-- predefined scenario lists. `order_lines` only knew (item, quantity), so it
-- gains the columns needed to remember where a line came from:
--   kit_id     — the kit this line belongs to, so the order can group and re-edit
--                a kit's composition after it was added.
--   unit_id    — the concrete unit the staging window assigned to a slot.
--   slot_label — the slot's label ("Monitor"), for display inside the group.
alter table public.order_lines
  add column if not exists kit_id     uuid references public.kits(id) on delete set null,
  add column if not exists unit_id    uuid references public.units(id) on delete set null,
  add column if not exists slot_label text;

create index if not exists idx_order_lines_kit  on public.order_lines (kit_id);
create index if not exists idx_order_lines_unit on public.order_lines (unit_id);

-- 5.4 — the estimate totals equipment cost, so an item needs a rental rate.
-- `replacement_price` already existed but means something else (insurance value)
-- and is only filled for a few items, so this is a separate column.
alter table public.inventory_items
  add column if not exists day_rate numeric(10, 2);
