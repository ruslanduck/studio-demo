-- Epic #6 — the scanning station: scan-out / scan-in with who and when.
--
-- Why a log table and not a column on set_units: the acceptance criteria ask for
-- the HISTORY of every scan (user + time, both directions). A status column can
-- only hold the latest value, and `events` is the general audit trail, not an
-- operational record the packing station reads on every keystroke.
--
-- set_units.status still moves ('reserved' → 'checked_out' → 'returned'): that is
-- the DB's own model of where the gear is, and both non-returned states occupy
-- the unit, so availability is unaffected by a scan.
create table if not exists public.scans (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  set_id      uuid references public.sets(id) on delete set null,
  -- Soft references, deliberately WITHOUT foreign keys, exactly like
  -- events.unit_id (20260724120000_events_soft_refs.sql): a written-off copy
  -- must not take its scan history down with it.
  unit_id     uuid,
  item_id     uuid,
  barcode     text,
  item_name   text,
  direction   text not null check (direction in ('out', 'in')),
  scanned_by  uuid references public.profiles(id) default auth.uid(),
  scanned_at  timestamptz not null default now()
);

create index if not exists idx_scans_order on public.scans (order_id, scanned_at desc);
create index if not exists idx_scans_unit on public.scans (unit_id, scanned_at desc);

alter table public.scans enable row level security;

-- Readable by the whole studio; append-only for the app (no update, no delete —
-- a scan log you can rewrite is not a log). Nothing is ever deleted here, in
-- keeping with 20260808120000_archive_not_delete.sql.
drop policy if exists scans_select on public.scans;
create policy scans_select on public.scans for select to authenticated using (true);

drop policy if exists scans_insert on public.scans;
create policy scans_insert on public.scans
  for insert to authenticated with check (scanned_by = auth.uid());
