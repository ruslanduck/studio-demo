-- The event log is append-only history. Keep events even after the set/unit
-- they reference is deleted, and avoid a FK conflict when deleting a set
-- (its set_units cascade-delete fires a trigger that logs a 'released' event
-- referencing the very set being removed). Drop the hard FKs — the id columns
-- stay as soft references.
alter table public.events drop constraint if exists events_set_id_fkey;
alter table public.events drop constraint if exists events_unit_id_fkey;
