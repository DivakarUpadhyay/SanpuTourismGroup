# My trips (traveler home)

App B · Sanpu AI Travel

![My trips (traveler home)](../assets/b-home.png)

| | |
|---|---|
| **Route** | `/my/trips` |
| **Permission** | Trip.ViewOwn |
| **Shown as** | `traveler.chen@demo.sanpu.test` (fictional demo account) |
| **Area** | Customer |

## Purpose
Energetic, with big ambitions


## Actions
- **Plan a new trip**
- **Open trip**

## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `GET /api/v1/my/trips`

## Stored procedures
- `usp_Trip_ListForTraveler`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- `F01` plan a trip: itinerary built from the DB template, mobility rules applied

## Presenter script (30 seconds)
Signed in as traveler.chen, open **My trips (traveler home)**. Click **Plan a new trip** and point out that everything on screen comes from SQL Server through `GET /api/v1/my/trips`. Mention the permission (Trip.ViewOwn) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
