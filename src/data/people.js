// People & company seed (Build order #4, 4.1 + 4.2).
//
// People are the studio's roster: freelancers the studio books, plus staff at the
// companies it works with. `company` points at a COMPANY_SEED id — the card links
// both ways. A person's profile is whatever they actually have: a website, an
// Instagram, an attached CV, sometimes none of the three.
//
// Names deliberately match the booking seed's photographers/models so every card
// shows real work history; the extra crew (art director, HMU, …) have none yet,
// which is the honest empty state.

// Company types are free text (the option list becomes user-editable in 4.3).
export const COMPANY_TYPES = [
  'Rental company',
  'Modeling agency',
  'Messenger service',
  'Production company',
  'Studio',
]

// 4.3 adds the fields a coordinator needs to actually reach a company: address,
// opening hours (free text — how the crew writes them), website, email, phone.
export const COMPANY_SEED = [
  {
    id: 'anntaylor-rental',
    name: 'AnnTaylor Rental',
    companyType: 'Studio',
    kind: 'both',
    notes: 'Us — the studio and its own gear pool.',
    address: '412 W 27th St, New York, NY 10001',
    openingHours: 'Mon–Fri 8:00–20:00 · Sat 10:00–16:00',
    website: 'https://anntaylor-rental.example.com',
    email: 'studio@anntaylor.demo',
    phone: '+1 212 555 0100',
  },
  {
    id: 'northlight-rentals',
    name: 'Northlight Rentals',
    companyType: 'Rental company',
    kind: 'vendor',
    notes: 'Primary sub-rental partner for lighting and grip.',
    address: '55 Vandam St, New York, NY 10013',
    openingHours: 'Mon–Fri 7:30–18:30 · Sat 9:00–13:00',
    website: 'https://northlight.example.com',
    email: 'orders@northlight.example.com',
    phone: '+1 212 555 0400',
  },
  {
    id: 'kino-grip-co',
    name: 'Kino & Grip Co.',
    companyType: 'Rental company',
    kind: 'vendor',
    notes: 'Camera bodies and specialty lenses.',
    address: '1820 Flushing Ave, Brooklyn, NY 11237',
    openingHours: 'Mon–Fri 9:00–18:00',
    website: 'https://kinogrip.example.com',
    email: 'rentals@kinogrip.example.com',
    phone: '+1 646 555 0500',
  },
  {
    id: 'atlas-models',
    name: 'Atlas Model Management',
    companyType: 'Modeling agency',
    kind: 'client',
    notes: null,
    address: '270 Lafayette St, New York, NY 10012',
    openingHours: 'Mon–Fri 9:30–18:00',
    website: 'https://atlasmodels.example.com',
    email: 'bookings@atlasmodels.example.com',
    phone: '+1 212 555 0600',
  },
  {
    id: 'vantage-mgmt',
    name: 'Vantage Management',
    companyType: 'Modeling agency',
    kind: 'client',
    notes: null,
    address: '9 Desbrosses St, New York, NY 10013',
    openingHours: 'Mon–Fri 10:00–19:00',
    website: 'https://vantagemgmt.example.com',
    email: 'casting@vantagemgmt.example.com',
    phone: '+1 917 555 0650',
  },
  {
    id: 'swiftline-couriers',
    name: 'Swiftline Couriers',
    companyType: 'Messenger service',
    kind: 'vendor',
    notes: 'Same-day gear runs across the city.',
    address: '640 Dean St, Brooklyn, NY 11238',
    openingHours: 'Mon–Sun 6:00–22:00',
    website: 'https://swiftline.example.com',
    email: 'dispatch@swiftline.example.com',
    phone: '+1 917 555 0700',
  },
]

// category ▸ subcategory taxonomy used by the People filter.
export const PEOPLE_CATEGORIES = {
  Freelancer: [
    'Photographer',
    'Art director',
    'Hair & makeup',
    'Assistant',
    'Digital tech',
    'Stylist',
  ],
  Model: [],
  'Rental company': ['Account manager', 'Warehouse', 'Driver'],
  Agency: ['Booker', 'Agent'],
}

