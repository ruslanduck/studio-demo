-- Drop the `consumable` item type (requested: "consumables больше не нужны
-- вообще, нужно убрать такой тип товаров").
--
-- 2.1 shipped three types; in practice expendable stock behaves exactly like
-- non-barcoded stock — counted by quantity, no unit rows — and the difference
-- that actually mattered (it isn't rented by the day) is carried by
-- `day_rate is null`, not by the type. So the rows convert rather than being
-- deleted: Gaffer Tape and AA Batteries are real stock, referenced by scenario
-- lists and carrying usage history.
update public.inventory_items
   set kind = 'non_barcoded'
 where kind = 'consumable';

-- Tighten the check so the value can't come back through the API. The original
-- constraint came from an inline `check (...)` on `add column`, so Postgres
-- named it — drop whatever check on this table still mentions 'consumable'
-- rather than guessing that name.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.inventory_items'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%consumable%'
  loop
    execute format('alter table public.inventory_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.inventory_items drop constraint if exists inventory_items_kind_check;
alter table public.inventory_items
  add constraint inventory_items_kind_check
  check (kind in ('barcoded', 'non_barcoded'));
