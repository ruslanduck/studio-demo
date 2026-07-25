-- Item fields (Build order #2, 2.2). Item-level attributes on inventory_items.
-- (barcode / serial stay per-unit on the units table; quantity added in 2.1.)
alter table public.inventory_items
  add column if not exists brand             text,
  add column if not exists asset_type        text,
  add column if not exists placement         text,
  add column if not exists subcategory       text,
  add column if not exists purchase_date     date,
  add column if not exists replacement_price numeric(12, 2);
