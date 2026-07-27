-- Orders / Estimates (epic #5, 5.1 + 5.2).
--
-- Terminology agreed with Clay:
--   Job   = what we shoot ("Loft e-commerce on figure") — a text job name.
--   Set   = the shoot itself; up to 5 per studio per day, each with its own
--           roster and equipment.
--   Order = the equipment list needed for a set. NOT an e-commerce order.
--
-- The `orders` table existed as a stub (company_id / order_number / status) and
-- 4.5 used it read-only for company history. 5.1 makes it the real thing: an
-- order is created against a studio, working dates, a job name and a
-- photographer, and links to the set it equips through `sets.order_id`.
alter table public.orders
  add column if not exists job_name                text,
  add column if not exists studio_id               text references public.studios(id),
  add column if not exists starts_on               date,
  add column if not exists ends_on                 date,
  add column if not exists photographer_contact_id uuid references public.contacts(id) on delete set null,
  -- 5.2: the accounting PO, typed in by hand so it matches the finance system.
  -- Deliberately NOT unique: one job's PO covers every order raised against it.
  add column if not exists po_number               text,
  -- 5.2: who raised the order. Defaults to the acting user, like the other
  -- attribution columns (created_at already exists).
  add column if not exists created_by              uuid references public.profiles(id) default auth.uid();

-- An order starts life as a HOLD (yellow) and becomes CONFIRMED (green). The
-- pre-existing values stay allowed so the 4.5 history rows remain valid.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('hold', 'draft', 'confirmed', 'fulfilled', 'canceled'));

-- Job search (by PO, job name, dates, photographer).
create index if not exists idx_orders_po        on public.orders (po_number);
create index if not exists idx_orders_job_name  on public.orders (job_name);
create index if not exists idx_orders_dates     on public.orders (starts_on, ends_on);
create index if not exists idx_orders_photog    on public.orders (photographer_contact_id);

-- No RLS changes needed: the original pass already grants authenticated staff
-- read + write on orders and order_lines.
