-- Repair log (Build order #2, 2.6). Per-unit repair history: a unit can be
-- sent out for repair (e.g. to Canon) with an issue description, and later
-- marked returned with a resolution. A unit with an OPEN repair (returned_at
-- is null) is unavailable — the app derives status 'in_repair' from this.
create table if not exists public.repairs (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  vendor      text,                     -- who's fixing it, e.g. "Canon"
  issue       text,                     -- reported fault / what happened
  sent_at     date not null default current_date,
  returned_at date,                     -- null while still out for repair
  resolution  text,                     -- what was done (filled on return)
  cost        numeric(12, 2),           -- optional repair cost
  created_by  uuid references public.profiles(id) default auth.uid(),
  returned_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_repairs_unit_id on public.repairs (unit_id, sent_at desc);

-- A unit can only have one open repair at a time.
create unique index if not exists uq_repairs_open_per_unit
  on public.repairs (unit_id) where (returned_at is null);

-- Stamp the acting user when a repair is closed (returned_at goes null -> set).
create or replace function public.fn_stamp_repair_return()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.returned_at is null and new.returned_at is not null then
    new.returned_by := coalesce(new.returned_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_repairs_stamp_return on public.repairs;
create trigger trg_repairs_stamp_return
  before update on public.repairs
  for each row execute function public.fn_stamp_repair_return();

-- RLS: authenticated staff read + write (same pattern as the other tables).
alter table public.repairs enable row level security;
create policy "auth_read_repairs"  on public.repairs for select to authenticated using (true);
create policy "auth_write_repairs" on public.repairs for all    to authenticated using (true) with check (true);
