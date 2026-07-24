-- Single flat role for now: "Equipment Team" with full rights.
-- Granular roles can be added later without code changes — capability mapping
-- lives in src/lib/permissions.js and call sites use can(), never role === '…'.

-- Open up the role column (drop the admin/crew check) so new roles don't need
-- a schema migration; default everyone to the flat team role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role set default 'equipment_team';
update public.profiles set role = 'equipment_team';

-- New signups default to the flat team role too.
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'equipment_team'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;
