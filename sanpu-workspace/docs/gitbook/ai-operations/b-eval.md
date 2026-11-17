# Evaluation suite

App B · AI Operations Copilot

![Evaluation suite](../assets/b-eval.png)

| | |
|---|---|
| **Route** | `/admin/evals` |
| **Permission** | Ai.Eval.Run |
| **Shown as** | `ai.engineer@demo.sanpu.test` (fictional demo account) |
| **Area** | Admin |

## Purpose
QUALITY


## Actions
- **Run suite**
- **Add human feedback**

## API (Swagger: `/swagger`, tag in the OpenAPI document)
- `POST /api/v1/aiops/evals/run`
- `GET /api/v1/aiops/evals`
- `POST /api/v1/aiops/evals/results/{id}/feedback`

## Stored procedures
- `usp_Eval_Cases`
- `usp_Eval_SaveRun`
- `usp_Eval_Runs`
- `usp_Eval_Feedback`


## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
- `H02` evaluation suite passes all curated cases

## Presenter script (30 seconds)
Signed in as ai.engineer, open **Evaluation suite**. Click **Run suite** and point out that everything on screen comes from SQL Server through `POST /api/v1/aiops/evals/run`. Mention the permission (Ai.Eval.Run) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.
