-- Digital packing checklist sign-offs (epic #6, 6.2 + 6.5).
--
-- The printable packing list (6.1) has three initial boxes per line — two at
-- sign-out, one at return. This is the DIGITAL form of the same thing: the
-- initials are captured on screen (iPad) so a second packer sees what the first
-- already checked, and the return is a separate double-check.
--
-- One row per packing-list line, keyed by a STABLE line signature
-- (item::slot::barcode) rather than the order_line id, because an order's lines
-- are replaced wholesale whenever its equipment is edited. Each slot records
-- the initials + a timestamp; the initials ARE the "who packed / returned it"
-- the spec asks for.
create table if not exists public.packing_signoffs (
  order_id      uuid not null references public.orders(id) on delete cascade,
  line_key      text not null,
  item_name     text,
  out1_initials text,
  out1_at       timestamptz,
  out2_initials text,
  out2_at       timestamptz,
  ret_initials  text,
  ret_at        timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (order_id, line_key)
);

alter table public.packing_signoffs enable row level security;
create policy "auth_read_packing_signoffs"  on public.packing_signoffs for select to authenticated using (true);
create policy "auth_write_packing_signoffs" on public.packing_signoffs for all    to authenticated using (true) with check (true);
