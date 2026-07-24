-- Team accounts + action attribution.

-- One profile per auth user (the equipment team). Attribution FKs point here.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'crew' check (role in ('admin', 'crew')),
  email      text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles_read_auth" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile whenever an auth user is created.
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'crew'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- Attribution columns. created_by defaults to the acting user.
alter table public.sets
  add column if not exists created_by uuid references public.profiles(id) default auth.uid();
alter table public.set_units
  add column if not exists signed_out_by uuid references public.profiles(id);
alter table public.set_units
  add column if not exists scanned_by uuid references public.profiles(id);

-- Stamp the acting user into the event log (scan/signature history).
create or replace function public.fn_log_set_unit_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id, actor_id, data)
    values (new.status, 'unit', new.unit_id, new.unit_id, new.set_id, auth.uid(),
            jsonb_build_object('reserved_from', new.reserved_from, 'reserved_to', new.reserved_to));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id, actor_id)
    values (new.status, 'unit', new.unit_id, new.unit_id, new.set_id, auth.uid());
  elsif tg_op = 'DELETE' then
    insert into public.events(event_type, entity_type, entity_id, unit_id, set_id, actor_id)
    values ('released', 'unit', old.unit_id, old.unit_id, old.set_id, auth.uid());
  end if;
  return coalesce(new, old);
end $$;

-- Login required for everything: restrict catalog/calendar reads from public
-- (anon) to authenticated only.
drop policy if exists "anon_read_inventory_items" on public.inventory_items;
drop policy if exists "anon_read_units" on public.units;
drop policy if exists "anon_read_sets" on public.sets;
drop policy if exists "anon_read_set_units" on public.set_units;
drop policy if exists "anon_read_studios" on public.studios;
drop policy if exists "anon_read_kits" on public.kits;
drop policy if exists "anon_read_kit_items" on public.kit_items;

create policy "auth_read_inventory_items" on public.inventory_items for select to authenticated using (true);
create policy "auth_read_units" on public.units for select to authenticated using (true);
create policy "auth_read_sets" on public.sets for select to authenticated using (true);
create policy "auth_read_set_units" on public.set_units for select to authenticated using (true);
create policy "auth_read_studios" on public.studios for select to authenticated using (true);
create policy "auth_read_kits" on public.kits for select to authenticated using (true);
create policy "auth_read_kit_items" on public.kit_items for select to authenticated using (true);
