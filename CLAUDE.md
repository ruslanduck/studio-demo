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
> Next in #6: the scanning page (scan-out/in log with who+time — closing an order is now a manual action;
> auto-closing once every line is signed back in is the remaining piece).
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
