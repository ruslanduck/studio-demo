-- Step 1: Reference tables
create table if not exists public.studios (
  id    text primary key,
  label text not null
);

-- Step 2: Companies & Contacts
create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'client' check (kind in ('client','vendor','both')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  full_name  text not null,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_company_id on public.contacts (company_id);

-- Step 3: Inventory
create table if not exists public.inventory_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  barcode           text not null unique,
  serial            text,
  ownership         text not null default 'owned' check (ownership in ('owned','sub_rental')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_units_inventory_item_id on public.units (inventory_item_id);

-- Step 4: Kits / Packages
create table if not exists public.kits (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.kit_items (
  kit_id            uuid not null references public.kits(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity          int not null default 1 check (quantity > 0),
  primary key (kit_id, inventory_item_id)
);

create index if not exists idx_kit_items_inventory_id on public.kit_items (inventory_item_id);

-- Step 5: Orders
create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete set null,
  order_number text unique,
  status       text not null default 'draft' check (status in ('draft','confirmed','fulfilled','canceled')),
  ordered_at   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_orders_company_id on public.orders (company_id);

create table if not exists public.order_lines (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity          int not null default 1 check (quantity > 0),
  notes             text
);

create index if not exists idx_order_lines_order_id on public.order_lines (order_id);
create index if not exists idx_order_lines_inventory_item_id on public.order_lines (inventory_item_id);

-- Step 6: Sets / Jobs
create table if not exists public.sets (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references public.orders(id) on delete set null,
  studio_id  text references public.studios(id),
  title      text not null,
  date       date not null,
  start_time time,
  end_time   time,
  status     text not null default 'active' check (status in ('active','canceled')),
  color      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sets_order_id on public.sets (order_id);
create index if not exists idx_sets_studio_date on public.sets (studio_id, date);

-- Step 7: Roster (N:M contacts <-> sets)
create table if not exists public.roster_entries (
  id         uuid primary key default gen_random_uuid(),
  set_id     uuid not null references public.sets(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  role       text not null default 'crew',
  created_at timestamptz not null default now(),
  unique (set_id, contact_id, role)
);

create index if not exists idx_roster_entries_set_id on public.roster_entries (set_id);
create index if not exists idx_roster_entries_contact_id on public.roster_entries (contact_id);

-- Step 8: Set Units (CORE: N:M units <-> sets)
create table if not exists public.set_units (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references public.sets(id) on delete cascade,
  unit_id       uuid not null references public.units(id) on delete restrict,
  reserved_from date,
  reserved_to   date,
  status        text not null default 'reserved' check (status in ('reserved','checked_out','returned')),
  created_at    timestamptz not null default now(),
  unique (set_id, unit_id)
);

create index if not exists idx_set_units_set_id on public.set_units (set_id);
create index if not exists idx_set_units_unit_id on public.set_units (unit_id);
