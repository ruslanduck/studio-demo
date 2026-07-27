-- People database (Build order #4, 4.1 + 4.2).
--
-- `contacts` already existed as the roster lookup (name + company + email/phone,
-- linked to jobs through roster_entries). 4.1/4.2 turn it into a real People
-- module:
--   • category / subcategory — the freelancer taxonomy (Freelancer ▸ photographer,
--     art director, hair & makeup, assistant, digital tech; Rental company ▸ …).
--     Free text rather than an enum so the crew can grow the taxonomy without a
--     migration (same approach as inventory categories in 2.3).
--   • profile — a person may have a website OR an Instagram OR an attached CV, and
--     rarely all three. Separate nullable columns: the card shows whichever exist,
--     nothing is forced.
alter table public.contacts
  add column if not exists category    text,
  add column if not exists subcategory text,
  add column if not exists website     text,
  add column if not exists instagram   text,
  add column if not exists cv_url      text,
  add column if not exists cv_filename text;

create index if not exists idx_contacts_category on public.contacts (category, subcategory);

-- Companies carry a free-text type ("rental company", "modeling agency",
-- "messenger service", …). The existing `kind` check column stays as the coarse
-- client/vendor/both flag; this is the user-facing value whose option list becomes
-- editable in 4.3.
alter table public.companies
  add column if not exists company_type text;

-- CV attachments live in a public storage bucket: the file is a document the crew
-- shares anyway, and a public URL keeps the demo simple (no signed-URL plumbing).
insert into storage.buckets (id, name, public)
  values ('cvs', 'cvs', true)
  on conflict (id) do nothing;

drop policy if exists "public_read_cvs"  on storage.objects;
drop policy if exists "auth_write_cvs"   on storage.objects;
create policy "public_read_cvs" on storage.objects
  for select using (bucket_id = 'cvs');
create policy "auth_write_cvs" on storage.objects
  for all to authenticated using (bucket_id = 'cvs') with check (bucket_id = 'cvs');
