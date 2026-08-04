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
> - **Deploy:** push to `main` → GitHub Pages (~1–2 min). Confirm via the **CDN**, not the rate-limited GitHub
>   API. Live at duck-agency.com/studio-demo/. Usually the served `index-*.js` hash equals the local `dist/`
>   one, but it CAN legitimately differ (CI runs its own `npm ci`, so the bundle isn't byte-identical) — when
>   it does, don't assume the deploy failed: fetch the served bundle and grep it for a string unique to the new
>   code (e.g. `curl -s .../assets/index-<hash>.js | grep -c "Coming soon"`). Content is the real check.
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
> (company/number/status, read-only in 4.5) became real: `job_name`, `studio_id`, `starts_on`/`ends_on`
> (⚠️ a shoot is ALWAYS one day, agreed later: the form shows a single **Set date** and writes
> `ends_on` = `starts_on`. The column stays because availability, billable days and the order search
> all read a window, and legacy rows may still span days),
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
> 5.3 EQ entry + 5.4 estimate/PDF DONE (`20260801120000_order_eq_estimate.sql`). 5.3: `order_lines` gained
> `kit_id` / `unit_id` / `slot_label`, so a line remembers where it came from. `OrderEquipmentModal` holds
> state exactly like the booking modal — `selected` (itemId→qty) + `stagedUnits` — which lets kits come in
> through the **unchanged epic-3 KitStagingModal** and `applyScenarioList` (3.5) work as-is. A kit's
> composition stays editable after adding: each staged unit can be swapped for another free unit or
> removed, and the whole kit dropped. 5.4: `inventory_items.day_rate` is the rental rate (seeded per item
> with a category fallback in `src/data/inventory.js`; consumables stay null and are listed but excluded
> from the total, stated out loud). `src/lib/estimate.js` is a PURE builder (billable days inclusive,
> kit/a-la-carte grouping, roster, totals) and `src/lib/estimatePdf.js` turns it into a jsPDF doc —
> neither touches a browser API, so both run under plain Node and that is how the PDF is tested.
> ⚠️ jsPDF's Helvetica is WinAnsi: an arrow or em dash either vanishes or flips the whole string into
> s p a c e d   o u t letters. Everything the PDF writes goes through `pdfSafe()`; both defects were
> caught by extracting text from the generated bytes, not by eyeballing. Persist bumped to v3 (older
> snapshots lack day rates and would total $0.00). Prod backfilled: 42/44 items have a day rate.
> 5.5 Hold→Confirmed + 5.6 sub-rental/vendor/zero-availability DONE
> (`20260802120000_order_line_sub_rental.sql`). 5.5: the status vocabulary moved to `src/data/orderStatus.js`
> — label, meaning, pill classes AND a `calendar` hex, so the list pill, the card pill and epic #7's
> calendar chip all read one definition. The card carries an explicit **Confirm order** / **Back to hold**
> action with what the state means ("this is what goes to packing and scanning" — epic #6). 5.6:
> `order_lines` gained `source` ('in_house' | 'sub_rental') + `vendor_company_id`, with a DB check that an
> in-house line can't name a vendor (a sub-rental line without one stays legal so a half-picked row isn't a
> DB error; the UI blocks saving it). Each a-la-carte line has an In-house/Sub-rental switch, and a
> sub-rental line takes a vendor from #4 (`kind` vendor/both) and consumes NO in-house availability — that's
> what makes the block a real choice. Adding an item with 0 available is refused with
> "pick a different item, or raise it as a sub-rental" plus **Add as sub-rental** / **Choose another**.
> ⚠️ **Availability now has exactly one implementation**: `src/lib/availability.js`. KitStagingModal,
> `lib/scenarios.js`, BookingModal and the order editor all call it. The subtle part is
> `resolveUnitsForQuantities`: loose a-la-carte lines only carry a quantity, so they must be resolved to
> real unit ids and fed back as `claimed` before staging a kit — without that a kit slot and a loose line
> both take the last free unit (found in testing: the staging window said "1 free" for a unit an order line
> already held). LOGIN: self-registration removed on request — sign-in only, accounts are issued by the
> studio. `store.signUp` still exists for provisioning but nothing in the UI calls it.
> 5.7 order search DONE (no migration). Matching moved out of the component into the pure
> `src/lib/orderSearch.js` (25 assertions in Node): free text takes SEVERAL terms and requires ALL of
> them, each matching any of PO / job name / photographer / order ref / dates / client, so "nike 4490"
> works without a field picker. Dates filter by OVERLAP against the order's working window, not string
> prefix, so "everything shooting that week" is answerable and a multi-day job is found from any day
> inside it. Explicit dropdowns for status / studio / photographer, a sort (newest / oldest / job A-Z),
> an "N of M orders" count and Clear all. Rows sharing a PO show an "N x PO" chip — one job's PO covers
> every order raised against it, and that grouping IS the job history the spec asks for.
> ⚠️ Studio is a dropdown, NOT a free-text field: it used to be in the haystack as its label, which made
> short numeric terms useless ("studio 2" matched nearly everything, because "2" is a substring of every
> 2026 date). Caught by the test suite.
> **Epic #5 COMPLETE** (5.1-5.7, all 4 acceptance criteria).
> **Epic #6 (packing / scanning) IN PROGRESS:** 6.1 packing list generation (post-confirm) DONE —
> `src/lib/packingListPdf.js` builds a printable pull sheet from a CONFIRMED order's assigned EQ. It
> reuses `buildEstimate`'s kit/a-la-carte grouping + `estimatePdf`'s jsPDF setup + `pdfSafe`, but drops
> money and adds three initial boxes per line (OUT / OUT / RET — two at sign-out, one at return) plus a
> detail cell (slot label · #barcode · sub-rental vendor). In the Orders detail a new "Packing list"
> section shows a Download button ONLY when `status==='confirmed'`, else "confirm to generate its packing
> list". Frontend-only, NO migration (generates from existing order lines). Verified headless (2-page
> pagination, empty-order safe), PDF-byte content grep (all sections/sign columns/vendor present), and
> browser UI gating (hold→hint, confirmed→button, click→no error).
> 6.3 vendor assignment on line items — ALREADY DELIVERED by 5.6 (per-line in-house/sub-rental switch +
> vendor picker in OrderEquipmentModal, shown in the order detail and on the 6.1 packing PDF). Nothing new.
> 6.2 sign-off initials + 6.5 PDF/digital checklist DONE (built together as the digital packing checklist)
> — `20260803120000_packing_signoffs.sql` adds `packing_signoffs` (one row per line: two sign-out + one
> return, each initials+timestamp). Keyed by a STABLE line signature `itemId::slotLabel::barcode`
> (`src/lib/packing.js` `packingLineKey`) — NOT the order_line id, which is replaced wholesale on EQ edit.
> `PackingChecklistModal` is the iPad/digital form beside the 6.1 PDF: per-line initial boxes (green when
> signed, tooltip shows who+when), live "N/N signed out · N/N returned" progress, opened from the Orders
> "Packing list" section (Digital checklist + Print PDF buttons, confirmed only). Store actions
> `signPackingLine`/`clearPackingSignoff` are OPTIMISTIC (instant, background Supabase upsert — a packing
> station shouldn't wait; the partial upsert leaves the other two slots untouched). `getOrders` attaches
> `order.packing` from a separate try/caught fetch, so orders still load if the table is absent. No seed
> (checklist starts empty; you sign live). Verified local: sign records initials+time, box greens,
> persists, progress updates, clear un-signs others untouched, 0 console errors.
> ⚠️ jsPDF was missing from node_modules (added in 5.4 after an older `npm ci`) → `npm install` after syncing.
> 6.4 Add-On packing lists DONE — `20260804120000_order_addons.sql` adds `order_addons` + `addon_lines`
> (addon_lines mirror order_lines). An add-on is a labelled supplementary list on an order; the main
> `order_lines` are NEVER touched. Heavy reuse: the add-on equipment editor is the SAME OrderEquipmentModal
> (fed an order-like `{id, lines, startsOn, endsOn}`, onSave→`setAddonLines`), the PDF is `packingListPdf`
> with `opts.docTitle='ADD-ON PACKING LIST'` + `opts.addonLabel`, and the digital checklist is the SAME
> `PackingChecklistModal` with a `keyPrefix='addon:<id>::'` so its sign-offs live in the same
> `packing_signoffs` table (order_id = parent) without colliding with the main list's line keys
> (`packingLineKey`/`packingProgress` now take a prefix arg). Repository `getAddonsByOrder` attaches
> `order.addons` via a separate try/caught fetch; store `createAddon`/`setAddonLines`/`deleteAddon`.
> Orders detail gains an "Add-ons" section (confirmed only): New-add-on label input → opens the eq editor;
> each add-on row has Edit EQ / Checklist / Print PDF / Delete + a pcs + out/ret progress line. No seed.
> Verified local: create→eq→save (main untouched), namespaced checklist sign-off, add-on PDF, delete;
> 0 console errors. Note: add-on availability reuses the shared rule but doesn't subtract the main list's
> reservations (minor demo edge — a day-of add could in theory re-pick a unit the main list holds).
> **FIX — "Orders drive reservations" (reservation model).** Inventory used to show a unit checked out to
> a job whose order didn't list it (reported: Canon #0960 "checked out to Wedding Editorial", absent from
> that order). Root cause: a Set's gear was seeded on the booking (`BOOKING_TEMPLATES.reserve`) INDEPENDENTLY
> of `ORDER_SEED`, so the two could disagree. Now a Set's reserved units DERIVE from its **CONFIRMED**
> order's in-house lines — one source of truth. Hold orders reserve nothing; sub-rental lines are vendor gear
> and consume no in-house stock; FIXED kit units are pre-claimed so a loose line never grabs a unit pinned to
> a kit. `src/lib/availability.js` `reservedUnitsForOrder(order, inventory, claimed)` is the resolver; the
> store adds `reservationsFromOrders` + `fixedUnitIdsOf` (resolve against a RAW repairs-only view, NOT the
> live projection being recomputed; a shared `claimed` set stops double-booking) — called from `buildSeedData`
> AND live from `createOrder`/`updateOrder`/`setOrderLines`/`deleteOrder` so confirming/holding an order moves
> inventory instantly (LOCAL mode). `src/data/bookings.js` no longer carries `reserve` (calendar-only);
> `src/data/orders.js` ORDER_SEED rewritten to per-shoot client orders (Wedding = the visible HOLD) + 3 past
> sub-rental history orders, line form `[itemId, qty]` (in-house) / `[itemId, qty, vendorId]` (sub-rental).
> **Supabase/prod is fixed by a RESEED**, not by this frontend change: supabase mode reads reservations from
> `set_units`, and `scripts/seed-supabase.mjs` now writes set_units from each CONFIRMED order's in-house lines
> (same pre-claim/skip-repair rule); the store's live-reservation logic is LOCAL-mode only. NO migration
> (`order_lines.source`/`vendor_company_id` already exist from 5.6). Verified local: Canon 0960→Apple Product
> Shoot (order-backed) with 0959 still in repair, Wedding hold reserves nothing, Astera 3/3 checked out (Vogue's
> 2 sub-rental Asteras excluded), hold↔confirm toggles inventory live, build clean, 0 console errors.
> Note: supabase LIVE confirm→reserve (writing set_units on confirm in prod) is still a gap — the reseed makes
> the initial prod state coherent, which is what the demo needs.
> **FIX — filters reset on tab refocus (supabase mode).** Switching away from the tab and back reloaded the
> app and wiped in-view filters. Cause: `supabase.auth.onAuthStateChange` fires on token-refresh / tab-focus
> re-validation too, and the handler re-fetched the profile + `hydrate()` every time; `hydrate` sets
> `loading:true`, and App.jsx swaps the whole view for a full-screen loader — unmounting Inventory/Orders/People
> and destroying their local `useState` filters. Fix (`store.js` `initAuth`): only (re)load when the signed-in
> user actually changed (first load / real sign-in / sign-out); a refresh for the already-loaded user is a no-op
> (guarded by comparing `prev.session.user.id` to the new one + `get().profile`). Frontend-only, no migration.
> Verified: reproduced (Canon filter wiped on tab switch), then after the fix the filter survives repeated
> tab switches with no loader flash, 0 console errors. NOTE: an explicit mutation (e.g. edit order → hydrate)
> still flashes the loader and would reset filters — that's a deliberate refetch, left as-is.
> **FEATURE — drill into any item's history from anywhere it's shown.** New store action `focusInventory
> ({ itemId, unitId? })` sets a transient `inventoryFocus` (+ `activeView:'inventory'`); Inventory.jsx
> consumes it in an effect (selects the item, resets filters so it's visible, and if a unit was named opens
> that unit's history). Wired the read-only inventory surfaces: an order's EQUIPMENT lines (Orders.jsx —
> a-la-carte + kit-unit lines; the item name is now a link, unit-specific lines jump straight to the unit's
> history) and the company card's "Sub-rented from them" gear (People.jsx). Kit-detail slots and scenario-list
> lines already jumped to the item (within Inventory). Editing/workflow surfaces (BookingModal,
> OrderEquipmentModal, KitStagingModal, PackingChecklistModal) are deliberately NOT linked — navigating away
> mid-edit would lose work. `inventoryFocus` is not persisted (whitelist partialize). Frontend-only, no
> migration. Verified in supabase mode: order line → item history, vendor card → item history, 0 console errors.
> **CHANGE — the calendar is order-centric (a shoot IS its order).** The Studio Calendar used to create/edit
> its own bare bookings via BookingModal, separate from Orders — so you could make a calendar entry with no
> order (the stray "TEST" shoot). Now: the "New booking" button is **"New order"** and clicking it (or an empty
> cell) opens the SAME `OrderEditorModal` in place on the calendar — `createOrder` builds the Set, so the shoot
> lands on the grid (new Sets default to 09:00–18:00). Clicking a shoot **opens its order** in the Orders view
> (store `openOrder` → transient `orderFocus`, consumed by Orders.jsx like `focusInventory`). A legacy
> order-less shoot still opens in BookingModal (kept only as the fallback) so it can be edited/deleted.
> `getBookings` now selects `order_id` → `booking.orderId` (was missing in supabase mode, so chips couldn't
> find their order). ⚠️ Fixed a latent crash surfaced by this: `createSetForOrder` never set
> `start_time`/`end_time`, so an order-created Set had null times and the calendar's `a.startTime.localeCompare`
> threw — added default times + made the sort null-safe (`(a.startTime||'')`). Frontend-only, no migration.
> Verified in supabase mode: New order from calendar → Hold order + shoot on grid; chip → its order; order-less
> fallback → BookingModal; 0 console errors. NOTE: deleting an order leaves its shoot on the calendar
> (`sets.order_id` ON DELETE SET NULL) as an order-less booking — existing "the shoot stays booked" behaviour.
> **FEATURE — back navigation for drill-ins.** Drilling in was one-way: you landed in another view with no
> idea where you came from ("непонятно что выходит"). Every drill-in now takes an optional `from`
> ({ view, label, focus }) which the store pushes onto `navStack`; the shell (App.jsx) renders a
> "← Back to <label>" bar whenever the stack isn't empty, and `goBack()` pops it and restores that view's
> selection. Each push ALSO adds a `history.pushState` entry and App.jsx listens for `popstate`, so the
> BROWSER's own back arrow walks the same trail (the in-app button calls `history.back()` when there's an
> entry to consume, keeping the two in step). Store: `navStack` + `pushNav`/`goBack`, focus payloads per view
> (`inventoryFocus` {itemId|kitId|listId, unitId}, `orderFocus` {orderId}, `peopleFocus` {personId|companyId}).
> Restoring never re-opens a modal (a returning `unitId` is dropped). `setActiveView` (sidebar) CLEARS the
> trail — a deliberate jump has nothing to return up to. Wired: order EQ line → item, vendor card gear → item,
> calendar shoot → its order, and the in-Inventory kit/list → item/kit jumps (which now route through
> `focusInventory` instead of setting local state, so they're tracked too). People gained a `peopleFocus`
> consumer; Inventory's effect handles kit/list targets. Frontend-only, no migration. Verified in supabase
> mode: calendar → order → item, two-level trail rewinds correctly, browser back arrow does the same,
> vendor → item → back restores the company card, kit → component → back restores the kit; 0 console errors.
> **REBRAND — the product is now Kitbay.** `src/lib/brand.js` holds `BRAND_NAME` and is the single source;
> it is deliberately JSX/icon-free so the PDF builders (which run under plain Node — that's how they're
> tested) can import it. `src/components/Logo.jsx` is the visual MARK (placeholder violet square + icon)
> and re-exports the name for UI code, so dropping in the real logo is a one-file change. Applied to: the
> sidebar brand ("AT / AnnTaylor" → mark + Kitbay), the login screen, the browser tab title, and the
> letterhead of BOTH PDFs (estimate + packing list). The top bar's "AnnTaylor Rental System" title is GONE;
> below lg (sidebar off-canvas) a compact mark + name stands in so mobile isn't a bare bar. The demo's own
> studio company row was renamed too — name/website/email → Kitbay — in the SEED (`data/people.js`, slug
> `anntaylor-rental` kept: it's an internal key referenced by 3 people and never shown) and on prod via a
> targeted UPDATE by name (no wipe, no reseed). NOT renamed: the demo LOGIN accounts and people's display
> emails stay `@anntaylor.demo` — the logins are real Supabase users and renaming them would break sign-in.
> Verified: PDF letterhead checked by extracting strings from the generated bytes under Node (Kitbay present,
> "AnnTaylor" absent in both docs), then in-browser — no "AnnTaylor" anywhere in the DOM, vendor dropdown
> offers Kitbay, company card consistent (contacts + job history intact), PDF download fires clean,
> 0 console errors.
> **FEATURE — per-UNIT CRUD (the asset register).** Reported gap: "Add inventory" creates an item TYPE, and
> there was no way to register one more physical copy with its own serial, nor to correct or remove a unit —
> units only ever came from the quantity typed at item creation. Now, on a barcoded item's card:
> a primary **+ Add unit** button (modal: ONE ROW PER COPY — see the naming/rows fix at the end of this file —
> empty row = generated next free number + deterministic serial, so receiving a batch is one field), and a new
> **UNIT** column with a pencil (correct barcode/serial) and a trash (write off, inline "Write off? Delete /
> Keep" confirm). The header's "Edit" is now **"Edit item"** so item-level vs unit-level is unmistakable.
> Store: `nextBarcode` / `addUnits` / `updateUnit` / `deleteUnit` (local + supabase); repository `addUnits` /
> `updateUnit` / `deleteUnit`. Barcodes are unique across the WHOLE register, checked before write in both
> modes. Delete is REFUSED with the reason when the unit is on a job ("#0960 is out on 'Apple Product Shoot —
> Studio L'. Free it from that job first."), out for repair, or pinned to a kit's FIXED slot (that last one the
> DB would refuse anyway — `kit_slots.fixed_unit_id` is RESTRICT); the reason shows in a dismissible banner
> above the table. Otherwise it clears the unit's `set_units` rows first (RESTRICT) and deletes — same policy
> as the existing item-level write-off. Caps: add/edit use `INVENTORY_EDIT`, delete uses the previously
> unused `UNIT_WRITE_OFF`. NO migration.
> ⚠️ Verified on the real DB with a throwaway unit that `events.unit_id` does NOT block deleting a unit —
> its FK was dropped in `20260724120000_events_soft_refs.sql` (soft reference), so the audit trail survives
> and must NOT be touched. An earlier attempt to null it out was reverted: it would have destroyed history the
> migration deliberately keeps. `deleteInventoryItem` was likewise fine as it stood.
> Verified in supabase mode end-to-end: add a unit with a typed barcode/serial (314→315, searchable by both),
> duplicate-barcode refused on add AND edit, edit persisted, delete of a checked-out unit refused with the
> reason, delete of a free unit succeeded (315→314), prod left with 0 test leftovers, 0 console errors.
> **CLARITY PASS on the person / company cards.** Three reported confusions, all fixed rather than explained
> away. (1) Work history wasn't clickable — now every row opens that job's ORDER (via `openOrder` + the back
> trail); a shoot with no order opens the calendar on its date instead (new store action `openCalendarOn`,
> which bypasses `setActiveView` so the trail survives), so no row is a dead end. (2) The bare `MODEL` /
> `PHOTOGRAPHER` tag read as a duplicate of the person's profile category — it is actually their role ON THAT
> JOB (`roster_entries.role`), so it now reads "as model" inline with date · studio. (3) "Work history" vs
> "Orders on those jobs" were two sections describing the same shoots from different ends; the second is GONE
> and its order is folded into the job row (PO/ref + status pill), which is what made the difference
> unexplainable. Also: the `CLIENT` badge is gone from person cards entirely and, on the company card, the
> direction badge is now worded — "Rented to us" / "For their job" instead of "Sub-rental" / "Client" (a bare
> noun read like a customer segment). Company order rows became clickable too, and `OrderList` now takes its
> status colours from `orderStatusMeta` — it had a local map painting CONFIRMED amber while the rest of the app
> paints it green — and lost the stale "the Orders module lands in the next epic" empty text (it shipped).
> Frontend-only, no migration. Verified in supabase mode: Ava Morgan's card (work history rows with "as model"
> + PO + green Confirmed, no duplicate section), row → its order with "← Back to Ava Morgan" and back again,
> vendor card shows "Rented to us", agency card shows "For their job". NOTE the console keeps a stale parse
> error from a mid-edit HMR attempt (15:52:58) — later HMR updates and both prod builds are clean.
> **FEATURE — layered peek cards (related data is clickable everywhere, without leaving the page).**
> Requested: "в любой точке системы связанные данные должны быть кликабельны … чтобы нас не перекидывало на
> другую страницу, а открывало карточку в рамках текущей". `src/components/PeekPanel.jsx` is a right-side
> drawer over the current view driven by a STACK in the store (`peekStack` + `peek`/`peekBack`/`peekClose`):
> click related data → a card layers on top; click inside it → another card stacks (header shows "N deep" +
> Back; Esc pops one; the X or the backdrop drops the whole stack and you're exactly where you started).
> Five card types, each read-only and each with its own links: **order** (job block with clickable
> photographer/company/shoot, equipment lines, estimate), **item** (units with where each one is, plus every
> order using it), **person** (contact, work history), **company** (details, contacts, orders, gear held),
> **job/set** (crew, its order, the gear that went out with barcodes). Every card carries "Open full view",
> which hands off to the real screen (with its editing tools) and clears the stack. Cards are purpose-built,
> NOT the view components reused — those own edit state, permissions and their own modals, and nesting them
> would put dialogs inside dialogs. Wired: order equipment lines + photographer/company/shoot rows, People
> person work-history rows and company contacts/orders/gear, calendar chips (a shoot opens in place instead of
> jumping to Orders), and the unit-history dialog's sets + roster names (that one CLOSES first — a card
> stacked over a modal has no clean escape). Any cross-view navigation (`focusInventory`/`openOrder`/
> `focusPeople`/`openCalendarOn`/`goBack`/`setActiveView`) clears the stack so a card can't float over the
> wrong page. Frontend-only, no migration. Verified in supabase mode: person → shoot → order → item → the job
> holding that unit (4 deep), Back unwinds one level at a time, X returns to the untouched starting card,
> calendar chip peeks in place. NOTE the JobPeek for Wedding Editorial honestly shows "No units reserved"
> while its order reads Confirmed — that's the known supabase live confirm→`set_units` gap, not a card bug.
> **GAP CLOSED — live confirm→reserve in Supabase mode.** Until now "orders drive reservations" was only true
> at SEED time on prod: confirming an order in the UI wrote no `set_units`, so a confirmed order could show
> "No units reserved" (visible in the new JobPeek). New store action `syncReservationsForOrder(orderId)` +
> repository `setReservationsForSet(setId, unitIds, {from,to})`: CONFIRMED resolves the order's in-house lines
> to concrete units and writes them; HOLD (or any other status) clears that set's rows. Called from
> `updateOrder` (the Hold↔Confirmed toggle), `setOrderLines` (editing a confirmed order's gear changes what it
> holds) and `deleteOrder` (scrapping an order releases its gear — the shoot stays booked). Only the ONE set is
> touched; a global recompute would rewrite every set on each click. Resolution reuses the SAME
> `reservedUnitsForOrder` as local mode, against a projection where a unit counts as free unless it's out for
> repair or held by ANOTHER set (units this set already holds count as free, or re-confirming would find its
> own gear taken); fixed kit units stay pinned unless a kit line names one. The action returns
> `{reserved, short}` and the order card SAYS SO — "5 piece(s) reserved · 1 could not be — nothing free for
> those lines" — rather than letting the pull sheet imply gear that isn't held.
> ⚠️ **`hydrate()` now takes `{quiet}`** and every post-write refetch uses it (36 call sites; only the initial
> sign-in load and "Reset demo data" still raise `loading`). Raising `loading` swaps the whole view for a
> full-screen spinner, which UNMOUNTS the active screen and discards its local state — the filter you typed,
> the row you had open, and the just-happened message. That's why confirming used to throw you back to the
> orders list, and it's the same root cause as the tab-refocus filter reset.
> Frontend-only, no migration (set_units already exists). Verified on prod: Wedding Editorial CL-26058 was
> confirmed with 0 reservations → Back to hold (0, "released") → Confirm → **5 rows written** (69→74 set_units;
> Rode #1009, Sandbags #0779/#0780, C-Stands #0767/#0768) with the Canon correctly SHORT (0959 in repair, 0960
> held by Apple Product Shoot — no double-booking), JobPeek now lists the gear, view stayed put through both
> toggles, 0 console errors. Order left Confirmed as it was found.
> **LAYOUT — navigation moved into the top bar; the permanent sidebar is gone.** The top menus
> (Admin / View / Generate / Inventory) were decorative — three did nothing and the fourth duplicated a nav
> item's name — while the 256px sidebar column cost every view width the tables actually need. Now: the top bar
> carries the brand + the workspace tabs (`src/data/nav.js` `WORKSPACE_NAV` is the one definition, shared by
> the bar and the drawer), the only real action (Reset demo data) sits under a gear, and `Sidebar` is an
> off-canvas DRAWER only (`fixed`, no `lg:static`), used below lg via the hamburger. Measured at 1024px: main
> went 768 → **1024px** and the inventory units table **no longer needs horizontal scrolling**
> (scrollWidth 960 < 1024) — before, HISTORY/REPAIR/UNIT sat off-screen. Also gave the drawer Esc-to-close,
> which it never had. Frontend-only, no migration. Verified: desktop tabs switch views and highlight the
> active one, below lg the tabs collapse to the hamburger and the drawer still navigates, gear → Reset demo
> data, no page-level horizontal overflow, 0 console errors.
> **FEATURE — activity log / attribution ("who added what to which order").** Reported: no way to see who put
> inventory into an order. The audit found the foundation existed and was INVISIBLE: `events` was written on
> every reservation (with an actor) and read by **zero lines of code**; `repairs.created_by`/`returned_by`,
> `item_usage.created_by`, `order_addons.created_by` were stored and dropped on read; and the key action —
> `setOrderLines` — left **no trace at all** (`order_lines` has no actor and no `created_at`).
> `20260805120000_activity_log.sql`: FK `events.actor_id → profiles` (PostgREST can't embed a name without it;
> verified 0 orphans first), an INSERT policy `with check (actor_id = auth.uid())` — the table was SELECT-only,
> so the app literally could not append — an `(actor_id, occurred_at desc)` index, and denormalised
> `orders.eq_updated_by/eq_updated_at` for the headline (the full trail stays in `events`).
> `src/lib/activity.js` is PURE (Node-assertable, 9 assertions): the `EVENT` vocabulary, `describeEvent` →
> sentences, `orderFeed` (hides reservation churn), and **`diffOrderLines`** — lines are replaced wholesale, so
> without a diff a save that bumped one quantity would log "removed everything, added everything"; it now reads
> "Arri 2K Open Face 2 → 3". Repository `logEvent`/`getEvents`/`getEventsForUnits`/`touchOrderEquipment`, all
> try/caught so a missing migration degrades to "no history" and never fails the user's action; `getOrders`
> gained a `fullNoEq` fallback layer so a pre-migration DB doesn't silently lose `creator`/`created_at` (that
> was an existing bug behind "unknown"). Store `logActivity`/`activityFor`/`fetchActivity` + `activityVersion`
> (bumped per write so open cards refetch, NOT keyed on `orders` which churns on every quiet hydrate); local
> mode keeps the same events in a persisted `activity` array (**persist v4**, added to the `partialize`
> whitelist). ~15 write paths instrumented incl. packing sign-off — the initials stay hand-typed but the ACT is
> now tied to an account. UI: `ActivityList` + `lib/useActivity` on the order card (Attribution block gains
> "Equipment by X · when"; null renders "seed data", not "unknown") and the item card (inside the units table's
> scroll container), plus both peek cards and sent-by/returned-by in RepairModal.
> ⚠️ Added a NO-OP GUARD to `setReservationsForSet`: it deletes+reinserts every row, and each fires the
> set_units trigger, so one confirm toggle sprayed ~10 reserved/released events. It now returns early when the
> set already holds exactly those units.
> Fixed while here: a rules-of-hooks violation in `JobPeek` (useMemo after an early return — would mismatch
> state if the booking vanished mid-view) and moved the hook out of `ActivityList` (fast-refresh warning).
> `scripts/backfill-attribution.mjs` (`npm run backfill:attribution`) is **idempotent** (verified: a second run
> changed nothing) and is imported by `seed-supabase.mjs` so a reseed stays as rich: it filled 13 orders,
> 11 sets, 4 repairs, 235 usage rows, 71 anonymous events, and narrated 12 orders (36 events) with the raiser
> and the gear-puller deliberately DIFFERENT people. Verified in both modes: supabase (real DB rows carry
> `actor_id`, "Equipment by Ann Taylor" flips on edit, feed shows the diff) and local (persist v4, "Demo user"
> entry survives reload); lint clean except one pre-existing `KitStagingModal` hooks error; build clean.
> **CHANGE — over capacity is allowed, but never silent.** Reported: an item with 0 free was greyed out in the
> booking modal's inventory search, a dead end ("должна быть возможность добавить, даже если 0, просто должен
> быть об этом сигнал"). The crew has to be able to write a job down before the gear is back. Both pickers now
> let it through and SAY SO instead of refusing the click:
> `BookingModal` — the search row stays clickable and reads "0 free · add anyway" in amber; `addItem`/`setQty`
> lost their `Math.min(…, availCount)` caps; the selected line goes amber with "/N free · N short"; the header
> reads "X of Y units reserved · N over capacity"; and a banner spells out the consequence — over-capacity
> pieces stay on the list but **no unit is held for them** (`resolveUnitsForQuantities` only ever picks free
> units, so previously a request beyond stock would have been silently under-reserved).
> `OrderEquipmentModal` — the 5.6 zero-availability block gained a third choice, **"Add anyway"**, beside
> "Add as sub-rental" / "Choose another"; the line then shows "N over capacity" instead of "N left" and the
> footer totals it. `blocked` now carries an `intent` ('add' | 'switch') + index, because the same dialog is
> raised by `switchSource`: forcing there must MOVE the line in-house ("Switch anyway"), not bolt an extra
> quantity onto the order. Over-capacity is computed per ITEM, not per line (two lines of one item share a
> stock pool), and only for `barcoded` stock — consumables aren't unit-reserved at all.
> Frontend-only, no migration. Verified in supabase mode: order editor → Canon EOS R5 (0 available: one in
> repair, one held by Apple) → "Add anyway" → line "1 over capacity" + footer "· 1 over capacity"; booking
> modal → "0 free · add anyway" → header "10 of 11 units reserved · 1 over capacity" + amber banner + line
> "/0 free · 1 short". Both cancelled, so prod data is unchanged. Build + lint clean.
> **FIX — creating an order now leads straight into adding equipment.** Reported: "при создании ордер
> невозможно добавить инвентарь. Раньше это было под созданием букинга" — the old BookingModal had the
> inventory picker inline, but `OrderEditorModal` only collects job/studio/dates/PO, so gear needed a second,
> undiscoverable trip through the card's "Edit equipment". Now saving a NEW order opens `OrderEquipmentModal`
> on it immediately, from BOTH entry points: the Orders view (`onCreate` → `setPendingEqId`) and the CALENDAR
> (`createOrder` → `openOrder(id, from, { equipment: true })` → `orderFocus.openEquipment` → the same pending
> flag). A new `pendingEqId` + effect waits for the created order to appear in `orders` after the refetch
> instead of opening the picker on a half-known record. Button relabelled **"Create & add equipment"** and the
> banner now promises it ("items, kits and scenario lists"), so the two steps read as one flow.
> Deliberately NOT embedded inline: `OrderEquipmentModal` owns kit staging (`KitStagingModal`), scenario
> lists, the in-house/sub-rental switch and the over-capacity rule — inlining it would either duplicate all of
> that or nest a dialog inside a dialog. Chaining reuses it whole. Cancelling the picker leaves an empty HOLD
> order, which is honest (the studio slot IS booked) and matches the banner.
> Frontend-only, no migration. Verified on prod end-to-end: empty calendar cell → "Create & add equipment" →
> landed in the Orders view with the picker open → added Sandbag 25lb → saved → card shows EQUIPMENT · 1 PCS
> with "Created by Ann Taylor · Equipment by Ann Taylor" (the new activity log picked the flow up for free) and
> a working "← Back to Studio Calendar" trail. Test order + its shoot removed afterwards; prod back to 13
> orders / 11 sets, 0 leftovers, 0 console errors.
> ⚠️ `window.confirm` (BookingModal's delete) is auto-dismissed in the preview pane — deletes that go through
> it can't be exercised from the browser tool; verify those against the DB instead.
> **FEATURE — per-unit storage location (`units.placement`).** Reported: barcode and serial are editable but
> LOCATION isn't. LOCATION is **derived on read** (`repository.js` getInventory: "Available" /
> "In repair — <vendor>" / "<job> — <studio>" from set_units + open repairs) — there is no `units.location`
> column, and after "orders drive reservations" hand-editing where a unit IS would be recomputed away or would
> lie about gear that's out. What was genuinely missing is the OTHER location: the shelf a copy returns to.
> `20260806120000_unit_placement.sql` adds `units.placement` (item-level `inventory_items.placement` says where
> the TYPE lives; this says where THIS copy lives, because copies drift — one body in the van, one in the cage).
> **Null = inherit the item's placement**, so nothing is entered twice. UI: a "Storage location" field in
> `UnitEditorModal` (add + edit; empty clears the override) and the LOCATION column now shows — in priority
> order — the job/repair it's out on (derived, not typed), else the unit's own placement, else the item's in
> grey with a tooltip saying it's inherited, else "—". Repository reads it via a new fallback layer in
> getInventory and accepts it in `addUnits` (retries without the column on a pre-migration DB) / `updateUnit`
> (`placement: ''` clears). `describeEvent` for `unit.updated` now names WHICH field moved, so a relocation
> reads "**moved a unit** · stored: item default → Grip room · Shelf B3" while a barcode fix stays "corrected a
> unit" (7 Node assertions, incl. legacy events that predate the key).
> Verified on prod: set unit #0734 of Applebox Full to "Grip room · Shelf B3" → shows in the LOCATION column,
> `units.placement` written in the DB, and the item's Activity logged it as a MOVE by Ann Taylor. Build + lint
> clean (only the pre-existing KitStagingModal hooks error remains).
> ℹ️ Prod is at **317 units** (not 314): the activity log shows Ruslan added 4 units to Applebox Full and wrote
> one off while testing 6.x — real user data, deliberately left in place. Unit #0734 keeps the demo placement.
> **CLARITY — one name for "where it's kept", and one ROW PER COPY when adding units.** Two reports, both
> about the same modals. (1) "негде ввести локацию при создании" — the field existed in all three places but
> under three names: "Placement" in the item modal, "Storage location" in the unit modal, "Location" as the
> column. Now **Storage location** everywhere (item modal + its helper line, item card, peek card); the column
> keeps the name **Location** with a tooltip saying it shows the job/repair the unit is out on, otherwise its
> storage location. The DB column stays `placement` — no migration. (2) "не понимаю как создать больше одного
> юнита, если данные ввожу только по одному" — the old modal took a count PLUS one barcode/serial that applied
> to the FIRST unit only, so asking for 4 produced 1 typed + 3 generated with no way to enter the other three.
> `UnitEditorModal` (add mode) now renders **a row per copy**: "How many?" grows/shrinks the rows, each row has
> its own barcode + serial, "Add another copy" / × per row, and the greyed placeholders show exactly what a
> blank row will generate — computed skipping numbers typed in other rows, so the preview never promises a
> barcode it can't use. Storage location stays batch-wide (copies received together share a shelf) and says so.
> `store.addUnits` took `{count, barcode, serial}` and now takes `{ units: [{barcode, serial}], placement }`
> (a bare `count` still means "that many generated"), validating every typed barcode against the register AND
> against the other rows ("#1021 is listed twice"). Repository already accepted a per-unit array.
> Verified on prod: 3 rows → previews 1020/1021/1022; typing 1021 in row 1 re-previewed the others as
> 1020/1022; a deliberate duplicate was refused with nothing written; then 2 copies added — #1021 with the
> hand-typed serial and #1020 with a generated one — and both written off again (317 units, as found).
> **FEATURE — non-barcoded / consumable stock moves by a DELTA, and item-level changes are finally logged.**
> Reported: "non-barcoded инвентарь не могу добавить, только обновить количество. При этом в логах не
> учитывается." Both true. (1) A non-barcoded item has no unit rows, so the card had NO primary action —
> adding stock meant opening "Edit item" and overwriting the count. Now the primary button is **+ Add stock**
> (barcoded items keep "+ Add unit"), opening `StockModal`: a **Received / Went out** toggle, a count, and a
> live "On hand 50 → 60" preview. Taking out more than you have is blocked before submit (preview goes red,
> button disabled) — stock can't go negative. Store `adjustStock(itemId, { delta })` refuses barcoded items
> (they add/write off units instead) and logs `item.stock_adjusted` with `{delta, from, to}`.
> (2) The `item.created` / `item.updated` / `item.deleted` vocabulary existed in `lib/activity.js` and
> **nothing ever emitted it** — so an item card's Activity read "No changes recorded" no matter what you did,
> and a corrected count left no trace. `addInventoryItem` / `updateInventoryItem` / `deleteInventoryItem` now
> log, with `updateInventoryItem` computing a real diff (field labels + `quantity 50 → 52`) so the feed says
> what moved; a save that changes nothing logs nothing.
> ⚠️ TWO latent bugs surfaced while verifying, both fixed here:
> • `repository.updateInventoryItem` only wrote `quantity` when `kind` was ALSO passed, so a quantity-only
> patch was an empty `.update({})` — a **silent no-op** that still resolved, so the first stock change
> "succeeded" without changing anything (and logged an event saying it had). Now `quantity != null &&
> kind !== 'barcoded'` writes it, and an empty patch returns early instead of hitting the DB.
> • `logActivity` bumped `activityVersion` **before** the insert resolved, so an open card refetched while
> the row was still in flight and came back without it — with nothing to bump again. In supabase mode the
> bump now happens in `.then()` after the row lands (callers stay fire-and-forget). This affected EVERY
> activity feed, not just items.
> Frontend-only, NO migration (`inventory_items.quantity` and `events` already exist). 6 Node assertions on
> the new `describeEvent` cases. Verified on prod: +10 → 60 on hand with "Ann Taylor added stock · +10 ·
> 50 → 60", −10 back to 50, an over-take of 100 refused, and an Edit-item correction logged as
> "edited the item · quantity 52 → 50" appearing instantly. Test events then deleted with service_role and
> J-Hook 2" left at its seeded 50 with an empty feed — including the phantom event from the pre-fix no-op.
> **REMOVED — the `consumable` item type.** Requested: "consumables больше не нужны вообще, нужно убрать
> такой тип товаров". 2.1 shipped three types, but expendable stock behaves exactly like non-barcoded stock
> (counted by quantity, no unit rows) and the only difference that mattered — it isn't rented by the day — is
> carried by `day_rate is null`, not by the type. So: `ITEM_KINDS` is down to Barcoded / Non-barcoded (the type
> toggle and the Inventory type filter both render from it, so they shrank for free), `NonBarcodedBody` lost its
> consumable branch, and `dayRateFor` keys on a new `NOT_RENTED_BY_THE_DAY` id set (gaff-tape, aa-batteries)
> instead of the kind — so the estimate still lists them and still leaves them out of the total.
> `20260807120000_drop_consumable_kind.sql` CONVERTS the two rows to `non_barcoded` (they're real stock:
> referenced by scenario lists, 46 usage rows between them) and then tightens the check constraint to
> `('barcoded','non_barcoded')`. The old constraint was created by an inline `check (...)` on `add column`, so
> the migration drops whatever check on the table still mentions 'consumable' via a `pg_constraint` lookup
> rather than guessing the auto-generated name. `kindLabel` now falls back to "Non-barcoded" for an unknown
> kind (it used to say "Barcoded", which would mislabel a legacy row on an un-migrated DB — `itemCount` already
> counted it by quantity).
> ⚠️ The push produced NO output for ~10 minutes and looked like a network problem; it wasn't. Re-running with
> `--debug` showed `40P01 deadlock detected` — my own earlier hung `db push` attempts were still holding
> `AccessExclusiveLock` on `inventory_items` and deadlocking against each other. Fix: TaskStop every stale
> push, confirm no `supabase` process remains, then run ONE push with `--yes`. Do not fire a second push while
> the first is unfinished, and pipe the log to a FILE (`| tail` hides everything until the process exits).
> Verified on prod behaviourally rather than by trusting "Remote database is up to date": writing
> `kind='consumable'` through PostgREST is now refused with `23514`. Gaffer Tape reads "Non-barcoded · 24 on
> hand" with an Add stock button and its usage history (58 used / 22 jobs) intact, and the "Loft e-commerce"
> scenario list still resolves its tape line as "2× · 24 on hand". 0 console errors.
> **ARCHITECTURE — nothing is deleted any more: everything archives.** Requested after the deletion audit
> ("можем сделать так, чтобы из базы по факту ничего не удалялось, а просто архивировалось?").
> `20260808120000_archive_not_delete.sql` adds `archived_at` + `archived_by` to the TEN tables with their own
> identity (orders, sets, inventory_items, units, contacts, companies, kits, scenario_lists, order_addons,
> company_types), partial `where archived_at is null` indexes, and — the real guarantee — **replaces each
> table's blanket `for all` RLS policy with explicit `for insert` + `for update`, so DELETE is never granted
> to the app**. Child rows that are the CONTENTS of a document (order_lines, addon_lines, kit_slots,
> scenario_list_entries, set_units, roster_entries, packing_signoffs) keep their DELETE: they're replaced
> wholesale on save and the diff already lives in `events`.
> ⚠️ With no DELETE policy, a delete does NOT error — Postgres RLS filters every row, so it silently affects
> 0 rows. Verified with a throwaway order: DELETE as `authenticated` → no error, row survived; UPDATE
> archived_at → works; `order_lines` DELETE → still allowed. Nothing can be destroyed, but a missed
> hard-delete path would look like success, which is why every one was converted.
> **The structural decision: archived rows stay LOADED and are filtered in the views, not in the queries.**
> The app resolves display data by id from the hydrated store (an order line → item name, a roster row →
> person, a PDF → item), so query-level filtering would fill history with holes. Repository reads pass
> `archivedAt`/`archivedBy` through with a strip-and-retry fallback layer (`stripArchive`), and generic
> `archiveRow`/`restoreRow` replace the ten `deleteX` functions.
> Side effects: an ORDER releases its gear and archives its shoot **with the same timestamp** (that shared
> stamp is what makes restore exact — a shoot archived separately stays archived); an ITEM archives its live
> units the same way, so restoring brings back only the copies that went down with it, not one written off
> earlier; a UNIT write-off is now an archive (barcode stays taken, history readable). Store: `archiveRecord`
> /`restoreRecord` serve the five flat types from an `ARCHIVABLE` config; orders/items/units/bookings/addons
> have their own actions. `isArchived`/`notArchived` are exported from the store as the single predicate.
> **persist v5.** New `EVENT.ARCHIVED`/`RESTORED` (+ `ARCHIVE_KINDS`) — 5 Node assertions.
> Filtering audit: `isUnitFree` gets ONE guard that covers kits, staging, scenario lists, bookings, the order
> editor and the reservation sync; `activeUnits`/`itemCount` exclude written-off copies; every list view,
> every picker, the calendar, `orderSearch` and `lib/scenarios` (archived kit/item reported as unsatisfiable,
> never silently resolved). 8 Node assertions on the availability side.
> UI: new **Archive** view (`src/components/Archive.jsx` + `nav.js`) grouped by type with Restore, "N archived"
> links from Inventory/Orders/People, an Archived badge on a card reached by link, and Delete → **Archive**
> wording everywhere (AddInventoryModal's `window.confirm` became an inline confirm, so it's testable).
> **Removed a real blocker:** the person editor used to HIDE its delete button for anyone with job history
> ("On 2 jobs — kept for history"), because `roster_entries` is RESTRICT — the roster could only ever grow.
> Archiving retires them and keeps every job.
> Verified end-to-end on prod with row counts before/after: archiving **Apple Lightning Cable** (on an H&M
> order line — the case that used to fail SILENTLY) took it and its 20 units out of every list while the DB
> still held 44 items / 317 units and that order line still resolved its name; archiving **Ava Morgan**
> (2 jobs) worked with contacts 25 and roster_entries 22 untouched; archiving the CONFIRMED **Wedding
> Editorial** order released 5 reservations (set_units 74→69), took its shoot off the calendar (11→10 chips)
> and kept its 4 lines, then Restore reported "5 piece(s) reserved · 1 could not be — nothing free for those
> lines" (the Canon, correctly). All three restored; every table back to its exact baseline, 0 rows archived,
> 0 console errors.
> ⚠️ Two bugs I introduced and caught in the browser, both worth remembering: `notArchived` used in
> `OrderEquipmentModal` without an import (it takes props, so it had no store import) → white screen with only
> a React warning; and `livePeople` referenced in a `useMemo` defined ABOVE it in `People.jsx` (temporal dead
> zone) — neither is caught by `npm run build`. A grep for "uses the helper but doesn't import it" across all
> files is the cheap check.
> NOT included: purge/permanent delete from the Archive. It would need `service_role`, since the app no
> longer holds DELETE.
> **DEMO CONTENT — job names now follow the studio's real convention.** The brand-style placeholders
> ("Wedding Editorial", "Nike SS26 Lookbook") were replaced with the client's actual format supplied by
> Ruslan: `YYYYMMDD_AT_MAIN_<season>_<line>_<set>` e.g. `20260716_AT_MAIN_SepMM_Missy_OMSet1`. One rename map
> covered everything, because `setTitle` is the link key between a shoot and its order: `data/bookings.js`
> titles (11), `data/orders.js` `setTitle` (11 — which keeps each sub-rental order tied to the client job it
> served, so the "N × PO" grouping still demonstrates one job with several orders), and the `data/usage.js`
> JOBS pool (15 → the 13 supplied names; the two spare names carry the usage-history-only jobs). Prod updated
> non-destructively by name: 13 `orders.job_name`, 11 `sets.title`, 235 `item_usage.job_title` and 12 `events`
> whose `data.jobName` denormalises it. The two form placeholders now teach the convention too.
> ⚠️ These names never fit a calendar cell, so both chip renderers gained a `title` — the full name plus the
> time is on hover. Worth remembering for any new surface that shows a job name in a narrow column.
> ℹ️ The names carry their own dates (24 Jun – 20 Jul) while the demo's shoots sit in the current week
> (27 Jul – 2 Aug), so a name's date prefix does NOT match its shoot's date. Left as supplied; re-stamping the
> prefixes to the real shoot dates (or moving the shoots) is a one-liner if the mismatch ever matters.
> **CHANGE — equipment is picked IN the order form (the old New Booking behaviour).** Reported twice:
> "все еще нет добавления инвентаря / раньше когда была кнопка New Booking — там была возможность добавлять".
> The chained picker (create → OrderEquipmentModal opens) was not what was wanted: the crew writes the job and
> the kit in ONE window. `OrderEditorModal` now carries an **Equipment** block in create mode — scenario list
> preset, inventory search with the free/`add anyway` signal, ± quantities with `/N free · M short`, and whole
> kits through the **unchanged epic-3 `KitStagingModal`** layered over the form (exactly what BookingModal
> does). It builds the same line shape the full picker saves, so `onCreate(payload, lines)` writes them with
> `setOrderLines` right after the order exists — and `eq_updated_by` picks up the author for free.
> The full picker stays behind "Edit equipment" for what it alone owns: sub-rental vendors and the
> zero-availability dialog; the form says so. If nothing was picked inline, creating still opens the full
> picker (both entry points: Orders and the calendar), so the flow never dead-ends on an empty order.
> The calendar's "New order" uses the same form, so it needed `inventory`/`kits`/`scenarios`/`setOrderLines`.
> Verified on prod end-to-end: a form with 1 a-la-carte line + Camera Kit A wrote **5 order_lines** — four kit
> lines with their pinned/assigned units and slot labels (#0956 Camera body, #0963 Lens, #0967 Monitor, #0968
> Media) plus the loose Sandbag — attributed to Ann Taylor, with the shoot on the calendar. Test order removed
> afterwards (orders back to 14: 13 demo + Ruslan's own "test").
> ⚠️ While testing, a mid-flow HMR update remounted the modal and lost its draft, which looked like "the kit
> didn't attach". Re-run from a clean reload before believing a picker bug — and note the DOM read right after
> a click is stale (React hasn't flushed), which reads as the same symptom.
> **CHANGE — the Archive tab is hidden; archived records are not viewable at all.** Requested: "по архивам
> просто надо скрыть с UI вкладку и все… если запись заархивирована, то не давать доступ в ЮИ ее просматривать".
> The MECHANICS are untouched — nothing is ever deleted, RLS still refuses DELETE, every "Archive" button still
> stamps `archived_at` — but the UI now has no way to see or restore an archived record: nav entry + App.jsx
> branch removed (`Archive.jsx` kept UNROUTED with a header note; re-adding is two lines), the "N archived"
> links dropped from Inventory/Orders/People, the Archived badges dropped, and confirm texts no longer promise
> "restorable from the Archive" (now e.g. "It and all its copies leave the app"). **Restore = service_role/SQL
> only** (`update … set archived_at = null, archived_by = null`; for an item, also its units
> `where archived_at = <the item's stamp>` — the shared-stamp rule keeps separately written-off units archived).
> Enforcement is layered: selection resolvers in Inventory/Orders/People resolve against the LIVE collections
> (so a stale selection or "first item" fallback can't show an archived card), and a store predicate
> `isViewBlocked(kind, id)` makes `focusInventory`/`openOrder`/`focusPeople`/`peek` silently ignore a click that
> would open one. Old references still READ (an archived item's name and price stay on its order lines and in
> the estimate) — they just stop being links that go anywhere.
> Verified in supabase mode: nav has 4 tabs; archiving Apple Lightning Cable removed it + its 20 units from every
> count with NO "archived" hint anywhere; the H&M order still shows the line and totals; clicking the item name
> does nothing (no peek, no navigation); restored via service_role, prod back to 44 items / 317 live units,
> 0 archived rows.
> ⚠️ Testing note that bit me AGAIN: clicking a list row and then grabbing "Edit" in the SAME synchronous JS
> block clicks the button of the PREVIOUS render (React hasn't flushed) — I archived A-Clamp 2" instead of the
> cable. Split row-click and detail-pane interaction into separate tool calls, and verify WHICH record a modal
> is editing before confirming a destructive action.
> **CHANGE — stock is held PER DAY, and closing an order gives it back.** Two reported gaps, both real:
> availability ignored dates ("камера забронена на сегодня → на завтра я снова могу её забронить, даже если
> заказ ещё не закрыт"), and there was NO way to close a job, so gear was held forever. Proved before fixing:
> `occupies()` in `repository.js` only asked "active set, not returned" — 53 of prod's 60 reservations were for
> OTHER days yet counted as busy today, even though `set_units.reserved_from/reserved_to` were already stored;
> and `fulfilled` existed only in `orderStatus.js` + seeded rows, with the card toggling Hold ↔ Confirmed only.
> **Dates.** A unit now carries `reservations: [{setId, setTitle, studioId, from, to}]` — mapped from
> `set_units` in supabase mode (`getInventory`), derived from the bookings in local mode (`reservationWindows`).
> `lib/availability.js` gained `overlaps(a,b)` (inclusive, a missing `to` = one day) and `isUnitFree` takes a
> `window`: with one, a unit is free unless one of ITS reservations covers those days; without one the answer
> falls back to "right now", which is what the inventory table means. Repair and archived still beat the window
> (physically away / written off), and `alsoFree` still wins so a record being edited owns its own gear.
> Threaded through every picker: BookingModal (the shoot's date), OrderEquipmentModal + OrderEditorModal (the
> order's working window), `lib/scenarios.js`, and KitStagingModal via a `dateWindow` prop — its FIXED-slot
> conflict check now reads "booked for those dates" instead of "checked out". `reservedUnitsForOrder` resolves
> against the order's OWN window, and `reservationsFromOrders` replaced the single global `claimed` set with a
> **claims map (unitId → windows)**: two confirmed orders on different days can hold the same camera, but
> overlapping ones still can't. Fixed kit pins stay dateless (dedicated to their kit), EXCEPT for units the
> order's own kit lines name — which also fixes a latent bug where a kit line naming a pinned unit reserved
> nothing. Editing a confirmed order passes `ownUnits` (units its shoot already holds) as `alsoFree`, or the
> picker would report its own gear as taken.
> **Closing.** `CLOSED_STATUS`/`isClosedStatus` in `orderStatus.js`; `fulfilled` is relabelled **Closed**
> ("Shot and returned — the gear is back on the shelf") and the card carries **Close order** beside Back to
> hold, plus **Re-open order** on a closed one. Closing does NOT delete the reservations: new repository
> `markSetReturned(setId)` flips that set's rows to `status='returned'`, which `occupies` already treats as
> free — so the stock is released while `set_units` stays as the unit's job history (the history dialog reads
> "Returned"). Local mode mirrors it: a closed order's set keeps its `unitIds` but is flagged `unitsReturned`,
> and both `reservationMap`/`reservationWindows` skip it. New `EVENT.ORDER_CLOSED`/`ORDER_REOPENED` (5 Node
> assertions) and the card says what happened ("Closed — 11 piece(s) are back on the shelf and bookable
> again"). The packing list + add-ons stay available on a closed order: the pull sheet and its sign-offs ARE
> the record of what went out. NO migration ('returned' was already in the `set_units` check constraint, and
> child tables kept their UPDATE/DELETE policies).
> ⚠️ **Fixed a bug this would have introduced:** `setReservationsForSet`'s no-op guard compared unit ids only,
> so closing an order and re-opening it (same ids) would skip the write and leave every row `returned` — the
> order would read Confirmed while holding nothing. A returned row is not a holding, so it can never satisfy
> the guard now.
> ℹ️ The inventory table still shows the job a unit is committed to even when that job is weeks out (status
> `checked_out`) — deliberate, it's "where this copy is going". What was missing is WHEN, so the LOCATION cell
> now appends the dates in grey ("… — Studio 1 · Jul 27", spans as "· Jul 27 – Jul 30").
> Verified against prod (17 Node assertions on the date logic first): the order form on 2026-07-27 offered
> **7 free** C-Stands, the same form on 2026-08-10 offered **10**, and a 27→30 Jul span offered **5** — each
> number matching what the DB's own reservation rows predict. Then CL-26051 (11 pcs, 27 Jul) → **Close order**
> → 74 `set_units` rows intact with its 11 flipped to `returned`, #0762-0764 read Available, the unit's history
> still lists the job as "Returned", `order.closed {released:11}` + 11 per-unit `returned` events logged with
> an actor → **Re-open** → the same 11 barcodes back to `reserved` with the right dates and the order
> `confirmed`. Prod left exactly as found (74 reserved, CL-26051 confirmed, 35 test events removed),
> 0 console errors, build clean, lint unchanged.
> **FEATURE — a hand-typed Set field on the order** (`20260809120000_order_set_label.sql`). A studio runs up
> to `MAX_SETS_PER_DAY` shoots a day and the crew tells them apart by their own designation ("OMSet1",
> "Set 2") — the same string that ends their job names. Until now it only existed buried inside the free-text
> job name, so nothing could show or find it. `orders.set_label` is free text, hand-typed like `po_number`,
> deliberately on `orders` and NOT on `sets`: the three sub-rental history orders have no Set row of their own,
> and a field that silently drops what you typed is worse than no field. Threaded through: the order form
> (beside the job name, 2:1 grid), the card's THE JOB block, the peek card, the list row (a chip),
> `lib/orderSearch` (searchable on its own — "A-cam" found exactly 1 of 15), BOTH PDFs' meta table (the crew
> pulling gear needs to know which set), and the CALENDAR CHIPS — `byDay` now attaches each shoot's
> `order.setLabel`, so a cell reads "09:00–18:00 · OMSet2" and the tooltip spells it out. `getOrders` gets its
> own `withSetLabel` select layer so a pre-migration DB degrades to everything-but-this rather than to the stub
> shape. Demo content: the seed derives the label from the job name's trailing segment (store
> `setLabelFromJobName`, mirrored in `seed-supabase.mjs`) — 13 prod orders backfilled non-destructively; the one
> order with no convention in its name (Ruslan's "test") was left blank rather than given an invented value.
> ⚠️ **FIXED A WHITE SCREEN THAT WAS ALREADY LIVE:** the Studio Calendar crashed with
> `ReferenceError: companies is not defined` — the previous commit added the sub-rental vendor picker to
> `OrderEditorModal`, and the calendar (which renders that same modal) passed `companies={companies}` while
> nothing declared it. `npm run build` and oxlint BOTH pass on an undefined identifier inside JSX, and the
> Orders view worked, so it went unnoticed. Lesson: adding a required prop to a shared modal means checking
> EVERY component that renders it. New `npm run audit:jsx` (`scripts/audit-jsx-props.mjs`) greps every
> `prop={ident}` and reports any that its own file never declares — this bug class has now bitten three times
> (`notArchived`, `livePeople`, `companies`). It can false-positive on a renamed object destructure
> (`{ loading: activityLoading }`), so read the survivors instead of trusting the count.
> Verified on prod: created an order from the Orders view with Set "B-cam Set 3" → stored verbatim; edited it to
> "OMSet3 / A-cam" → persisted; search by "A-cam" → 1 of 15; calendar chip and tooltip both show it; peek card
> shows the Set row; the calendar renders again (all 11 chips, each with its OMSet1/OMSet2); "New order" from
> the calendar opens the form with the field. Estimate + packing PDFs asserted under Node by extracting text
> from the generated bytes. Test order and its shoot removed afterwards — prod back to 14 orders / 12 sets /
> 74 reserved set_units, 0 console errors.
> **FEATURE — per-item availability CALENDAR in Inventory** (no migration; every input already existed).
> Requested: opening an item should show which days it's booked, how many pieces exist that day, how many are
> taken and free, WHICH barcodes, under which SETS, and WHO booked them. `src/lib/itemAvailability.js` is a
> PURE module (no React/store/date-fns — runs under plain Node, 27 assertions): `covers(reservation, iso)`,
> `dayAvailability(item, iso)` → `{total, booked, away, free, entries, awayUnits}`, `availabilityForDays`,
> `freeUnitsOn`, `bookedDays` (spans expanded, used for "next commitment"), `nextIso`. Archived copies are out
> of `total` entirely; an open repair is reported as `away` on EVERY day (physically gone), never as booked —
> so `free = total − booked − away` always adds up on screen.
> `src/components/ItemAvailability.jsx` is the month grid + day breakdown, rendered in the item card between the
> units table and Activity (inside the SAME scroll container — measured: it takes the container's client width,
> 912px, not the table's 1220px scrollWidth, so it never stretches off-screen). Each cell reads "N free" and is
> tinted white / amber / rose (rose = none free); the selected day spells out "17 total · 5 booked · 12 free
> · 1 in repair" and lists one row per held copy: `#0851 → <job> · Studio L · OMSet2 · PO-4516 · Ann Taylor`,
> the job name peeking the SET card. "Who booked" resolves reservation → `setId` → booking → `booking.orderId`
> → order, taking `eqUpdatedBy || createdBy` (null renders "seed data", not "unknown"). The component reads
> `bookings`/`orders`/`peek` from the store ITSELF rather than taking them as props — that chain is its own
> business, and threading three collections through the inventory tree is exactly how `companies={companies}`
> became a white screen. An empty month says so and offers a jump to the next commitment instead of looking
> broken, and a footnote states that only CONFIRMED orders hold gear (a hold shows nothing). Non-barcoded stock
> gets a sentence explaining why it has no calendar (counted, never reserved copy by copy) instead of an empty
> grid.
> ℹ️ The calendar is where the per-day reservation model becomes visible: the Magic Keyboard's #0851/#0852 are
> booked on Jul 27 (Studio 1) AND again on Jul 30 (Studio 2) — the same copies serving two shoots, which the
> LOCATION column can't show (it names only the first holding).
> Verified in LOCAL mode in the browser (17-unit keyboard: 27 Jul 15 free / 28 Jul 16 / 30 Jul 12 with all five
> barcodes, sets, Set labels, POs and authors; Canon EOS R5 → "2 piece(s) · 1 in repair", 30 Jul rose "none
> free" with #0960 booked and #0959 flagged repair-on-every-day; month nav, Today, the "next commitment" jump,
> and the set link opening the job peek; 0 console errors). The SUPABASE path was verified headlessly instead:
> the same `getInventory` embed (`set_units → sets`) shaped by hand and fed to the SAME pure function returned
> 2 / 1 / 5 booked for 27 / 28 / 30 Jul against prod's real rows, and set → order → `eq_updated_by` resolved to
> real names — the browser session had expired and passwords are not something I type.
> **POLISH — calendars turn pages instead of blinking.** Every grid swapped in one frame, which reads as a
> flicker and says nothing about which way you went. `src/lib/useCalendarFlip.js` takes the page's token (a
> sortable string: `'2026-08'`, `'week:2026-07-27'`) and returns the CSS class for the incoming page — the
> caller also sets `key={token}` on the same element so React mounts a fresh node and the animation replays.
> Direction comes from comparing the new token with the previous one in a REF written during render (the
> "derive from the previous value" case; state here would cost an extra render per turn). Animations live in
> `index.css` **outside** any `@layer` so they can't be out-cascaded: `cal-flip-fwd`/`cal-flip-back` slide
> 1.5rem in from the side you're heading towards + fade, 200ms ease-out (fast on purpose — this sits under
> repeated ‹ › clicks), and `cal-fade` lifts 0.25rem for a same-page refresh. A
> `@media (prefers-reduced-motion: reduce)` block turns all three off.
> Applied to ALL FOUR grids: the studio WEEK view, the studio MONTH view (the mode toggle counts as a turn —
> the key carries `month:`/`week:`), the item AVAILABILITY month plus a fade on its day panel, and the
> `DateField` popover (used by every date input in the app).
> Fixed while here: `ItemAvailability`'s `stepMonth` read `monthAnchor` from the render closure, so two clicks
> in one tick stepped once — now a functional `setMonthAnchor((cur) => …)` (July → September on a double click).
> Verified in the browser by measuring, not eyeballing: on the frame after a ‹ / › click the grid reports
> `cal-flip-in-right`/`-in-left` **running** with `opacity: 0` and `matrix(1,0,0,1,24,0)` → settling to opacity
> 1 / no transform; direction correct in both directions in all four grids (including "Today" jumping backwards
> from September → `cal-flip-back`); the reduced-motion rule found in `document.styleSheets`; 0 console errors.
> ⚠️ A screenshot is useless for this — the capture lands after the animation settles. Temporarily forcing
> `animation-duration: 8s` and reading `getAnimations()[0]` + `getComputedStyle` on the next `requestAnimationFrame`
> is what actually proves it (and the class read IMMEDIATELY after a click is stale — React hasn't flushed).
> **CHANGE — one date on an order, and creating one is explicitly TWO STEPS (create happens on step two).**
> Two requests. (1) "Съемки всегда один день" — the form's date RANGE became a single **Set date**; `ends_on` is
> still written (equal to `starts_on`) because availability, billable days and `orderSearch` all read a window,
> and legacy multi-day rows must still resolve. Both PDFs print "Set date" and fall back to "A to B (N days)"
> only for those legacy rows.
> (2) The inline equipment block added to `OrderEditorModal` in the previous change was REMOVED again on
> request: "форма на втором шаге отличается и она лучше с точки зрения мелких деталей" — `OrderEquipmentModal`
> alone owns the in-house/sub-rental switch, the vendor picker and the zero-availability dialog, so duplicating
> a lesser picker in the form was the wrong half to keep. The flow is now honestly two-step and the buttons say
> so: step one reads **"Select equipment"** (not "Create order"), step two reads **"Create order"**.
> The important part is that **nothing is written until step two**. `OrderEditorModal`'s `onCreate` became
> `onProceed`, which only hands the payload over; `Orders.jsx` holds it in a `draft` state and opens
> `OrderEquipmentModal` on an order-SHAPED object with `id: null`. `isNew = !order?.id` is how step two knows
> it's creating: it relabels the button/title, shows a context strip (job · Set · studio · date + "Nothing is
> saved yet"), and its save calls `createOrder(draft)` then `setOrderLines(newId, lines)`. So cancelling step two
> leaves **no empty order and no booked studio slot** — the previous flow created the order first and left one
> behind. Capacity (`MAX_SETS_PER_DAY`) is now checked in `onProceed` too, before the crew spends time picking
> gear; `createOrder` still checks it when it actually writes.
> The CALENDAR uses the same two steps: its "New order" form no longer creates anything either — new store
> action `openOrderDraft(payload, from)` sets a transient `orderDraft` (+ `activeView:'orders'`, pushes the nav
> trail) which `Orders.jsx` consumes in an effect and opens step two on. The calendar consequently stopped
> reading `inventory`/`kits`/`scenarios`/`companies`/`createOrder`/`setOrderLines` (six selectors gone —
> and with them the class of bug that white-screened it).
> Removed as dead: `pendingEqId` + its effect and `openOrder`'s `{equipment}` option / `orderFocus.openEquipment`
> — they existed only to open the picker AFTER a create, which no longer happens. A `createdDraftId` ref keeps a
> retry honest: if the order is written but its lines fail, pressing the button again saves onto that order
> instead of creating a second one (a ref, so it doesn't reload the picker and discard the picks).
> Frontend-only, no migration. Verified in local mode: step 1 → "Select equipment" → step 2 titled "New order —
> equipment" with the context strip → **Cancel left 14 orders and no shoot** → re-run, added Avenger Double Riser
> → "Create order" → 15 orders, the new one selected on Hold with EQUIPMENT · 1 PCS, $12.00 estimate and
> "Equipment by …" attribution; then the CALENDAR entry point → landed in Orders with step two open, a
> "← Back to Studio Calendar" trail and still 15 orders → Cancel → localStorage confirmed 0 orders and 0 bookings
> for that date. Demo data reseeded afterwards, 0 leftovers, 0 console errors, build + `npm run audit:jsx` clean.
> ⚠️ Browser-tool note: in this preview pane `computer` coordinates are CSS pixels while the screenshot is
> downscaled (dpr 2), so ref/screenshot-derived clicks landed off-target; `form_input` (DOM-based) and reading
> state back out of `localStorage` are what actually verified the flow.
> **FIX — pick WHICH copy fills a kit slot, and make a pasted barcode work.** Two dead ends reported in the
> staging window, both real. (1) "Use available" called `freeUnitsOf(item)[0]`, so after Replace → **Return to
> stock** the copy you had just released was first in the pool and came straight back — there was no way to
> take a different one, and the pencil (a stock correction) read as the only alternative. The button is now
> **"Choose unit"** and opens `UnitPickList`: the copies free FOR THE ORDER'S DATES, each with barcode, serial,
> shelf and a note when that copy is spoken for on some other day. Ad-hoc "Add item" is two steps now for the
> same reason (item → which copy). (2) Pasting a barcode did nothing: resolution hung on `Enter`, which a
> hardware scanner sends but Ctrl+V does not. A value that IS a known barcode (`knownBarcodes` set) assigns on
> the spot, there's an explicit **Assign** button, and an accepted scan reports "#0966 → SmallHD 702 Touch
> Monitor · Monitor" instead of silently clearing the field. The field also STATES the rule it always followed:
> a barcode belongs to one copy, so the scan fills whichever slot expects that item — that is how the app knows
> what was scanned, and why the case can be worked in any order; a code whose item no slot needs says exactly
> that.
> ⚠️ `ownUnitIds` is an ARRAY from BookingModal and a SET from OrderEquipmentModal — everything else forwards it
> to `isUnitFree`, which normalises it, so the new list was the first code to call `.includes` on it and
> white-screened the view. Normalised locally.
> Verified in the browser: #0962 picked → Replace → Return to stock → **#0964** picked (the thing that was
> impossible), paste of 0966 with no Enter → assigned to the MONITOR slot, wrong-item and unknown codes refused
> with their reasons, unknown → "Register & assign" offer intact. 0 console errors.
> **EPIC #6 COMPLETE — the scanning station** (`20260810120000_scanning.sql`). Audit first: 6.1 packing PDF,
> 6.2 sign-off initials, 6.3 vendor per line, 6.4 add-ons and 6.5 digital checklist were all in place; what did
> NOT exist was the scan log and any check that gear came back. Both now do.
> `src/lib/scanning.js` is PURE (no React/store/browser — 28 Node assertions): `isScannable` (confirmed, not
> archived, not closed), `expectedUnits(order, booking, inventory)`, `scanStates`, `scanProgress`,
> `outstandingUnits` and `resolveScan`. Two decisions worth keeping: **expected units come from the SET's
> reservations, not the order's lines** (a loose a-la-carte line carries a quantity, not units — the
> reservations are the resolved answer, and sub-rental lines are vendor gear with no barcode of ours), and the
> **log is append-only with the LAST scan winning**, so a unit that goes out again on a second day reads as out
> and a double scan is answerable ("already scanned out") instead of counted twice.
> `scans` is its own table (soft `unit_id`/`item_id` refs like `events`, so a written-off copy doesn't take its
> history down), SELECT + INSERT only — no update, no delete: a scan log you can rewrite is not a log.
> `set_units.status` moves 'reserved' → 'checked_out' → 'reserved'; both non-returned states occupy the unit, so
> **a scan never changes availability**, only where the copy is.
> New view **Scanning** (`src/components/Scanning.jsx`, its own tab — it stays open by the door for a shift):
> left column lists only CONFIRMED orders with live "N out · N back · N to go", right side is Scan out / Scan in,
> one big always-focused input, per-unit state with who+when, and the full history newest-first. Store
> `scanUnit(orderId, code, direction)` is OPTIMISTIC like the packing sign-off — but a failed write is **taken
> back** and reported (`scanSyncError`), because a station that claims gear moved when the DB disagrees is worse
> than a slow one. That path is also what a pre-migration database looks like. New cap `SCAN` (a packing shift
> may move gear without being allowed to rewrite the order) and events `scan.out`/`scan.in`, so the order's own
> Activity feed answers "who took the camera out".
> **Closing now verifies the gear is back:** `Close order` is disabled while `outstandingUnits` isn't empty and
> names what's still out (both in the tooltip and in the card's new Scanning block). An order whose gear was
> never scanned out still closes — a crew can pull a job without using the station, and blocking that would make
> the flow unusable.
> Verified end-to-end in LOCAL mode: 10 of 15 orders offered; scan out #0851 → "1 out · 0 back · 10 still on the
> shelf" with "out 03 Aug, 13:04 · Demo user"; duplicate refused and NOT counted twice; #0999 (ours, other
> order) and #4242 (not in the register) refused with their own messages; scan-in of a unit that never went out
> refused; Close order disabled with "1 piece(s) are still scanned out"; scan in → history shows both
> directions with actor + time and Close order unlocks ("The shoot is done and the gear is back"). Demo data
> reseeded after; 0 console errors, build + `audit:jsx` clean.
> **Migration APPLIED and verified on prod** (pushed from a network that allows 5432; the studio's faster Wi-Fi
> blocks that port, but only `db push` needs it — PostgREST is 443, so everything below was checked over it).
> Verified BEHAVIOURALLY as the `authenticated` role, not by trusting "Finished": INSERT works and stamps
> `scanned_by = auth.uid()`; a forged `scanned_by` is refused (**42501**); `direction:'sideways'` is refused
> (**23514**); UPDATE and DELETE affect **0 rows** each and the row survives both (append-only, as intended —
> only service_role can clear it); the app's exact embed `scanner:profiles!scanned_by` resolves ("out 0792 ·
> Ann Taylor"), which is the thing that silently breaks without the FK; `set_units` accepts 'checked_out' and
> goes back. The other two side fetches `getOrders` runs (packing_signoffs, order_addons) still answer, so
> nothing regressed. Prod has **9 confirmed orders** with reservations (11/8/7/7/6/5/5/4 units) for the station
> to list.
> Then a full ROUND TRIP through exactly what `store.scanUnit` does, with the UI's own pure module judging the
> fetched rows: station lists 11 copies → scan out #0851 → `{total:11,out:1,pending:10}`, `set_units` =
> checked_out, log "out #0851 by Ann Taylor", close BLOCKED (1 still out) → scan in → `{out:0,back:1}`, status
> back to reserved, close ALLOWED. Undone afterwards: 2 scans deleted with service_role, `scans` back to 0 rows,
> every `set_units` status back to 'reserved' — prod exactly as found.
> ℹ️ The in-browser check ran in LOCAL mode; the supabase path was verified headlessly (same approach as the
> item availability calendar) because signing in means typing a password, which I don't do.
> **FIX — a barcode copied off the screen carries the `#`, and the station refused it.** Reported from prod: a
> code pasted into Scan out came back "##0806 isn't in the register" — doubled hash and a false negative, while
> #0806 was sitting in that very order's list. The register stores bare digits; the `#` in every screen and PDF
> is DECORATION, but the obvious way to imitate a scan is to copy a code off the screen, which copies it too.
> New `normalizeBarcode` in `lib/scanning.js` (the one place that owns "what a reader actually sends"): trim,
> strip leading `#`, trim again — so a reader's trailing CR and a copied `#0806` both resolve, and an unknown
> code now reports itself with ONE hash. Used by `resolveScan` AND by KitStagingModal (same paste, same
> problem — it also fed the raw value into the known-barcode check, so auto-assign missed too).
> The STATION also got the kit modal's paste behaviour: a value that is a known barcode fires immediately, since
> a hardware reader ends with Enter but Ctrl+V doesn't, and waiting for a keypress that never comes looks exactly
> like a broken scanner. 8 more Node assertions (36 total).
> Verified in the browser with the reported input: paste `#0806`, no Enter → "#0806 Aputure 300X — out",
> "1 out · 5 still on the shelf", row reads "out 03 Aug, 13:44 · Demo user"; `#4242` → "#4242 isn't in the
> register." (one hash); `#0966` pasted in kit staging → assigned to the MONITOR slot. Demo data reseeded after.
> ⚠️ The console keeps stale `[vite] Failed to reload` lines from mid-edit HMR races; the app reloads and renders
> clean, and `npm run build` passes (it would fail on a real syntax error).
> **FIX — "Broken → send to repair" from an ORDER did nothing at all.** Reported: sent a unit for repair twice,
> availability stayed 12, nothing in the item's log. Root cause: `OrderEquipmentModal` never passed
> `onMarkBroken` / `onSetBarcode` to `KitStagingModal` — only `BookingModal` did — and the staging window calls
> them optionally (`onMarkBroken?.()`), so the slot emptied, no repair row was written, no event was logged and
> the pool never changed. The pencil (barcode correction) was the same silent no-op in that flow.
> ⚠️ This is the `companies={companies}` bug class again, but INVERTED: a *missing* optional prop, which
> `npm run audit:jsx` cannot see (it only flags props whose value identifier is undeclared). When a child calls a
> handler with `?.`, a parent that forgets it fails silently — the child now says so instead
> ("This window can't send units for repair — do it from the item's card").
> Also fixed the two things that made the failure unreadable even once wired: **a comment is now taken** (repair
> shop + "What's wrong with it?", Enter to submit — `repairs.vendor`/`issue` were always nullable, so a blank
> shop is legal and the issue falls back to "Flagged broken while packing"), and the window **says what the
> write did** ("#0963 sent for repair to Sony Pro Support — it's out of the pool everywhere and logged on the
> item"). That last part matters because **the "N free" count legitimately does not move**: the slot's own unit
> was already excluded as claimed, so releasing it and removing it for repair cancel out. The pool really does
> shrink — reopening the window shows it (4 free → 3).
> `BookingModal` passes the typed details through instead of its old hardcoded "Flagged broken during kit
> staging", and the stale "scan, use available, or remove" hint now matches the buttons.
> Verified in local mode: send #0963 with shop + issue → slot empties, green line, unit reads "In repair — Sony
> Pro Support" in the units table, item Activity shows "Demo user sent a unit for repair · Sony Pro Support ·
> Zoom ring sticks at 50mm · #0963", and the lens pool went 4 → 3. Pencil in the same flow: `0965` refused
> (belongs to the SmallHD monitor) with the panel kept open, `9001` written through to `units.barcode`. Demo
> data reseeded after; 0 console errors.
> **UI — one dropdown for the whole app** (`SelectField` + `ComboField`, no migration). Reported: the Studio
> and Photographer dropdowns look nothing alike. They weren't the same control: Studio was a native `<select>`
> whose OPEN list is drawn by the OPERATING SYSTEM (dark on macOS, unstyleable), and Photographer was
> `<input list>` + `<datalist>`, whose suggestion list is drawn by the BROWSER — two OS widgets, two looks,
> neither ours. No amount of CSS fixes that; the open list of a native select cannot be styled at all. So both
> were replaced, exactly the trade `DateField` already made for dates: `SelectField` is a listbox
> (trigger + portal popover, checkmark on the selected row) and `ComboField` is free text WITH filtered
> suggestions (a photographer who isn't on the list must still be typeable). Both mirror DateField's popover —
> `position: fixed` through a portal so a modal's `overflow` can't clip them, outside-click and Escape to close
> (Escape `stopPropagation`s so it closes the list, not the modal), one radius, one shadow — and both call
> `onChange` with an event-like `{ target: { value } }`, which is why all 28 call sites kept their handler
> bodies verbatim.
> Converted **25 selects across 11 files + 3 datalists** (BookingModal photographer/model, the order form's
> photographer). `document.querySelectorAll('select').length` is now **0**. Two behaviours worth knowing: the
> ACTION dropdowns ("Add a kit…", "Pick a preset…") stay controlled at `value=""`, so they fall back to the
> placeholder after firing — the old `e.target.value = ''` reset became dead code and was dropped; and the
> popover flips ABOVE the trigger when there isn't room below (verified in a 420px-tall viewport: trigger at
> y=279, popover placed 163–269).
> Verified in the browser by measuring, not eyeballing: both popovers report the same `rgb(255,255,255)` and
> `border-radius: 12px`; Studio lists all six studios with the checkmark on the current one and picking one
> closes it; the photographer combo filters to "Marcus Reed" on "ma" and picking it writes the value; the kit
> dropdown inside the scrollable equipment modal is not clipped and staging still opens; 0 console errors.
> **CHANGE — the packing checklist is per COPY, and signing is a checkbox.** Asked what the three boxes were
> (6.2's initials fields: two people at sign-out, one at return — typed by hand) and then: barcoded units each
> on their own row, non-barcoded together by quantity, and a checkbox instead of typing.
> New PURE `packingRows(estimate, { inventory, booking })` in `lib/packing.js` (24 Node assertions). An order
> LINE is not a row: "Arri 2K Open Face x2" is two bodies that get carried and returned separately, and one tick
> for both is how a piece goes missing. Barcoded stock expands to one row per copy, resolved from the SET's
> reservations (`booking.unitIds`) — the same source the scanning station uses, because a loose line carries a
> quantity and the reservation is the answer to "which ones". What cannot be expanded stays a counted row AND
> SAYS WHY: non-barcoded = "counted stock", a sub-rental line = "vendor gear" (it has no barcode of ours — that
> is exactly what the reported screenshot showed), and pieces asked for beyond what is reserved =
> "no unit reserved" rather than vanishing off the sheet. A unit named by a kit slot is never handed to a loose
> line of the same item as well.
> `SignBox` (a text input) became `SignCheck` — a checkbox that records the SIGNED-IN account's initials plus the
> timestamp, so who+when is still answerable (hover the box) while packing is one tap with gloves on. The three
> columns stayed: the double sign-out is the studio's own process and an acceptance criterion; only the input
> changed. Footer says "signed as DU". `packingLineKey` is unchanged (`itemId::slotLabel::barcode`), so per-copy
> rows get distinct keys for free and existing sign-offs still resolve — NO migration.
> **The PDF prints the same rows** (`packingListPdf` now calls `packingRows` too) — a printed sheet that doesn't
> match the digital one means the crew is ticking two different documents. Totals line reads
> "N rows · N pieces to pull · N signed off by barcode".
> Verified in the browser: a x3 keyboard + x2 mouse order became **8 rows, 8 by barcode** (#0851/#0852/#0853,
> #0868/#0869…); the sub-rental order shows **11 rows, 10 by barcode** with the Astera Titan Tube left as
> "×2 · vendor gear · Northlight Rentals"; ticking a box turns it green with the tooltip "DU · 03.08.2026,
> 17:10 · tap to undo", and both OUT boxes on one row move the counter to 1/4. PDF asserted under Node by
> extracting text from the generated bytes (#0801 and #0802 on separate rows, "counted stock", the new totals
> line, 1 page). Demo data reseeded after; 0 console errors.
> **REMOVED — add-on packing lists (6.4).** Requested: "выпиливаем функционал аддонов — у нас можно на
> любом этапе редактировать список инвентаря". True — 6.4 existed because the printed sheet was treated as
> immutable, and "Edit equipment" works on a confirmed order, so a second labelled list was a parallel way to
> do the same thing (and a second place to look for gear). Gone from the UI, the store, the repository and the
> event vocabulary: `createAddon`/`setAddonLines`/`archiveAddon`/`restoreAddon`, `getAddonsByOrder`,
> `order.addons`, the Add-ons card section with its four per-row actions, the add-on equipment editor and
> checklist instances, `EVENT.ADDON_CREATED`/`ADDON_DELETED` + their `describeEvent` cases, the `addon` entry in
> `ARCHIVE_KINDS`, the add-on branch of the unrouted Archive view, and `packingListPdf`'s `opts.addonLabel`
> (header line + filename suffix). `getOrders` went from three side fetches to two.
> The add-on-only `prefix` argument of `packingLineKey` / `packingProgress` went with it — dead plumbing that
> reads as live is worse than no plumbing. Keys are unchanged in VALUE (the prefix was always '' for the main
> list), so existing sign-offs still resolve.
> Fixed while here: the order card's "N/N signed out" counted order LINES while the checklist counts per-copy
> ROWS, so the two disagreed after the per-copy change — the card now calls the same `packingRows`.
> ⚠️ My own edit put `packProg` ABOVE the `inventoryList` selector it uses — a temporal dead zone, the
> `livePeople` bug again. Caught in the browser, not by the build.
> **The DB tables are LEFT IN PLACE** (`order_addons`, `addon_lines`): no app code reads them, and dropping a
> table destroys data, which is the opposite of the archive-not-delete rule. Prod holds 2 empty `order_addons`
> rows from testing (0 `addon_lines`, 0 namespaced `packing_signoffs`) — now unreachable. A drop migration is a
> one-liner if the schema should be clean.
> Verified in local mode: the order card's sections are STATUS / THE JOB / ATTRIBUTION / EQUIPMENT / ESTIMATE /
> PACKING LIST / SCANNING / ACTIVITY with **zero** occurrences of "Add-on" in the DOM; the checklist still ticks
> (1/4 after two OUT boxes) and the card now reports the same 1/4; the packing PDF still builds with per-copy
> rows, the "PACKING LIST" header and no ADD-ON text (asserted from the generated bytes under Node).
> **CHANGE — a CLOSED order's equipment is locked.** Requested: no editing the composition once the order is
> closed. A closed order is history: the shoot happened, the gear came back and the reservations were released,
> so changing what it carried would rewrite the record every other screen reads — the packing sheet that was
> signed, the scan log, the estimate that was quoted. Two layers: the card's **"Edit equipment"** becomes a
> greyed **"Closed — locked"** with the reason on hover, and `store.setOrderLines` REFUSES the write with
> "Re-open it to change the gear". The store guard is the real one — a picker left open while someone else
> closes the order would otherwise still save (the modal already surfaces a returned `{error}`).
> What stays available on a closed order, deliberately: the packing checklist and the pull-sheet PDF (they ARE
> the record of what went out), the order's own metadata (a PO can arrive after the shoot), and Re-open.
> Verified in local mode both ways: the closed order shows "EQUIPMENT · 6 PCS · Closed — locked" with no edit
> button; **Re-open** brings the button back; **Close order** locks it again; the checklist and Print PDF stay
> reachable throughout. 0 console errors. NOTE the store guard itself has no UI route left to exercise — it
> exists for the stale-modal race and any future call site, and was reviewed by reading, not by staging a race.
> **FEATURE — a rental price ON THE ORDER LINE** (`20260811120000_order_line_day_rate.sql`). Requested: adding a
> rental item to an order must let you enter its rental price. `inventory_items.day_rate` (5.4) is OUR rate for
> gear we own and is the right default — but it is the WRONG answer for a sub-rental line: that gear is the
> vendor's, the price is whatever this deal costs, and until now such a line was quietly quoted at our own rate
> for a comparable piece we happen to own. New nullable `order_lines.day_rate`: null = follow the item (what
> every existing row means), a typed value overrides it FOR THIS LINE ONLY, so a vendor's price or a one-off
> discount never edits the item everyone else quotes from.
> `buildEstimate` already read `line.dayRate ?? item.dayRate`, so the estimate, the card and both PDFs picked it
> up for free; it now also carries `rateOverridden`, which the card shows as a small "set here" so a vendor price
> is visibly not our rate. UI: a `$ ___ /day` field on every a-la-carte line with the item's rate as the
> PLACEHOLDER (so the default is legible), `reset` back to the item, and for a sub-rental line an explicit
> "vendor price not set" until it is. Kit lines are untouched — they're unit-level rows of an item we own.
> ⚠️ **Fixed a trap I introduced:** I first put `day_rate` inside `getOrders`'s BASE select, which on a
> pre-migration database fails every rich layer and degrades to the stub shape — orders would silently lose
> kits, units, sources and vendors, not just the price. It is now the OUTERMOST layer
> (`withLineRate = withSetLabel.replace(...)`), verified against the real prod DB: the top layer fails with
> **42703** and the next one still returns `id, item, unit, kit_id, source, vendor, unit_id, quantity,
> slot_label, vendor_company_id`. `setOrderLines` likewise strips the column and retries — but REPORTS it
> ("the equipment saved, but N line price(s) did not … apply migration 20260811120000"), because a price that
> silently vanishes is worse than one refused out loud.
> 10 Node assertions on the pricing (vendor price beats ours, days multiply, an unrated line still contributes
> nothing, **$0 is a real price and not "unset"**). Verified in local mode: the field shows 285 as a placeholder,
> switching a line to Sub-rental reads "vendor price not set", typing 340 moves the modal footer
> 475 → **530**, saving shows "$340.00/day set here" on the card with the estimate at $530, re-opening the picker
> loads 340 back, and `reset` returns to 475. Demo data reseeded after.
> **Migration APPLIED and verified on prod.** Checked behaviourally as the app's own role, through the app's own
> pricing code: the TOP select layer now succeeds (20 orders); a real SUB-RENTAL line — Sony 24-70mm, our rate
> **75** — accepted a vendor price of **137.50**, and reading it back through `mapLineRow`'s shape into
> `buildEstimate` gave "137.5 /day · overridden: true" with the order total following it; clearing to null went
> back to following the item. Undone afterwards: 105 `order_lines` rows, **0** with a per-line rate — prod
> exactly as found.
> ℹ️ No DB check constraint on the value: a negative rate is refused by the field, and only this app writes the
> column. Worth a `check (day_rate >= 0)` if that ever stops being true.
> **FEATURE — choose the COPY for a plain item too, and never ask for one when there is no barcode.**
> Requested: picking an item (or applying a preset) should let you set its barcode "the same way as in a kit",
> and a non-barcoded item should not ask — neither loose nor in a kit. NO migration: `order_lines.unit_id`
> already exists (kits use it) and `reservedUnitsForOrder` already pre-claims ANY line that names a unit, so the
> model was ready — only the picker wasn't.
> `UnitPickList` moved out of KitStagingModal into `src/components/UnitPickList.jsx` (one definition, both
> windows) and gained an optional scan field: typing filters by barcode or serial, and a value that IS a free
> copy's barcode is taken immediately — so a reader and a pasted `#0958` both work (`normalizeBarcode`).
> In `OrderEquipmentModal` each in-house barcoded line now carries a **Copies** row: a chip per pinned copy
> (× to release it), "N × any free copy" for the rest, and "Choose / scan a copy". Pinning does not change what
> the crew asked for — it says WHICH piece the n-th one is; unpinned pieces are still resolved at confirm.
> Storage is the kit's own shape: a pinned copy is emitted as a unit-level line, which is why reservations,
> packing rows and scanning needed no special case. On load, loose unit-level lines are FOLDED BACK into their
> item's line as chips instead of showing N one-piece lines. Pinned ids join `claimed`, so a chip removes the
> copy from the free pool for every other line and kit (visible: "2 left" → "1 left" the moment you pin).
> Stepping the quantity below the number of pinned copies releases the last pin rather than lying about the
> count, and switching a line to Sub-rental releases them all — that gear is the vendor's and has no barcode of
> ours.
> No copy question for counted stock: the Copies row is gated on `kind === 'barcoded'`, and a KIT slot whose item
> is non-barcoded now reads "counted stock · no copy to pick", counts as satisfied and is left out of the add
> (it used to sit "awaiting scan" with 0 free and block confirm forever). `KitEditorModal` already refuses to
> author such a slot, so that path is defensive — exercised by fabricating one in localStorage.
> Verified in local mode: 4 barcoded lines each offer Copies, the non-barcoded Gaffer Tape line does NOT;
> pasting `#0958` with the hash pinned that copy and dropped the pool 2 → 1 left; saving wrote a
> `unitId: u-0958` line and the card shows "#0958"; re-opening folded it back to a chip; the fabricated counted
> kit slot showed "no copy to pick", "2 of 6 slots assigned" and "Add 2 to set" (not 3), with no meaningless
> Replace. Demo data reseeded afterwards — 0 loose unit lines, fabricated slot gone, 0 console errors.
> **UI PASS — five reported details.** (1) **Subcategory is a list**: new `SUBCATEGORIES` map in
> `data/inventory.js` (7 categories × 5-6 kinds), offered through `ComboField` and merged with every
> subcategory the register already uses under that category — so the list maintains itself. Deliberately NOT a
> closed dropdown: new kinds of gear arrive, and refusing one is worse than an occasional new entry.
> (2) **The date popover jumps by month and year**: the title is now a button that swaps the day grid for 12
> month buttons + a scrollable year list (`THIS_YEAR + 3 … -30`), because paging one month at a time is useless
> for a purchase date 15 years back — which is exactly what that field asks for. Kept inside the SAME popover
> rather than nesting another portal. The ‹ › arrows step a YEAR while the chooser is open.
> (3) **Kits and scenario lists lost their category**: a kit is described by its name and slots, a list by the
> shoot it's for, and the third free-text label was a taxonomy nobody maintained. Gone from both editors, both
> list panes, both detail headers, the preset dropdown labels and the unrouted Archive rows. DB columns stay.
> (4) **The availability grid is legible at a glance**: weekends grey (slate-100), a day with sets amber-50,
> nothing free rose-50, and each cell now shows BOTH numbers — "15 free" over "2 out". "11 free" alone doesn't
> say whether a day is quiet or nearly full.
> (5) **One filter design**: new `FilterBar` (+ exported `FILTER_FIELD`) carries the search box, the
> Filters disclosure with its active-count badge, an optional trailing control (Orders' sort), the folded filter
> panel and the "N of M · Clear all" footer. Orders and Inventory both render it, so the two panes stopped being
> two designs — measured: identical button classes and one dropdown size (6px 8px / 12px) across both.
> ⚠️ Two of my own slips, both caught in the browser: `liveItems`/`liveScenarios` don't exist in Inventory (the
> collections are `liveInventory`/`liveLists`) — a white screen the build does not catch; and
> `npm run audit:jsx` reported `FILTER_FIELD` undeclared, which was a FALSE ALARM — its import pattern didn't
> understand `import Default, { Named }`. Fixed the script too: a tool whose job is to be believed can't cry wolf.
> Verified in local mode: subcategory suggests 6 Grip kinds; the date popover jumps 2011 → Mar → "March 2011";
> New kit has Name + Notes and no Category; the August grid shows white weekdays, grey 1-2 Aug, amber 3-4 Aug with
> "15 free / 2 out"; both filter bars share one look. 0 console errors, build clean, both Node suites pass.
> **UI — the studio calendar jumps by month and year too.** The date FIELD got this a change earlier; the
> calendar itself still only had ‹ › + Today, so a shoot two years out was 24 clicks away and a past season
> worse. The month/year chooser moved out of `DateField` into `src/components/MonthYearPicker.jsx` (one
> definition, one span of years: `THIS_YEAR + 3 … -30`) and the calendar's PERIOD LABEL became its trigger — the
> label was already saying which page you're on, so it's the honest place to change it. Same popover contract as
> DateField: `position: fixed` through a portal, outside-click and Escape to close. Picking a month keeps the day
> of the month, so the week view lands on a comparable week instead of always on the 1st; in month mode it just
> turns the page. Using ‹ › or Today folds the chooser away — those are a different intent.
> ⚠️ **Fixed a real staleness bug while testing it**: both handlers computed from `refDate` captured in the
> render closure, so picking a year and then a month faster than a re-render computed the month from the OLD year
> and silently lost the jump (verified: 2026 → Dec landed on Dec 2028). They now read
> `useStore.getState().selectedDate` at click time. Same trap as `ItemAvailability`'s `stepMonth`, third time in
> this codebase — if a handler derives from state and can fire twice before a render, read the store, not the
> closure.
> Also refactored `goPrev`/`goNext` into one `page(delta)` — they were the same body twice and both needed the
> new fold-away.
> Verified in local mode: the label opens 12 months + years 1996-2029; year 2028 → "Jul 31 – Aug 6, 2028", then
> Mar → "Feb 28 – Mar 5, 2028"; both clicks in ONE tick now give Dec 2026 (the bug above); month mode reads
> "December 2013" after a jump; Next while open pages AND closes it; Today returns to August 2026. 0 console
> errors.
> Ship each section end-to-end (migration → verify on Supabase → commit → push → confirm prod).
> Note: migrations 2.6 `repairs` (`20260725120000`), 2.7 `item_usage` (`20260725130000`), 3.1 `kit_slots`
> (`20260726120000`), 3.3 slot types (`20260727120000`), 3.5 scenario lists (`20260728120000`),
> 4.1/4.2 people profiles + `cvs` bucket (`20260729120000`), 4.3/4.4/4.5 company details + `company_types`
> + `units.sub_rental_vendor_id` (`20260730120000`), `orders.kind` (`20260730130000`),
> 5.1/5.2 order fields + `po_number` + `created_by` + `hold` status (`20260731120000`),
> 5.3/5.4 order-line kit/unit columns + `inventory_items.day_rate` (`20260801120000`),
> 5.6 order-line `source` + `vendor_company_id` (`20260802120000`).
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
