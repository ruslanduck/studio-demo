-- Sub-rental marking per order line (epic #5, 5.6).
--
-- The crew decides what to sub-rent BEFORE a kit is built, so the decision lives
-- on the order line, not on the unit: an in-house line consumes our own stock,
-- a sub-rental line is gear we bring in from a vendor and therefore does NOT
-- consume in-house availability. That distinction is what makes the
-- zero-availability rule workable — at 0 available the answer is either another
-- item or a sub-rental.
alter table public.order_lines
  add column if not exists source text not null default 'in_house'
    check (source in ('in_house', 'sub_rental')),
  add column if not exists vendor_company_id uuid references public.companies(id) on delete set null;

-- An in-house line can't name a vendor. The reverse (a sub-rental line without a
-- vendor yet) stays legal on purpose: the UI blocks saving one, but a
-- half-filled row shouldn't be a database error while the user is still picking.
do $$ begin
  alter table public.order_lines add constraint order_lines_vendor_ck
    check (source = 'sub_rental' or vendor_company_id is null);
exception when duplicate_object then null; end $$;

create index if not exists idx_order_lines_vendor on public.order_lines (vendor_company_id);
