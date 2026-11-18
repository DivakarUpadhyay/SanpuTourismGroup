# Payments & transactions

App A · Sanpu Travel

![Payments & transactions](../assets/a-payments.png)

| | |
|---|---|
| **Route** | `/admin/payments` |
| **Permission** |  |
| **Shown as** | `admin@demo.sanpu.test` (fictional demo account) |
| **Area** | Admin |

## Purpose
Every deposit, balance and full payment for tours and travel services with the payment gateway's result (Paid, Pending, Failed), method and reference. Totals at the top; Excel and PDF download.



## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `GET /api/v1/ops/payments?status&orderType&search&page`

## Stored procedures
- `usp_Payment_ListAll`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- Covered by the screenshot run (`tests/e2e/screens.spec.ts`) and manual checklist; no dedicated functional test yet.

## Presenter script (30 seconds)
Signed in as admin, open **Payments & transactions**. and point out that everything on screen comes from SQL Server through `GET /api/v1/ops/payments?status&orderType&search&page`. Mention the permission () is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
