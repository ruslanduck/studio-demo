# CLAUDE.md — AnnTaylor Rental System (Demo)

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
