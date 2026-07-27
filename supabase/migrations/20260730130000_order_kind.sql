-- Order direction (Build order #4, 4.5). A company's order history mixes two
-- directions and the card labels them differently:
--   'client'     — the company ordered gear / studio time FROM us.
--   'sub_rental' — we rented gear FROM the company (it acted as vendor).
-- Kept on the order rather than inferred from companies.kind, because a company
-- can be 'both' and each order still has one direction.
alter table public.orders
  add column if not exists kind text not null default 'client'
    check (kind in ('client', 'sub_rental'));

create index if not exists idx_orders_kind on public.orders (kind, company_id);
