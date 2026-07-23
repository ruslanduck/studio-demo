-- Seed: Studios
insert into public.studios (id, label) values
  ('1', 'Studio 1'),
  ('2', 'Studio 2'),
  ('3', 'Studio 3'),
  ('4', 'Studio 4'),
  ('5', 'Studio 5'),
  ('L', 'Studio L')
on conflict (id) do nothing;

-- Seed: Sample Company (AnnTaylor Rental)
insert into public.companies (id, name, kind) values
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'AnnTaylor Rental', 'both')
on conflict (id) do nothing;

-- Seed: Sample Contacts (Photographers, Models)
insert into public.contacts (company_id, full_name, email) values
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Ann Taylor', 'ann@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Marcus Reed', 'marcus@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Sofia Ventura', 'sofia@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Liam Chen', 'liam@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Priya Nair', 'priya@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Diego Alvarez', 'diego@anntaylor.com'),
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'Noah Kim', 'noah@anntaylor.com')
on conflict do nothing;

-- Seed: Sample Inventory Items (essential kit for demo)
insert into public.inventory_items (name, category) values
  ('Apple Wireless Magic Keyboard', 'Computers'),
  ('Apple Wireless Magic Mouse', 'Computers'),
  ('Canon EOS R5', 'Camera'),
  ('Aputure 600D Pro', 'Electric/Lighting'),
  ('Sandbag 25lb', 'Grip'),
  ('C-Stand 40" w/ Grip Arm', 'Grip'),
  ('HDMI Cable 10ft', 'Cables')
on conflict do nothing;
