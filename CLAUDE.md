# CLAUDE.md — AnnTaylor Rental System

> ## ⚠️ Current state (V2 — 2026-07-25). This supersedes the V1 plan below.
>
> The app has grown past the V1 localStorage demo into a real product. **Architecture now:**
> - **Backend:** Supabase (Postgres + Auth). Schema in `supabase/migrations/*`. Apply with
>   `set -a; . ./.env.local; set +a; echo y | npx supabase db push`. Project ref `bowtxtapuxfohdhhakvg`.
> - **Data layer:** `src/data/repository.js` is source-agnostic, switched by `VITE_DATA_SOURCE`
>   (`local` = localStorage seeds; `supabase` = the DB). Zustand `src/store.js` hydrates from it.
> - **Auth:** individual email/password logins (`src/components/Login.jsx`, store `initAuth/signIn/signUp/signOut`);
>   every action attributed (`created_by`, etc.). One flat role **Equipment Team** behind a capability
>   layer — `src/lib/permissions.js` + `useCan()`; **never hardcode role checks**.
> - **Responsive:** desktop / iPad / iPhone (sidebar→drawer, master-detail inventory).
> - **English-only UI:** don't use native `<input type=date/time>` (locale-bound); use `DateField`/`TimeField`.
> - **Secrets:** `.env.local` (gitignored) holds Supabase keys + DB password + service_role. Public
>   URL+anon are in committed `.env.production` for the prod build. service_role = local seeding only.
> - **Deploy:** push to `main` → GitHub Pages (~1–2 min). Confirm via the **CDN** (compare the served
>   `index-*.js` hash to local `dist/`), not the rate-limited GitHub API. Live at duck-agency.com/studio-demo/.
> - **Seed:** `npm run seed:supabase` (wipes+reseeds). Demo logins: ann/marcus/sofia @anntaylor.demo, pw `StudioDemo!2026`.
>
> **Progress:** Build order #1 (V2 foundation) DONE. **Build order #2 (inventory) COMPLETE:** 2.1 types,
> 2.2 fields, 2.3 categories, 2.4 CRUD, 2.5 search + filters, 2.6 repair log (per-unit send/return +
> history; open repair → unit unavailable), 2.7 work history (per-item usage log + aggregate counters
> for all types — the analytics base; e.g. "N J-hooks used this year").
> **Build order #3 (kits & predefined lists) IN PROGRESS:** 3.1 kit entry type DONE (Items/Kits toggle;
> `kits.category` + `kit_slots`, `20260726120000_kits.sql`). 3.2 staging window DONE (adding a kit to a
> booking opens KitStagingModal: auto-resolves each slot to an available unit, add/remove/replace-from-
> stock before final add, missing slot blocks confirm; edits affect only THIS add, not the kit template;
> frontend-only, no migration). 3.3 FIXED/GENERIC slot types + scan-to-assign DONE (slot definition vs
> slot fill: FIXED pins one unit `fixed_unit_id` — auto-filled, conflict if taken, "Replace for this
> pull" override; GENERIC starts empty, assigned by barcode scan (onKeyDown) or "use available", with
> validation; confirm blocked while any slot unfilled. `20260727120000_kit_slot_types.sql` adds
> `slot_type` + `fixed_unit_id` to kit_slots; `getKits` falls back to the pre-3.3 shape if columns
> absent). 3.4 barcode scan/edit when filling slots DONE (in KitStagingModal: unknown scan → offer to
> register the barcode onto a free unit; pencil-edit an assigned unit's barcode inline, both persisting
> via new `setUnitBarcode` store action + `units.barcode` update, guarded against duplicates. Replace a
> filled unit with a reason — "Return to stock" (back to pool) or "Broken → send to repair" (reuses 2.6
> `sendToRepair`, unit → in_repair, out of the pool everywhere). No migration — uses existing columns.
> These are real inventory writes, unlike this-add-only slot edits). 3.5 predefined scenario lists DONE
> (a list = named preset pull list for a *type of shoot* mixing whole KITS and a-la-carte ITEMS with
> quantities — `scenario_lists` + `scenario_list_entries`, `20260728120000_scenario_lists.sql`. In the
> booking modal "Start from a scenario list…" replaces adding every line by hand: `src/lib/scenarios.js`
> resolves kit entries first (their slots need specific units), then item quantities from what's left,
> and returns a normal editable selection. Unsatisfiable lines are reported, never silently dropped —
> shortfalls ("2 of 4 available") and non-unit-tracked consumables ("take from stock") show in a banner.
> Applying never mutates the list. Third Inventory tab "Lists" shows each list's pull list with live
> availability; kit/item lines jump to their entry). 3.6 kit + scenario-list AUTHORING DONE — closes the
> last acceptance criterion ("создаётся кит и сценарный список"): until now presets were read-only, only
> creatable via seed/SQL. `KitEditorModal` (name/category/notes + slot rows: pick component, label,
> FIXED↔GENERIC toggle, unit picker for FIXED, reorder, remove; save blocked if a FIXED slot names no
> unit, and a unit already pinned by another slot is hidden) and `ScenarioEditorModal` (lines mixing kits
> and items with quantities; kit lines forced qty 1). Reached from the Inventory header — the primary
> button follows the active tab (Add inventory / New kit / New list) — plus Edit in each detail header.
> New caps `KIT_MANAGE`/`SCENARIO_MANAGE`; repository writes replace slots/entries wholesale (simpler
> than diffing, and slot ids aren't referenced elsewhere) honouring both check constraints. NO migration —
> the 3.1/3.3/3.5 tables already allow authenticated writes. Local mode mirrors the DB's cascade
> (deleting a kit drops list lines that point at it) and re-resolves presets after a kit/item rename so
> denormalized labels never go stale. **Build order #3 COMPLETE** (all 6 features + all 4 acceptance
> criteria).
> **Build order #4 (people & company databases) IN PROGRESS:** 4.1 people DB + company hyperlink and
> 4.2 categories + profile DONE (`20260729120000_people_profiles.sql`). The `contacts` table already
> existed as the roster lookup, so 4.1/4.2 grew it rather than adding a table: `category`/`subcategory`
> (free text — the freelancer taxonomy in `PEOPLE_CATEGORIES`, extensible without a migration), plus
> `website`/`instagram`/`cv_url`/`cv_filename` — a person may have any, all or none of the three, nothing
> forced. `companies` gained free-text `company_type` (rental company / modeling agency / messenger
> service …; its option list becomes user-editable in 4.3) alongside the coarse `kind` check column.
> CVs upload to a public `cvs` storage bucket created by the same migration; local mode has nowhere to
> put bytes so it files the filename only and the card says so. New sidebar view **People**
> (`src/components/People.jsx`) — master-detail like Inventory, tabs People/Companies, search + category
> filter. Person card: contact info, company hyperlink, profile chips (website/IG/CV with normalized
> URLs), work history. Company card (minimal until 4.3 adds address/hours/editable types): type badge,
> its contacts as hyperlinks back to People, aggregated job history. Hyperlinks work **both ways** —
> one of #4's acceptance criteria already met. Work history comes from `roster_entries`→`sets` in
> Supabase mode; locally it's derived from the bookings that name the person. A person on ≥1 job can't
> be deleted (roster_entries is ON DELETE RESTRICT) — the editor explains instead of failing. New caps
> `PERSON_MANAGE`/`COMPANY_MANAGE`; persist bumped to v2 with a `migrate` that reseeds pre-4.1 snapshots.
> Prod was backfilled non-destructively (match by name → UPDATE, insert missing) — not a wipe.
> 4.3 company fields + 4.4 editable Types + 4.5 work-history views DONE
> (`20260730120000_company_details_types.sql`, `20260730130000_order_kind.sql`). 4.3: `companies` gained
> `address`, `opening_hours` (free text — how the crew writes them), `website`, `email`, `phone`, all shown
> in a Details block on the card with website/email/phone as live links; full company CRUD via
> `CompanyEditorModal` ("New company" on the Companies tab, Edit in the card header). Deleting a company
> detaches its people/orders (FKs are ON DELETE SET NULL) instead of destroying them. 4.4: the Type option
> list lives in a `company_types` table, not a check constraint — "Manage" in the editor adds/renames/
> removes options. `companies.company_type` stays TEXT, so renaming a type relabels every company using it
> and removing one leaves existing labels intact (the card still shows it, marked "(removed)" in the
> dropdown). 4.5: `orders.kind` ('client' = they ordered from us, 'sub_rental' = we rented from them)
> drives an Order history block with status pills, the linked job and line items; `units.sub_rental_vendor_id`
> powers a "Sub-rented from them" block. ORDER_SEED (`src/data/orders.js`) supplies the history because the
> Orders MODULE is epic #5 — only mapped items get a vendor, the rest stay unattributed on purpose so a
> lighting house isn't shown renting us keyboards. Person work history stays roster-based (`roster_entries`
> → `sets`), and a person card now also lists the ORDERS attached to those jobs (person → roster → set →
> `sets.order_id`) — a direct person↔order link still needs epic #5. The sub-rental vendor is chosen in the
> Inventory units table: a new Vendor column offers companies with `kind` vendor/both and writes through
> `setUnitVendor`; toggling a unit back to Owned clears the vendor. Prod backfilled non-destructively (companies
> UPDATEd by name, orders upserted by order_number, `sets.order_id` linked). **Build order #4 COMPLETE** (12/12 spec bullets + all 3 acceptance criteria).
> **Epic #5 (Orders / Estimates) IN PROGRESS:** 5.1 creation form + 5.2 PO / created-by DONE
> (`20260731120000_orders_epic5.sql`). Terminology agreed with Clay and used throughout the code:
> **Job** = what we shoot (free-text job name), **Set** = the shoot itself (≤5 per studio per day, own
> roster + gear), **Order** = the equipment list for a set (NOT an e-commerce order). The `orders` stub
> (company/number/status, read-only in 4.5) became real: `job_name`, `studio_id`, `starts_on`/`ends_on`,
> `photographer_contact_id` → contacts, `po_number`, `created_by` (defaults to `auth.uid()` like the other
> attribution columns), and the status check now allows `hold` alongside the legacy values. New sidebar
> view **Orders** (`src/components/Orders.jsx`): list with job search across PO / job name / dates /
> photographer + status filter, detail card, and `OrderEditorModal` for create/edit/delete. An order
> starts on **HOLD (yellow)** → **CONFIRMED (green)** via a toggle in the editor; those pill colours are
> what epic #7 pulls into the calendar. Creating an order also creates the Set it equips (so the job lands
> on the studio calendar) and refuses the 6th set on a studio/day with an explicit message —
> `MAX_SETS_PER_DAY` in the store. 5.2's PO is a hand-typed text field, deliberately NOT generated: it
> must match the number accounting issued (this overrides the client outline's "generate automatic PO",
> per the last call); `order_number` stays as our own internal reference.
> ⚠️ `DateField` hands the raw DOM event to `onChange` — read `e.target.value`; treating it as a plain
> string puts an event object in state and crashes the render.
> STILL TO COME in #5: EQ entry into an order (incl. kits), the zero-availability block with the
> sub-rental prompt, in-house/sub-rental marking per line with the vendor from #4, and the costed
> estimate + PDF. Prod backfilled non-destructively: all 8 orders carry job/PO/studio/status; 5 have no
> working dates because their shoots don't exist on prod (8 sets there vs 11 in the seed) and dates
> weren't invented — a full `npm run seed:supabase` would align them.
> Ship each section end-to-end (migration → verify on Supabase → commit → push → confirm prod).
> Note: migrations 2.6 `repairs` (`20260725120000`), 2.7 `item_usage` (`20260725130000`), 3.1 `kit_slots`
> (`20260726120000`), 3.3 slot types (`20260727120000`), 3.5 scenario lists (`20260728120000`),
> 4.1/4.2 people profiles + `cvs` bucket (`20260729120000`), 4.3/4.4/4.5 company details + `company_types`
> + `units.sub_rental_vendor_id` (`20260730120000`), `orders.kind` (`20260730130000`),
> 5.1/5.2 order fields + `po_number` + `created_by` + `hold` status (`20260731120000`).
> `supabase link` fails here — push with
> `db push --db-url "postgresql://postgres.<ref>:<URL-ENCODED_PW>@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"`.
> Seed via
> `npm run seed:supabase` (wipes+reseeds), or add rows non-destructively (3.3 fixed slots were applied
> to prod via a targeted UPDATE, not a wipe). Every added frontend degrades gracefully if its table is absent (repairs/usage/kits
> fetched in separate try/caught queries), so deploying before a migration never breaks inventory.

