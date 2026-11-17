# Ask the copilot (NL search)

App B · AI Operations Copilot

![Ask the copilot (NL search)](../assets/b-search.png)

| | |
|---|---|
| **Route** | `/admin/search` |
| **Permission** | Ai.Search |
| **Shown as** | `ops.agent@demo.sanpu.test` (fictional demo account) |
| **Area** | Admin |

## Purpose
Model turns the question into a fixed JSON filter (schema-checked); the DB runs it with row scoping

## Fields and validation
| Field | Type | Rules (client hint + server validation + SQL constraint) |
|---|---|---|
| Question | textarea | required · max 500 · injection filter |

## Actions
- **Ask**

## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `POST /api/v1/aiops/search → {interpretation, results[], sources[], usedModel}`

## Stored procedures
- `usp_Search_Trips (only rows the caller may see; the model never writes SQL)`
- `usp_Search_Vocabulary`
- `usp_AiUsage_Write`

## Rules, audit and security effects
- Model turns the question into a fixed JSON filter (schema-checked); the DB runs it with row scoping
- Fallback: keyword parser when AI is unavailable

## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- `G02` staff copilot search is interpreted into a validated filter

## Presenter script (30 seconds)
Signed in as ops.agent, open **Ask the copilot (NL search)**. Click **Ask** and point out that everything on screen comes from SQL Server through `POST /api/v1/aiops/search`. Mention the permission (Ai.Search) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