export const PEOPLE_SEED = [
  // --- Freelance photographers (match the booking seed) ---
  {
    name: 'Ann Taylor',
    category: 'Freelancer',
    subcategory: 'Photographer',
    company: 'anntaylor-rental',
    email: 'ann@anntaylor.demo',
    phone: '+1 212 555 0101',
    website: 'https://anntaylor.example.com',
    instagram: '@anntaylorstudio',
  },
  {
    name: 'Marcus Reed',
    category: 'Freelancer',
    subcategory: 'Photographer',
    company: 'anntaylor-rental',
    email: 'marcus@anntaylor.demo',
    phone: '+1 212 555 0102',
    instagram: '@marcusreedphoto',
  },
  {
    name: 'Sofia Ventura',
    category: 'Freelancer',
    subcategory: 'Photographer',
    company: 'anntaylor-rental',
    email: 'sofia@anntaylor.demo',
    phone: '+1 212 555 0103',
    website: 'https://sofiaventura.example.com',
  },
  {
    name: 'Liam Chen',
    category: 'Freelancer',
    subcategory: 'Photographer',
    phone: '+1 646 555 0144',
    instagram: '@liamchenshoots',
    cvFilename: 'liam-chen-cv.pdf',
  },
  {
    name: 'Priya Nair',
    category: 'Freelancer',
    subcategory: 'Photographer',
    email: 'priya.nair@example.com',
    website: 'https://priyanair.example.com',
  },
  {
    name: 'Diego Alvarez',
    category: 'Freelancer',
    subcategory: 'Photographer',
    phone: '+1 917 555 0188',
    instagram: '@diegoalvarez.rw',
  },
  {
    name: 'Noah Kim',
    category: 'Freelancer',
    subcategory: 'Photographer',
    email: 'noah@kimstudio.example.com',
    cvFilename: 'noah-kim-portfolio.pdf',
  },

  // --- Other freelance crew (no jobs yet — shows the empty history state) ---
  {
    name: 'Hannah Weiss',
    category: 'Freelancer',
    subcategory: 'Art director',
    email: 'hannah.weiss@example.com',
    instagram: '@hw.artdirection',
  },
  {
    name: 'Marta Silva',
    category: 'Freelancer',
    subcategory: 'Hair & makeup',
    phone: '+1 718 555 0210',
    instagram: '@martasilvamua',
  },
  {
    name: 'Tom Becker',
    category: 'Freelancer',
    subcategory: 'Digital tech',
    email: 'tom.becker@example.com',
    cvFilename: 'tom-becker-cv.pdf',
  },
  {
    name: 'Ruby Ortiz',
    category: 'Freelancer',
    subcategory: 'Assistant',
    phone: '+1 347 555 0233',
  },
  {
    name: 'Jonas Lind',
    category: 'Freelancer',
    subcategory: 'Stylist',
    email: 'jonas@lindstyling.example.com',
    website: 'https://lindstyling.example.com',
  },

  // --- Models (match the booking seed) ---
  {
    name: 'Jordan Lee',
    category: 'Model',
    company: 'atlas-models',
    instagram: '@jordanlee',
  },
  { name: 'Ava Morgan', category: 'Model', company: 'atlas-models', instagram: '@avamorgan' },
  {
    name: 'Kai Nakamura',
    category: 'Model',
    company: 'vantage-mgmt',
    instagram: '@kainakamura',
  },
  { name: 'Zoe Bennett', category: 'Model', company: 'atlas-models', instagram: '@zoebennett' },
  { name: 'Mateo Rossi', category: 'Model', company: 'vantage-mgmt', instagram: '@mateorossi' },
  { name: 'Isla Fraser', category: 'Model', company: 'atlas-models' },
  {
    name: 'Elena Petrova',
    category: 'Model',
    company: 'vantage-mgmt',
    instagram: '@elenapetrova',
  },
  { name: 'Omar Haddad', category: 'Model', company: 'vantage-mgmt', instagram: '@omarhaddad' },

  // --- Staff at partner companies (the rental-company side of the roster) ---
  {
    name: 'Greg Salinas',
    category: 'Rental company',
    subcategory: 'Account manager',
    company: 'northlight-rentals',
    email: 'greg@northlight.example.com',
    phone: '+1 212 555 0400',
    website: 'https://northlight.example.com',
  },
  {
    name: 'Dana Whitfield',
    category: 'Rental company',
    subcategory: 'Warehouse',
    company: 'northlight-rentals',
    phone: '+1 212 555 0401',
  },
  {
    name: 'Victor Alonzo',
    category: 'Rental company',
    subcategory: 'Account manager',
    company: 'kino-grip-co',
    email: 'victor@kinogrip.example.com',
    phone: '+1 646 555 0500',
  },
  {
    name: 'Bea Lombardi',
    category: 'Agency',
    subcategory: 'Booker',
    company: 'atlas-models',
    email: 'bea@atlasmodels.example.com',
    phone: '+1 212 555 0600',
  },
  {
    name: 'Sam Doyle',
    category: 'Rental company',
    subcategory: 'Driver',
    company: 'swiftline-couriers',
    phone: '+1 917 555 0700',
  },
]