## What this is
A **sales demo** of an inventory-tracking + studio-scheduling web app for a photo/film
studio rental company. Goal: a clickable, good-looking prototype to show a prospective
client and close a deal. It is **not** production software.

## Priorities (in strict order)
1. Looks clean, modern, and professional.
2. Core flows are clickable and feel real (create a booking, open an inventory item and
   see its individual units).
3. Ships to GitHub Pages as a static site.

**De-prioritized — do NOT build these:** real backend, auth, database, tests,
edge-case handling, i18n, mobile layouts, accessibility perfection. Do not over-engineer.
If a choice is between "robust" and "simple and good-looking," pick simple.

## Tech stack
- **Vite + React** (JavaScript, not TypeScript — keep iteration fast)
- **Tailwind CSS** for styling
- **Zustand** for state, with the `persist` middleware → `localStorage`
- **lucide-react** for icons
- **date-fns** for date math (week ranges, month grids, formatting)
- **No router needed** — a single `activeView` field in the store switches between
  `"calendar"` and `"inventory"`. (react-router is optional and not required.)

## Data lives entirely in the client
Seed data from `src/data/*`, load it into the Zustand store, persist to `localStorage`.
Provide a **"Reset demo data"** action (e.g. under the Admin menu) that clears
localStorage and reloads the seeds — useful for re-running the demo cleanly.

