# Sanpu Tourism Group — Tour Operations ERP & AI Operations Copilot

Two production-style applications in one monorepo:

| App | Customer site | Admin panel | API (Swagger) |
|---|---|---|---|
| **Sanpu Travel** — tour operations ERP (tours, hotels, flights, buses, taxis, coupons, payments) | http://localhost:3101 | http://localhost:3101/admin | http://localhost:5101/swagger |
| **Sanpu Trip Copilot** — AI operations copilot (itineraries, disruption recovery, document intake, evaluations) | http://localhost:3102 | http://localhost:3102/admin | http://localhost:5102/swagger |

**Stack:** ASP.NET Core (.NET 10, Clean Architecture) · Dapper + stored procedures only (no EF) · SQL Server · Next.js (React, TypeScript) · JWT with rotating refresh cookies · DB-driven menus, roles, permissions and settings · Playwright, xUnit, Newman.

## Folders
- `design/` — screen designs per form, database design, workflows
- `sanpu-workspace/` — source code, database scripts, tests, docs (see `sanpu-workspace/docs/progress.md`)
- `SANPU_FINAL_FULLSTACK_GITBOOK_MASTER_SKILL.md` — the build specification

## Run locally (Windows, SQL Server with Windows authentication)
```powershell
cd sanpu-workspace
./scripts/dev-secrets.ps1 -Server '<your SQL instance>'        # creates local secrets (never committed)
./scripts/db-setup.ps1 -App erp -Server '<your SQL instance>'  # migrations, procedures, seed data
./scripts/db-setup.ps1 -App ai  -Server '<your SQL instance>'
npm install
./scripts/dev-api.ps1                                           # builds and starts both APIs
npm run dev --workspace tour-operations/frontend                # http://localhost:3101
npm run dev --workspace ai-travel/frontend                      # http://localhost:3102
```
Demo sign-ins are created locally with random passwords (`provision-demo-users`) and written to git-ignored `LOGINS.local.txt` files.

## Tests
- `dotnet test Sanpu.slnx` — unit + SQL integration tests
- `./scripts/e2e.ps1 -Server '<your SQL instance>'` — Playwright end-to-end, screenshots, responsive audit, Postman/Newman
- `./scripts/payment-check.ps1`, `./scripts/coupon-check.ps1` — payment and coupon rules end to end

## Notes
- Payments use the ECPay (綠界) staging sandbox when configured, otherwise a simulated provider. No real money is involved.
- Photos are from Wikimedia Commons under their licenses; see `/credits` in the apps.
