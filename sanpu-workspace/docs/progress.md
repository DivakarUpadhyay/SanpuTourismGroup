# Progress ledger

Resumable checkpoint: read this file first, then continue with the first unchecked item.

| # | Phase | Status |
|---|---|---|
| 0 | Design folder (`../design`): screens.html, database-design.md, workflows.md | done |
| 1 | SQL: shared admin schema + procs, ERP schema/procs/seeds, AI schema/procs/seeds; idempotent re-run verified | done |
| 2 | Shared .NET core (Domain/Application/Infrastructure/Api): auth, JWT, refresh, admin | done (smoke-tested via curl) |
| 3 | ERP backend (A) | done (booking/hold/approval/payment/refund/webhook/recon/group-sim smoke-tested) |
| 4 | AI Copilot backend (B) | done (trip/sim/proposal/approve/search/docs/evals 9/9 smoke-tested; AI key PENDING_USER) |
| 5 | Next.js shared web + both frontends | done (typecheck clean; pages render in Chrome; 0 failed requests) |
| 6 | xUnit unit + SQL integration tests | done: 68 unit + 25 integration = 93 passed (real SQL Server, disposable *_Test DBs) |
| 7 | Playwright E2E, Newman/Postman, OpenAPI export | done: 29 functional + 51 screenshot = 80 passed; Newman 2×11 requests / 39 assertions, 0 failed |
| 8 | Docs | partial: GitBook screen pages (51, real screenshots) + SUMMARY.md + tests/interaction-matrix.csv generated; design spec aligned to the real API. TODO: README, .env.example, SECURITY.md/threat model, authorization matrix, THIRD_PARTY_DEPENDENCIES.md, fixed GitBook pages (getting-started, architecture, interview 20/60), verification-report.md, DELIVERY_REPORT.md, CI workflow, PR template/CODEOWNERS, ADRs, PHP legacy client (PHP not installed here), docker-compose (Docker not installed here) |

## Resume here
Run `node tools/build-gitbook.mjs` after any screen change. Full test run: `./scripts/e2e.ps1 -Server <sql>` (last result: 80/80 Playwright, Newman 0 failures) and `dotnet test Sanpu.slnx` with SANPU_SQL_SERVER set (93/93). Next: write the TODO docs in row 8.

## Phase 9 — product expansion (requested 2026-11-17)
Order of work; tick as done. Each item: DB (migration + procs + idempotent seed) → API → UI (customer + admin) → tests → visible Chrome check.
- [x] English only, destination images, destination guide (overview, history timeline, nearby places) on the tour page
- [x] Customer home redesign (both apps); public showcase API (AI app)
- [x] Demo/name wording removed from UI and seeds (020_content_cleanup.sql upgrades existing DBs); brands "Sanpu Travel" / "Sanpu Trip Copilot"
- [ ] A. Customer header: multi-level (dropdown) menu from DB; professional footer (newsletter, columns, legal pages)
- [ ] B. Modern date picker component everywhere (replaces native date/month inputs)
- [ ] C. Colour scheme refresh (Sanpu deep blue + gold anchor)
- [ ] D. Travel services engine: Hotels, Flights, Buses, Taxis (search, hold, book, admin inventory)
- [ ] E. ERP customer menus: Tours, Destinations hub + guide pages, Departure calendar, Compare tours, Deals, Help/FAQ, Contact (creates ops task)
- [ ] F. Promotions / ad banners / coupon codes (redeemed in tour + service bookings; admin pages; usage limits)
- [ ] G. Automation Center (bots as DB rules run by the background worker, run log, audit, never bypass human approval) in both apps
- [ ] H. Admin "wow" pass (dashboard charts, KPI cards) in both apps
- [ ] I. AI app on the real model — PENDING_USER: ANTHROPIC_API_KEY via user-secrets (paid service, user decision)
- [ ] K. Real recommendations: SQL scoring from the customer's views (TourViews log), bookings, region affinity, popularity and open dates, with a reason per item; trending for visitors
- [ ] J. Update/extend tests (unit, integration, E2E, Newman), full run, visible Chrome walkthrough, regenerate GitBook
- [ ] L. Smooth UI: keep previous data while reloading, content-sized skeletons, cached public config (no header flash), top progress bar, reserved image space, busy states
- [ ] M. Partial payments (deposit % + balance due N days before start; Payment.* settings; ledger ServicePayments; usp_Tour_CustomerPay / usp_ServiceBooking_Pay) — SQL done, API/UI pending
- [~] N. ECPay staging: signed AioCheckOut accepted, QueryTradeInfo verified (MacOk) — final card step on ECPay staging page needs a manual 3-D Secure completion; demo script tools/ecpay-demo.mjs. Simulated provider for tests.

### Status 2026-11-17 (late)
- E2E: 130/131 passed; only failure was the responsive audit flagging the scrollable tour section bar (fixed: .dt-tabs allowed). Newman 0 failures.
- Real photos: tools/fetch-photos.mjs (Wikimedia Commons, CC licenses) + credits; seeds 015_Photos / AI 011_Photos.
- NEXT: G automation bots, H admin dashboards, AI app (3102) upgrade, L top progress bar + cached config, J new E2E tests (coupons, payments, service booking, contact), GitBook regen.

### 2026-11-17 (night) — done
- Header: transparent over photo heroes, solid on scroll, aligned with content, header search (tours/places/travel), mega-menu panels with DB descriptions (Menus.Description, migration 003).
- Auth pages: plain centered layout (no card), password show/hide everywhere, forgot-password validation (API 422 for malformed email, UI inline errors, resend timer). Fixed client email regex.
- Original logo (mountains/sun/sea mark) in header/footer/auth + favicon icon.svg, apple-icon.png, icon-512.png.
- Rate limit: new "public" policy (60/min) for coupon check, help feedback, banner tracking.
- scripts/coupon-check.ps1: 15/15 PASS (preview rules, caps, kind/min/unknown/malformed refusals, per-customer limit, release on cancel, tour + service redemption, staff redemptions).

### Requested next (user, 2026-11-17)
- [ ] O. Detail pages for each hotel / flight / bus / taxi (all from DB + REST): description, address & map link, amenities, room/fare details, policies, baggage, timetable, photos gallery, reviews summary, similar options.
- [ ] P. "International level" booking UX: filters (price range, rating, amenities, departure time, stops), sort, per-traveler details, fare/room options, booking summary, e-ticket/voucher page; consider international routes/hotels.
- [ ] Q. Remove the boxed "card" look everywhere (customer + admin): editorial, full-bleed sections; distinctive visual language.
- [ ] R. Pagination everywhere (server-side paging procs: page, pageSize, total) + "Load more" with smooth skeleton/fade for customer lists; numbered pager for admin tables.
- [ ] G/H/I/J/L from Phase 9 still open.
