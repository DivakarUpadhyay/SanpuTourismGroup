# Operations dashboard

App A · Sanpu Travel

![Operations dashboard](../assets/a-dash.png)

| | |
|---|---|
| **Route** | `/admin` |
| **Permission** | Ops.Dashboard.View |
| **Shown as** | `ops.manager@demo.sanpu.test` (fictional demo account) |
| **Area** | Admin |

## Purpose
OPERATIONS


## Actions
- **Open approvals**
- **Open tasks**

## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `GET /api/v1/ops/dashboard`

## Stored procedures
- `usp_Ops_Dashboard`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- `A01` sign-in success, wrong password and field validation

## Presenter script (30 seconds)
Signed in as ops.manager, open **Operations dashboard**. Click **Open approvals** and point out that everything on screen comes from SQL Server through `GET /api/v1/ops/dashboard`. Mention the permission (Ops.Dashboard.View) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
