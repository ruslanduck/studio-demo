-- A price on the ORDER LINE, not only on the item.
--
-- `inventory_items.day_rate` (5.4) is OUR rate for gear we own, and it is the
-- right default. It is the wrong answer for a SUB-RENTAL line: that gear is the
-- vendor's, the price is whatever this deal costs, and it has nothing to do with
-- our own rate — so until now a sub-rental line was quietly priced at a rate
-- belonging to a different piece of equipment.
--
-- Nullable on purpose: null means "use the item's day rate", which is what every
-- existing row means and what an in-house line normally wants. A typed value
-- overrides it for this line only, so a one-off discount or a vendor's price
-- never edits the item everyone else quotes from.
--
-- `buildEstimate` already reads `line.dayRate ?? item.dayRate`, so the estimate
-- and both PDFs pick this up with no other change.
alter table public.order_lines
  add column if not exists day_rate numeric(12, 2);

comment on column public.order_lines.day_rate is
  'Per-line rate override. Null = fall back to inventory_items.day_rate. Used for sub-rental lines, where the vendor sets the price.';
