-- Kit slot typing (Build order #3, 3.3). Two slot kinds:
--   FIXED   — bound to one specific unit (e.g. a monitor mounted in a capture
--             cart). Staging always pulls that exact unit; no scan.
--   GENERIC — bound only to a component *item*. The concrete unit is chosen at
--             pull time by scanning a barcode.
-- This models the "slot definition vs slot fill" split: the definition (this
-- table) says what the slot is; the fill (decided per booking, frontend-only)
-- says which unit satisfies it for a given add-to-set.
alter table public.kit_slots
  add column if not exists slot_type     text not null default 'generic'
    check (slot_type in ('fixed','generic')),
  add column if not exists fixed_unit_id uuid references public.units(id) on delete restrict;

-- Invariant: a fixed slot must name its unit; a generic slot must not.
do $$ begin
  alter table public.kit_slots add constraint kit_slots_fixed_unit_ck
    check ( (slot_type = 'fixed'    and fixed_unit_id is not null)
         or (slot_type = 'generic' and fixed_unit_id is null) );
exception when duplicate_object then null; end $$;

create index if not exists idx_kit_slots_fixed_unit on public.kit_slots (fixed_unit_id);
