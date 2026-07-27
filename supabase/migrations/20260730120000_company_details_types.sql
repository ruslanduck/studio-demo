-- Company database (Build order #4, 4.3 + 4.4 + 4.5).
--
-- 4.3 — the fields a coordinator actually needs to reach a company: address,
--       opening hours, website, email, phone. Opening hours stay free text
--       ("Mon–Fri 9:00–18:00 · Sat 10:00–14:00") because that is how the crew
--       writes them; a structured week buys nothing for a pickup call.
alter table public.companies
  add column if not exists address       text,
  add column if not exists opening_hours text,
  add column if not exists website       text,
  add column if not exists email         text,
  add column if not exists phone         text;

-- 4.4 — the Type dropdown is user-editable, so its options live in a table
-- rather than a check constraint or a hardcoded list. companies.company_type
-- keeps storing the value as text (renaming a type doesn't orphan a company,
-- and deleting a type leaves existing companies untouched).
create table if not exists public.company_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.company_types enable row level security;
drop policy if exists "auth_read_company_types"  on public.company_types;
drop policy if exists "auth_write_company_types" on public.company_types;
create policy "auth_read_company_types"  on public.company_types
  for select to authenticated using (true);
create policy "auth_write_company_types" on public.company_types
  for all    to authenticated using (true) with check (true);

-- Base set — the crew adds their own from the UI.
insert into public.company_types (name, position) values
  ('Rental company',     0),
  ('Modeling agency',    1),
  ('Messenger service',  2),
  ('Production company', 3),
  ('Studio',             4),
  ('Client',             5)
on conflict (name) do nothing;

-- 4.5 — a sub-rented unit is rented FROM a company, and the company card lists
-- that history. Ownership already says whether a unit is sub-rented; this names
-- the vendor it came from.
alter table public.units
  add column if not exists sub_rental_vendor_id uuid references public.companies(id) on delete set null;

create index if not exists idx_units_sub_rental_vendor on public.units (sub_rental_vendor_id);
