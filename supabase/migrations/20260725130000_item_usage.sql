-- Work history / usage log (Build order #2, 2.7). Item-level usage events for
-- ALL item types (barcoded / non-barcoded / consumable): where + when a piece
-- of gear was used, and how much. This is the analytics foundation — e.g.
-- "how many J-hooks did we go through this year" is sum(quantity) over a range.
--
-- job_title / studio_id are denormalized so a usage row survives its set being
-- deleted, and so historical usage can be recorded without a real `sets` row.
create table if not exists public.item_usage (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  set_id            uuid references public.sets(id) on delete set null,
  job_title         text,                 -- what it was used for (job / set name)
  studio_id         text references public.studios(id),
  quantity          int not null default 1 check (quantity > 0),
  used_on           date not null default current_date,
  note              text,
  created_by        uuid references public.profiles(id) default auth.uid(),
  created_at        timestamptz not null default now()
);

create index if not exists idx_item_usage_item on public.item_usage (inventory_item_id, used_on desc);

alter table public.item_usage enable row level security;
create policy "auth_read_item_usage"  on public.item_usage for select to authenticated using (true);
create policy "auth_write_item_usage" on public.item_usage for all    to authenticated using (true) with check (true);