## Data models

### Studios (fixed)
```js
const STUDIOS = ["1", "2", "3", "4", "5", "L"];
// "L" is just a studio label (a large studio). Treat it like any other studio;
// only the displayed label differs.
```

### Inventory item
```js
{
  id: "kbd-magic",
  name: "Apple Wireless Magic Keyboard",
  category: "Computers",          // drives the category filter
  units: [ /* Unit[] — quantity shown in the list = units.length */ ]
}
```

### Unit (an individual physical copy)
```js
{
  id: "u-0708",
  barcode: "0708",
  serial: "SF0T919700HYH1",
  status: "available",            // "available" | "checked_out"
  location: "Available",          // "Available" OR a set name, e.g. "Nike SS26 — Studio 2"
  ownership: "owned"              // "owned" | "sub_rental"  (manually toggleable in UI)
}
```
- `status`/`location` reflect whether the unit is reserved by a booking on the selected
  date. Precompute this in the seed data, and update it when a booking is created/edited.

### Booking / Set
```js
{
  id: "set-001",
  title: "Nike SS26 Lookbook",
  studioId: "2",
  date: "2026-07-02",             // ISO date
  startTime: "09:00",
  endTime: "17:00",
  photographer: "Ann Taylor",
  model: "Jordan Lee",
  unitIds: ["u-0708", "u-0624"],  // reserved inventory units
  status: "active",               // "active" | "canceled"
  color: "#3b82f6"                // optional, used to tint the chip
}
```

