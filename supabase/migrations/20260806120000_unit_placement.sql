-- Per-unit storage location (where this physical copy lives when it's in).
--
-- The LOCATION column in the units table was never editable because it isn't
-- stored: it's derived on read as "Available" / "In repair — <vendor>" /
-- "<job> — <studio>" from set_units + open repairs. That has to stay derived —
-- after "orders drive reservations", hand-editing where a unit IS would either be
-- silently recomputed away or lie about gear that's out on a job.
--
-- What was actually missing is the other kind of location: the shelf/cage/case a
-- unit goes back to. `inventory_items.placement` (20260724160000) says where the
-- TYPE lives; this says where THIS copy lives, because copies drift apart — one
-- body lives in the van, another in the studio cage. Null means "same as the
-- item's placement", so nothing has to be filled in twice.
alter table public.units
  add column if not exists placement text;

comment on column public.units.placement is
  'Home storage location of this copy (shelf / cage / case). Null = inherit inventory_items.placement. NOT where the unit currently is — that is derived from set_units + repairs.';
