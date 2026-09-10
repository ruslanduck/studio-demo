-- A free-text NOTE on a job and on an inventory item.
--
-- Requested: "Добавить поле Note в: job, inventory, people, companies". People
-- and companies already had one — `contacts.notes` and `companies.notes` exist
-- since the very first schema (20260723120000) and both editors already write
-- them — so only these two were missing.
--
-- Deliberately plain TEXT with no length limit and no default: a note is
-- whatever the crew needs to say about this job or this piece of gear
-- ("client brings own backdrop", "focus ring sticks in the cold"), and the one
-- thing it must never do is truncate what someone typed.
--
-- ⚠️ `sets.notes` already exists and is a DIFFERENT note: it belongs to the
-- SHOOT (the legacy BookingModal writes it). This one belongs to the JOB —
-- the record the crew actually opens — which is why it is a new column rather
-- than a read of that one.
alter table public.orders add column if not exists notes text;
alter table public.inventory_items add column if not exists notes text;
