-- A shoot can run for SEVERAL DAYS.
--
-- Requested: "Support multi-day job creation" — replace choosing a date plus a
-- start/end TIME with choosing a start date and an end date.
--
-- `orders` already carried a window (`starts_on` / `ends_on`), and so did every
-- reservation (`set_units.reserved_from` / `reserved_to`): availability, billable
-- days and the job search all read a range already. The single-day rule lived in
-- exactly two places — the form, which wrote `ends_on = starts_on`, and THIS
-- table, which has one `date` and therefore could only ever put a chip in one
-- calendar cell.
--
-- So the shoot gets the end of its window too. NULL means "ends the day it
-- starts", which is what every existing row means — no backfill, no invented
-- data, and a pre-migration client (the app is a static bundle on a CDN; a
-- browser can be holding yesterday's JS) keeps working: it never reads or writes
-- this column and its sets stay one-day.
alter table public.sets
  add column if not exists end_date date;

comment on column public.sets.end_date is
  'Last day of the shoot. NULL = a one-day set, ending on `date`. Times (start_time/end_time) are no longer collected — the grid is studio x day.';

-- An end before the start is not a shoot. The UI validates it too, but the UI
-- is not the only thing that can write here.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sets'::regclass
       and conname  = 'sets_end_date_after_date'
  ) then
    alter table public.sets
      add constraint sets_end_date_after_date
      check (end_date is null or end_date >= date);
  end if;
end $$;

-- The studio/day capacity rule (max 5 sets per studio per day) now has to ask
-- "which sets OVERLAP these days", not "which sets are on this date" — so the
-- lookup reads both ends of the window.
create index if not exists idx_sets_studio_window on public.sets (studio_id, date, end_date)
  where archived_at is null;