### Contacts (optional, for dropdowns)
Small mock arrays of photographer names and model names to populate the selects in the
booking modal. Free-text entry should also be allowed.

## Views

### App shell
- **Left sidebar** buttons: `Booking Calendar` (placeholder/disabled is fine),
  `Studio Calendar` (default active), `Inventory`. Highlight the selected one.
- **Top bar**: title "AnnTaylor Rental System" + decorative menu labels
  (Admin / View / Generate / Inventory). Only real action needed: **"Reset demo data"**
  under Admin.
- Clicking a sidebar item swaps the main panel. Default view = Studio Calendar.

### Studio Calendar
A **Week / Month** toggle switches layout.

**Week view (primary — mirror reference screenshot 1):**
- Grid: **rows = the 6 studios** (1, 2, 3, 4, 5, L), **columns = the 7 days** of the
  selected week (Mon–Sun).
- Header shows day name + date per column. Tint **weekend columns (Sat/Sun) pink** and
  **today's column yellow**.
- Date nav: `‹` / `›` move by one week, a date label in the middle, a **Today** button.
- Each cell renders that studio's bookings for that day as **chips** (title + time range),
  tinted by `color`. Empty cells are clickable.
- **Click an empty cell** → open the Booking modal with `studioId` + `date` pre-filled.
- **Click a chip** → open the Booking modal in view/edit mode.

