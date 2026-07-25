-- Item types (Build order #2, 2.1):
--   barcoded      → tracked per unit (units table holds barcode/serial/…)
--   non_barcoded  → counted by quantity only (e.g. 50 J-hooks), no unit rows
--   consumable    → expendable, counted by quantity
alter table public.inventory_items
  add column if not exists kind text not null default 'barcoded'
    check (kind in ('barcoded', 'non_barcoded', 'consumable'));

-- On-hand count for non-barcoded / consumable items. Barcoded items derive
-- their count from the units table, so this stays 0 for them.
alter table public.inventory_items
  add column if not exists quantity int not null default 0 check (quantity >= 0);
