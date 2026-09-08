-- Brand and shoot Type on a JOB (the record this codebase calls `orders`).
--
-- Both requested as FILTERS on the jobs list, which means they first have to be
-- recorded. Neither could be derived from what was already there: `company_id`
-- holds agencies and rental houses (Atlas Model Management, Northlight Rentals,
-- Swiftline Couriers), not the brand being shot for, and the studio's job-name
-- convention (20260716_AT_MAIN_SepMM_Missy_OMSet1) encodes season and line —
-- not brand, not type.
--
-- FREE TEXT, not a check constraint, for both:
--   • brand — a new client arrives and refusing to book them is absurd.
--   • job_type — asked for as "Editorial or PDP", and those two ship as the
--     offered defaults, but a closed list has been a dead end twice in this app
--     already (item categories, subcategories). The UI merges the defaults with
--     whatever the register actually uses, so the filter always finds real data
--     and a third type needs no migration.
--
-- Nullable: every existing job predates both fields and inventing values would
-- be worse than an empty cell. The UI renders "—" and the filters offer only
-- values that exist.
alter table public.orders
  add column if not exists brand    text,
  add column if not exists job_type text;

comment on column public.orders.brand is
  'Who the shoot is for (free text, e.g. Nike). Not companies.id — that column holds agencies and vendors.';
comment on column public.orders.job_type is
  'Kind of shoot. Editorial / PDP are the offered defaults; free text so a new kind needs no migration.';

-- The jobs list filters on both, and a studio accumulates jobs indefinitely.
create index if not exists idx_orders_brand    on public.orders (brand)    where archived_at is null;
create index if not exists idx_orders_job_type on public.orders (job_type) where archived_at is null;
