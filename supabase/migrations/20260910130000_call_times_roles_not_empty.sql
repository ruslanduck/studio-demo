-- Fix the guard added an hour earlier in 20260910120000: it did not guard.
--
-- `check (array_length(roles, 1) >= 1)` looks right and is a no-op for the one
-- case it was written for. For an EMPTY array `array_length('{}', 1)` returns
-- **NULL**, not 0 — dimension 1 does not exist — and a CHECK constraint treats
-- NULL as satisfied. So `roles = '{}'` was accepted: verified against the real
-- database, an insert with no roles went straight in.
--
-- `cardinality` counts elements rather than measuring a dimension, so it
-- returns 0 for an empty array and the comparison is a real test.
--
-- The app never writes such a row (normalizeCallTimes drops it and the form says
-- so out loud), which is exactly why this had to be caught here: a constraint
-- that reads as a guarantee and isn't one is worse than no constraint.
alter table public.set_call_times
  drop constraint if exists set_call_times_roles_check;

do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.set_call_times'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%array_length%'
  loop
    execute format('alter table public.set_call_times drop constraint %I', c.conname);
  end loop;
end $$;

-- Clear anything the broken check let through, so the constraint can be added.
delete from public.set_call_times where cardinality(roles) is null or cardinality(roles) < 1;

alter table public.set_call_times
  add constraint set_call_times_roles_not_empty check (cardinality(roles) >= 1);
