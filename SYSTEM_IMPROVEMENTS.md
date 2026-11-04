# SchoolCore review and improvement roadmap

Source review: 31 October 2026. Scope: academic structure, student billing and payments, batches, year closing, accounting, Extra Billing and portal navigation. This is an implementation review, not a production-data audit or a claim that every unrelated subsystem has been tested.

## What is already implemented

| Area             | Existing behavior                                                                                             | Important limit                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Academic setup   | Academic years, class-group mappings, classes, sections, courses and subjects                                 | School year list is read-only; initial/exceptional years need support                          |
| Periods          | Numbered subject/teacher assignments with duplicate/count warnings                                            | No complete weekly timetable or room/time clash solver in this screen                          |
| Batches          | Intake registry, current level and graduated flag; optional student/class links                               | Registry edits do not move students or change class mappings                                   |
| Fees             | Class rates, title payable months, backend class-month overrides, discount handling                           | Current Fee Setup form has no class-month override control; fee lookup excludes batch          |
| Charges          | Class ledger posting, opening dues, individual catch-up and duplicate checks                                  | Review historical adjustments separately from ordinary monthly postings                        |
| Payments         | Four payment modes, discounts, receipt history/reprints, short duplicate guard                                | A short cache-backed guard is not a durable external-payment reconciliation system             |
| Receipt numbers  | School/fiscal-year sequence shared by student, cash and Extra Billing receipts; school lock during allocation | Keep the fiscal year with the number when searching across years                               |
| Academic closing | Mismatch checks, continuing-cohort guard, transactional net balance carry, new year/mapping update            | No automatic promotion or full batch progression wizard; normal carry is a net opening balance |
| Accounting       | Ledgers, income/expense/journal vouchers, reports, year close and payroll carry review                        | No automatic income voucher in the reviewed student-payment save path; Contra menu disabled    |
| Extra Billing    | Separate parties, charges, receipts and balances                                                              | Separate from student dues; requires module access                                             |
| Help             | Searchable database-authored guides with a bundled fallback                                                   | Existing database articles do not refresh merely by deploying a new seed file                  |

## Corrections made in this change

- Expanded the guide library from 23 to 34 articles and created a sequential user manual.
- Removed instructions to recreate all classes every year or create academic years directly from the school list.
- Corrected the distinction between posting charges, taking payments, carrying balances and entering accounting vouchers.
- Documented fiscal-year receipt numbering, duplicate protections, batch limitations and separate academic/accounting closing.
- Replaced the single hash portal address with an optional catch-all page route. `/admin#manage.sections` becomes `/admin/manage/sections`; nested pages, role portals and old stored links remain supported.
- Separated development (`.next-dev`) and production (`.next`) output to prevent concurrent servers/builds from overwriting each other’s chunks; `NEXT_BUILD_DIR` supports isolated verification.
- Removed premature page-state changes from shortcuts and the cancellable animation-frame loading gate that could leave the portal loading indefinitely. Login retains the requested page. Cross-role navigation remounts the context so school/session state is not reused between portals.

## Recommended implementation order

The items below are proposals, not features delivered by this documentation/routing change.

### 1. Make setup and billing easier to verify

**Build:** a setup checklist linking to missing mappings/classes/fees; a class payable-month editor exposing the existing backend field; a pre-posting comparison of old/new rates and discount effects; a daily cashier reconciliation page.

**Acceptance:** an administrator can see why a class cannot bill; a later intake gets only its intended months; saving a rate does not silently rewrite history; cash/bank/cheque/wallet totals match saved receipts including void/discount treatment.

**Why first:** most setup mistakes become financial corrections later. Exposing existing capabilities is smaller and more useful than adding another parallel billing system.

### 2. Build the batch-aware rollover wizard

**Build:** a read-only preview covering every shared academic-year group, continuing and graduating cohorts, repeaters, balance carry, promotion and new intake. Show program length and explicit student selections. Preserve intake identity and mirror mappings when stamping old classes with batches. Offer per-title carry for continuing cohorts after reconciliation.

**Acceptance:** no junior silently becomes a graduate; repeaters stay at their actual level; each balance carries once; retrying a completed operation cannot duplicate it; interruption rolls back or resumes from a recorded state; old mappings and receipts remain explainable. A shared year cannot be accidentally closed for just one of its still-running groups.

**Dependencies:** `backend/docs/BATCH_AWARE_CLOSING_DESIGN.md`, reliable course lengths and a reviewed batch/class inventory. The existing financial rollover command is not proof the full workflow is complete.

### 3. Connect billing to accounting explicitly

**Build:** configurable fee-title/account mappings; cash/bank/wallet settlement mappings; a previewed posting batch with a permanent link back to each source receipt; reconciliation of unmatched/unposted receipts. Decide the recognition and deposit policies with the school accountant before implementing postings.

**Acceptance:** each source is posted at most once; the voucher links back to the receipt; a refund or void generates the appropriate linked correction; discounts and refundable deposits are not silently counted as ordinary income; historical collections are not reposted merely because the integration is enabled.

**Dependencies:** agreed accounting policy and a reconciled opening position. Do not implement an unreviewed “auto IncomeEntry on every save” signal.

### 4. Finish the payment lifecycle

