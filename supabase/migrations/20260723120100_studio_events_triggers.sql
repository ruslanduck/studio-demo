-- Event log: append-only history of unit usage
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  event_type  text not null,
  entity_type text not null,
  entity_id   uuid not null,
  unit_id     uuid references public.units(id),
  set_id      uuid references public.sets(id),
  data        jsonb not null default '{}'::jsonb
);

create index if not exists idx_events_unit_id_desc on public.events (unit_id, occurred_at desc);
create index if not exists idx_events_set_id_desc on public.events (set_id, occurred_at desc);
create index if not exists idx_events_entity on public.events (entity_type, entity_id, occurred_at desc);

-- Auto-log lifecycle of set_units
create or replace function public.fn_log_set_unit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id, data)
    values (new.status, 'unit', new.unit_id, new.unit_id, new.set_id,
            jsonb_build_object('reserved_from', new.reserved_from, 'reserved_to', new.reserved_to));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id)
    values (new.status, 'unit', new.unit_id, new.unit_id, new.set_id);
  elsif tg_op = 'DELETE' then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id)
    values ('released', 'unit', old.unit_id, old.unit_id, old.set_id);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_set_units_events on public.set_units;
create trigger trg_set_units_events
  after insert or update or delete on public.set_units
  for each row execute function public.fn_log_set_unit_change();
