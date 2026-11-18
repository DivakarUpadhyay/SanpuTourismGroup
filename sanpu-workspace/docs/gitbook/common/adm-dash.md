# Admin dashboard

App A · Sanpu Travel (the same screen exists in both apps)

![Admin dashboard](../assets/adm-dash.png)

| | |
|---|---|
| **Route** | `/admin/system` |
| **Permission** | Admin.Dashboard.View |
| **Shown as** | `admin@demo.sanpu.test` (fictional demo account) |
| **Area** | Admin |

## Purpose
OVERVIEW



## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `GET /api/v1/admin/dashboard`

## Stored procedures
- `usp_Admin_Dashboard (real COUNT/SUM aggregates)`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- Covered by the screenshot run (`tests/e2e/screens.spec.ts`) and manual checklist; no dedicated functional test yet.

## Presenter script (30 seconds)
Signed in as admin, open **Admin dashboard**. and point out that everything on screen comes from SQL Server through `GET /api/v1/admin/dashboard`. Mention the permission (Admin.Dashboard.View) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
