-- Call times per role, and one wrap time for the shoot.
--
-- Requested: "Replace generic time field with call times (producer /
-- photographer / crew) + shoot wrap time … отдельные поля под call time
-- сотрудников … неограниченное количество колл таймов … а могу вообще не
-- задавать. Отдельно задаю shoot wrap time."
--
-- The previous change took the generic start/end time off a set, because the
-- studio grid is studio × day and those times said nothing. This puts time back
-- where it means something: a shoot does not "start at 09:00" — the photographer
-- is called at 08:00, hair and makeup at 09:00, the models at 10:00, and the
-- whole thing wraps at some hour. That is a LIST, of unknown length, and it is
-- allowed to be empty.
--
-- One row per call, with the ROLES it applies to as an array: the crew sets one
-- time for "model + stylist" together, and splitting that into two rows would
-- have the UI grouping them back again on every read.
create table if not exists public.set_call_times (
  id         uuid primary key default gen_random_uuid(),
  set_id     uuid not null references public.sets(id) on delete cascade,
  roles      text[] not null check (array_length(roles, 1) >= 1),
  call_time  time not null,
  note       text,
  -- The order the crew typed them in; times are also sorted on read, but a
  -- position keeps two calls at the same hour stable.
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_set_call_times_set on public.set_call_times (set_id);

-- These are the CONTENTS of a shoot, like order_lines are the contents of a
-- job: replaced wholesale on save, so they keep DELETE. The archive-not-delete
-- rule covers rows with their own identity and card, which a call time has not.
alter table public.set_call_times enable row level security;
create policy "auth_read_set_call_times"  on public.set_call_times for select to authenticated using (true);
create policy "auth_write_set_call_times" on public.set_call_times for all    to authenticated using (true) with check (true);

-- The wrap is ONE time for the shoot, not a per-role call, so it is a column.
--
-- Deliberately NOT reusing `sets.end_time`: that column holds 09:00–18:00
-- defaults that `createSetForOrder` invented for rows nobody typed a time into,
-- and reading those back as "the crew said they wrap at 18:00" would be
-- fabricated data. `start_time`/`end_time` stay as the legacy record — unread.
alter table public.sets
  add column if not exists wrap_time time;

comment on column public.sets.wrap_time is
  'When the shoot wraps. NULL = not set. Separate from the legacy start_time/end_time, which were auto-filled defaults and are no longer read.';
comment on table public.set_call_times is
  'Per-role call times for a shoot. Any number of rows, including none; each row carries the roles it applies to.';
