-- Inventory taxonomy: categories and subcategories become real, editable rows,
-- and an ITEM belongs to a SUBCATEGORY -- never to a category directly.
--
-- Until now both levels were free TEXT on inventory_items, with the offered
-- values living in a frontend constant. That could not express the studio's
-- rules: a subcategory had no owning category (the same string could sit under
-- two of them -- and on prod "Profoto" and "Broncolor" each did, under Strobes
-- AND Lighting Modification), and "remove a category only if nothing uses it"
-- has nothing to check against when the category is just a string someone typed.
--
-- An item's category is now DERIVED through its subcategory. `subcategory_id`
-- is nullable because 51 of prod's 276 live items have no subcategory at all
-- (whole categories -- Stands, Uncategorized -- have none), and inventing names
-- for them would be fabricating the studio's taxonomy. They read as unassigned,
-- which is what they are, and the bulk-assign tool is how they get placed.
--
-- The legacy `category` / `subcategory` text columns are LEFT IN PLACE and
-- untouched: they are the record of where an item came from (shown as a hint
-- while assigning), and nothing deletes data here.

create table if not exists public.inventory_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id)
);

-- One live category per name. Archived rows are excluded, so retiring "Tools"
-- and later creating it again is legal.
create unique index if not exists idx_inv_categories_name_live
  on public.inventory_categories (lower(name)) where archived_at is null;

create table if not exists public.inventory_subcategories (
  id          uuid primary key default gen_random_uuid(),
  -- NOT NULL is the rule "every subcategory belongs to a category", enforced by
  -- the database rather than by whichever form happens to write it.
  category_id uuid not null references public.inventory_categories(id),
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id)
);

create unique index if not exists idx_inv_subcategories_name_live
  on public.inventory_subcategories (category_id, lower(name)) where archived_at is null;
create index if not exists idx_inv_subcategories_category
  on public.inventory_subcategories (category_id);

alter table public.inventory_items
  add column if not exists subcategory_id uuid references public.inventory_subcategories(id);
create index if not exists idx_inventory_items_subcategory
  on public.inventory_items (subcategory_id);

-- ---------------------------------------------------------------------------
-- RLS. Same shape as every other table since 20260808120000: read and write for
-- authenticated, and NO delete policy -- removing a category archives it.
alter table public.inventory_categories enable row level security;
alter table public.inventory_subcategories enable row level security;

drop policy if exists "auth_read_inventory_categories"   on public.inventory_categories;
drop policy if exists "auth_insert_inventory_categories" on public.inventory_categories;
drop policy if exists "auth_update_inventory_categories" on public.inventory_categories;
create policy "auth_read_inventory_categories" on public.inventory_categories
  for select to authenticated using (true);
create policy "auth_insert_inventory_categories" on public.inventory_categories
  for insert to authenticated with check (true);
create policy "auth_update_inventory_categories" on public.inventory_categories
  for update to authenticated using (true) with check (true);

drop policy if exists "auth_read_inventory_subcategories"   on public.inventory_subcategories;
drop policy if exists "auth_insert_inventory_subcategories" on public.inventory_subcategories;
drop policy if exists "auth_update_inventory_subcategories" on public.inventory_subcategories;
create policy "auth_read_inventory_subcategories" on public.inventory_subcategories
  for select to authenticated using (true);
create policy "auth_insert_inventory_subcategories" on public.inventory_subcategories
  for insert to authenticated with check (true);
create policy "auth_update_inventory_subcategories" on public.inventory_subcategories
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Backfill, from the register's own text. LIVE items only: an archived item is
-- retired stock, out of every list, and its categories would pad the studio's
-- taxonomy with the demo register's old names. Restoring one leaves it
-- unassigned, which the bulk tool places.

insert into public.inventory_categories (name)
select distinct btrim(i.category)
from public.inventory_items i
where i.archived_at is null
  and coalesce(btrim(i.category), '') <> ''
  and not exists (
    select 1 from public.inventory_categories c
    where lower(c.name) = lower(btrim(i.category)) and c.archived_at is null
  );

-- The order the app has always shown these in, so the grouped list does not
-- silently become alphabetical. A category not named here sorts after them.
with wanted(name, pos) as (
  values ('Strobes', 1), ('Lighting Modification', 2), ('Continuous Lighting', 3),
         ('Grip', 4), ('Stands', 5), ('Set', 6), ('Digital', 7), ('Digital Cart', 8),
         ('Camera Support', 9), ('Rolling Monitor Accessories', 10), ('Production', 11),
         ('Front Desk', 12), ('Crew', 13), ('Tools', 14), ('A/V / Events', 15),
         ('Uncategorized', 99)
)
update public.inventory_categories c
set position = w.pos
from wanted w
where lower(c.name) = lower(w.name);

-- One subcategory row per (category, subcategory) PAIR -- which is exactly how
-- the two names shared by Strobes and Lighting Modification keep their meaning
-- instead of being merged into one.
insert into public.inventory_subcategories (category_id, name)
select distinct c.id, btrim(i.subcategory)
from public.inventory_items i
join public.inventory_categories c
  on lower(c.name) = lower(btrim(i.category)) and c.archived_at is null
where i.archived_at is null
  and coalesce(btrim(i.subcategory), '') <> ''
  and not exists (
    select 1 from public.inventory_subcategories s
    where s.category_id = c.id
      and lower(s.name) = lower(btrim(i.subcategory))
      and s.archived_at is null
  );

update public.inventory_items i
set subcategory_id = s.id
from public.inventory_subcategories s
join public.inventory_categories c on c.id = s.category_id
where i.archived_at is null
  and i.subcategory_id is null
  and coalesce(btrim(i.subcategory), '') <> ''
  and lower(c.name) = lower(btrim(i.category))
  and lower(s.name) = lower(btrim(i.subcategory));
