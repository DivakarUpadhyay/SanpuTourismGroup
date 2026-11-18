# Hotel / flight / bus / taxi detail

App A · Sanpu Travel

![Hotel / flight / bus / taxi detail](../assets/a-service.png)

| | |
|---|---|
| **Route** | `/services/lakeside-hotel-lake-view-twin` |
| **Permission** |  |
| **Shown as** | anonymous visitor |
| **Area** | Customer |

## Purpose
Description, facts, photo gallery, 45-day price and availability calendar, similar options and the booking button.



## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `GET /api/v1/travel/services/{slug-or-code}?from`

## Stored procedures
- `usp_Services_Get (slug or code, up to 150 characters)`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- Covered by the screenshot run (`tests/e2e/screens.spec.ts`) and manual checklist; no dedicated functional test yet.

## Presenter script (30 seconds)
As an anonymous visitor, open **Hotel / flight / bus / taxi detail**. and point out that everything on screen comes from SQL Server through `GET /api/v1/travel/services/{slug-or-code}?from`. Mention the permission () is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
