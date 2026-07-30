-- Set label on an order.
--
-- A studio runs up to MAX_SETS_PER_DAY shoots a day, and the crew identifies
-- them by their own designation ("OMSet1", "Set 2", "A") — the same string that
-- ends their job names (20260716_AT_MAIN_SepMM_Missy_OMSet1). Until now that was
-- only ever buried inside the free-text job name, so nothing could show or find
-- it on its own.
--
-- Free text, hand-typed, like `po_number`: it has to match whatever the crew
-- calls the set, not a value we invent. Deliberately on `orders` rather than on
-- `sets`: the three sub-rental history orders have no Set row of their own, and a
-- field that silently drops what you typed is worse than no field.
alter table public.orders add column if not exists set_label text;

comment on column public.orders.set_label is
  'Hand-typed set designation within the job (e.g. OMSet1). Free text.';