**Month view:**
- Standard month grid (weeks as rows, day cells). Nav moves by month.
- Each day cell lists that day's bookings **across all studios** as small chips
  (`studio label + title`), color-coded by studio. If crowded, show "+N more".
- Click a chip → open that booking. Click a day → jump to that week in Week view.

**Booking modal (create + edit):**
Fields: Studio (pre-filled select), Date (pre-filled), Start time, End time,
Photographer (select from contacts OR free text), Model (select OR free text),
**Inventory (searchable multi-select of items → reserves units)**, Notes.
Buttons: Save / Cancel / Delete (edit mode). On save: add/update the booking in the
store and mark the selected units `checked_out` with `location = booking title` for that date.

### Inventory
- **Search box** (filters item list by name) + **Category dropdown** ("All" default).
  Both filters apply together.
- **Item list**: rows showing quantity (`units.length`) + item name. Selecting a row
  opens its detail.
- **Unit detail panel**: a table of that item's units — columns `#`, Barcode, Serial,
  Status (badge: green **Available** / orange **Checked out**), Location, Ownership
  (badge: **Owned** / **Sub-rental**). This is the "17 keyboards → see all 17 with
  serials + location" behavior. Clicking the Ownership badge **toggles owned ↔ sub-rental**
  (manual marking).
- **Add inventory** modal: create a new item (name, category, quantity). Auto-generate
  that many units with placeholder 4-digit barcodes + serials, ownership default `owned`.
  Adds to the store and appears in the list.

## Mock data guidance
Domain = photo/film studio gear. Seed **~30–40 items** across a few categories so the list
looks real. Pull names from the reference screenshot, e.g.: A-Clamp 2" (Medium),
A-Clamp 3" (Large), AC Extension Cord / Stinger 20amp 25', Anker USB-C Hub, Apple Late 2019
16" MacBook Pro, Apple Lightning Cable, Apple MacBook Pro 96W USB-C Power Adapter,
**Apple Wireless Magic Keyboard (17 units)**, Apple Wireless Magic Mouse, Applebox
Full/Half/Pancake/Quarter, Arri 2k Open Face, Arri 750, Avenger Double Riser, Baby Roller,
Bench, Big Ben Clamp, Box Cutter, etc.
Suggested categories: **Grip, Electric/Lighting, Computers, Cables, Furniture, Camera, Audio**.
- Give multi-unit items realistic 4-digit barcodes and serials (like `SF0T919700HYH1`).
- Seed **~8–12 bookings** spread across the current week and studios so the calendar isn't
  empty. Put one or two on "today" and a couple on the weekend so the tinting is visible.
  Set the reserved units' status/location accordingly.

## Build order (separate steps — deploy at step 0, commit after each)
0. **Scaffold + deploy pipeline FIRST.** Add Tailwind + libs, add the GitHub Actions
   workflow and `base` in `vite.config.js`, push, and confirm the empty app is **live on
   GitHub Pages**. (Debug deployment now, not at the end.)
1. Seed data files (`src/data/`) + Zustand store (persist + reset).
2. App shell: sidebar + top bar + view switching.
3. Inventory view: search + category filter + item list + unit detail table.
4. Add-inventory modal.
5. Studio Calendar **week view** + date nav + weekend/today tinting + booking chips.
6. Booking modal (create/edit) wired to the store + unit reservation.
7. **Month view** + Week/Month toggle.
8. Polish: spacing, color, badges, hover/empty states. Make it look intentional.

## Deployment — GitHub Pages via Actions

**`vite.config.js`** (change `studio-demo` to the real repo name):
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/studio-demo/",
});
```

**`.github/workflows/deploy.yml`:**
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then: repo **Settings → Pages → Source = GitHub Actions**.
Live at `https://ruslanduck.github.io/studio-demo/`.

## Definition of done
- Live URL loads with seeded data, no console errors on main flows.
- **Inventory:** search + category filter work; selecting an item shows its units;
  ownership toggles; can add a new item.
- **Calendar:** week + month views; date nav works; clicking a cell creates a booking that
  appears in the grid; clicking a chip opens it.
- Consistent, intentional visual design.