**Build:** explicit refund/credit-note workflows, adjustment reasons and approval thresholds; cheque status/return handling; bank/wallet transaction references and reconciliation; durable request identifiers for future payment callbacks; collection allocation visible by title and period.

**Acceptance:** retries and duplicate callbacks settle once; partial payments retain their remaining due; overpayments and credits have an explicit balance policy; refunds retain their source reference; cheque return restores the correct balance without deleting history.

### 5. Strengthen closing and history

**Build:** a single preflight report showing affected classes, students, accounting ledgers and payroll; clear date boundaries; saved before/after reconciliation totals; a controlled recovery workflow that checks for later dependent transactions.

**Acceptance:** new opening balances reconcile to signed-off closing figures, including zero and credit balances; failed closing leaves no partial new year; two simultaneous close requests do not both succeed; recovery cannot silently orphan later receipts or vouchers.

**Review target:** the academic close locks mapping rows; the accounting close reads the open year before its atomic work. Add a focused concurrent-close test and locking/revalidation to the accounting close before promising the same retry guarantees there.

### 6. Add richer academic operations

**Build:** weekly timetable with start/end times, rooms and teacher conflicts; repeat/back-paper tracking; batch progression history; optional-subject roster review; guided year templates.

**Acceptance:** two classes cannot book the same teacher/room at the same time unless explicitly allowed; repeaters retain correct intake and level; exam rosters and fees still agree with actual enrollment.

### 7. Keep help current with the product

**Build:** versioned guide updates with a preview of changed seeded text, preservation of administrator customizations, role-specific checklists, printable training examples and contextual links.

**Acceptance:** deploying a revision does not overwrite a school's authored help or support details; a reviewer can publish only the intended articles; seed and fallback content stay equivalent.

## Routing implementation and verification

Public paths map to existing permission-filtered view keys, so `/staff/payment/student` resolves to `payment.student` through the same staff/module gates. Unknown view keys use the existing unavailable-page state; unknown portal roles return 404. Public website anchors remain ordinary anchors.

The shared navigation helper handles only Next errors explicitly marked `cancelled`. It does not install a global error suppressor or hide genuine render/API failures. The optional catch-all keeps same-role navigation on one page route with shallow navigation. Back/Forward and refresh therefore refer to actual URLs without initiating the former hash-only rendering branch.

Relevant files: `frontend/src/methods/portalRoutes.js`, `frontend/src/components/PortalLink.jsx`, `frontend/src/pages/[role]/[[...view]].jsx`, `frontend/src/contexts/AppContext.jsx` and `frontend/src/tests/portal-routes.cjs`.

Framework references: [Next.js dynamic routes](https://nextjs.org/docs/pages/building-your-application/routing/dynamic-routes) and [router navigation and cancellation](https://nextjs.org/docs/pages/api-reference/functions/use-router).

## Review boundaries

Do not read the older `DOCUMENTATION.md` as a current user manual: it mixes rebuild proposals with historical implementation notes, including superseded receipt-numbering details. Use [USER_MANUAL.md](USER_MANUAL.md) for these operational workflows and verify source when implementing changes.

No live fees, payments, student moves, accounting vouchers, closing operations or database guide overwrites were performed as part of this review.

## Duplicate-feature audit and consolidation

The shipped admin, staff-filtered and superadmin navigation was reviewed alongside its view mappings. Absence SMS had two visible entries for the same component; it now appears once under Communication → SMS. Seat Plan and Seat Plan (old) are one destination with room seating and student photo-label tools, preserving the unique print options.

Repeated dashboard, attendance and RFID view definitions were removed. Their legacy addresses are converted to canonical paths before checking the user's permitted views. This keeps old bookmarks without maintaining another screen registration or permitting an alias to bypass page access checks.

Create/list screens, reports with different scopes, academic/accounting closing and distinct billing modules were retained: they perform different operations or carry different permissions. Library Access is also distinct from enabling the library module: it controls cross-school library sharing, so it must not be merged blindly with a module toggle.

The menu test now evaluates the actual exported menu data, including generated canteen menus, checks every destination against all module view maps and checks canonical destinations for duplication.

## Verification of this change

- Final isolated production build passed (`NEXT_BUILD_DIR=.next-routing-test npm run build`).
- `node src/tests/portal-routes.cjs` passed role/path conversion, legacy aliases, query preservation and cancellation handling.
- `node src/tests/menu-search-and-pruning.js` passed actual exported menus, all module targets, pruning/search and duplicate-destination checks.
- `node src/tests/sidebar-single-open-submenu.js` passed sidebar-state checks.
- `src/tests/portal-routing-browser.cjs` passed in Chromium against the built frontend with mocked APIs: legacy URL conversion, direct loading, guide links, Back/Forward, refresh, rapid clicks, seat-plan tools, SMS alias, restricted staff view and invalid role. No browser page errors occurred.
- All 34 guide categories, view targets and seed/fallback content were checked for consistency; `git diff --check` passed.

For the browser regression test, start the built frontend on port 3107 (or set `ROUTING_TEST_URL`) and run it with Playwright available. `PLAYWRIGHT_MODULE` can point to an existing local installation; `BROWSER_EXECUTABLE` can select an existing Chromium binary. Backend responses are mocked, so this verifies routing/UI behavior rather than live accounting data.
