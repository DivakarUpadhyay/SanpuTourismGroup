# Workflows

Every workflow follows the same path through the layers:
**Next.js page → `/api/v1` controller (policy check) → Application use case (validation) → repository interface → Infrastructure Dapper → stored procedure (transaction) → SQL Server → audit row → response.**

## W1 · Admin onboarding (both apps)

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Next.js /admin/users
  participant API as UsersController
  participant DB as SQL Server
  actor NewUser
  Admin->>UI: Invite user (email, name, roles)
  UI->>API: POST /api/v1/admin/users/invite
  API->>API: Admin.Users.Edit? roles ⊆ caller's grantable roles?
  API->>DB: usp_Admin_Users_Create (user + roles + invitation hash, 1 transaction)
  DB-->>API: UserId (409 duplicate_email)
  API->>DB: usp_Audit_Write User.Invited
  API-->>UI: 201 + one-time invite link (dev outbox mode)
  NewUser->>UI: /accept-invitation?token=…
  UI->>API: POST /api/v1/auth/accept-invitation (name, password)
  API->>DB: usp_Auth_AcceptInvitation (hash password, verify email, mark accepted)
  NewUser->>API: POST /auth/login → JWT (10 min) + refresh cookie
  NewUser->>API: GET /navigation/me
  API->>DB: usp_Navigation_ForUser → menus where ANY required permission is held
  API-->>UI: nested menu tree (sidebar)
```

## W2 · Admin configuration and revocation

```mermaid
flowchart LR
  A[Admin edits role grants] --> B{Admin.Roles.Edit and<br/>only grants it holds?}
  B -- no --> X[403 + audit]
  B -- yes --> C[usp_Admin_Roles_SetPermissions<br/>transaction]
  C --> D[PermissionVersion++ for every member]
  D --> E[Audit Role.PermissionsChanged]
  E --> F[Member's next request: cache key changes,<br/>new permission set loaded]
  F --> G[Removed page: menu gone + API 403<br/>even if the old UI is still open]
```

## W3 · ERP booking (app A)

```mermaid
flowchart TD
  S[Customer searches tours<br/>usp_Catalog_SearchTours] --> H[Hold seats<br/>usp_Booking_CreateHold<br/>UPDLOCK HOLDLOCK + idempotency key]
  H -- no seats --> E1[409 insufficient_capacity]
  H --> B[Confirm booking<br/>usp_Booking_CreateFromHold<br/>Status Pending, starts the workflow]
  B --> W[ApprovalRequest from the active WorkflowDefinition<br/>step = first matching condition]
  W --> I[Approval inbox: role from WorkflowSteps]
  I -- approve --> C[usp_Booking_Decide: Confirmed, seats sold<br/>history + audit]
  I -- reject --> R[Rejected: held seats returned]
  C --> P[Record payment SIMULATED]
  C --> X[Cancel: seats returned<br/>refund above threshold → 2-step refund workflow]
  P --> Q[Supplier webhook allotment/statement<br/>HMAC + idempotency → IntegrationEvents]
  Q --> RC[Monthly reconciliation<br/>our DepartureCosts vs SupplierStatements]
  RC -- mismatch --> T[StaffTask exception with SLA]
```

## W4 · Group assembly and profitability (app A)

1. Pick a departure. `usp_GroupSim_Inputs` loads pax, revenue, vehicle types and the cost assumptions.
2. Domain `GroupPlanner` lists vehicle combinations that seat everyone and prices each one (vehicle days, guide, meals, hotel). It returns the plans sorted by margin.
3. The result is saved as a `Draft` GroupPlan with its inputs and outputs, so the numbers can be reproduced.
4. Submit opens an approval request (workflow `groupplan.approval`), and another user approves it. Self-approval is blocked.

## W5 · AI disruption recovery (app B)

```mermaid
sequenceDiagram
  actor Ops as Ops agent
  participant API
  participant Dom as Domain engine
  participant AI as IAiProvider
  participant DB
  actor Rev as Reviewer
  Ops->>API: POST /simulations {tripId, scenarioId}
  API->>DB: usp_Sim_Inputs (items, places, constraints, scenario)
  API->>Dom: DisruptionSimulator → impacted items via dependency graph
  Dom->>Dom: RecoveryPlanner → feasible replacements (indoor, open hours, mobility, budget)
  API->>AI: explain + rank (scoped JSON only, no PII, schema enforced, timeout)
  AI-->>API: JSON or failure → deterministic explanation, banner "AI unavailable"
  API->>API: validate: schema ✓, item keys exist ✓, constraints re-checked ✓
  API->>DB: usp_Proposal_Save (PendingReview) + AiUsageLogs
  Rev->>API: POST /proposals/{id}/approve (not the proposer)
  API->>DB: usp_Proposal_Decide → new ItineraryVersion + audit (transaction)
```

## W6 · Copilot search (app B)

Question → injection screen (rejects "ignore previous instructions" style text and logs it) → model or keyword parser turns it into a **fixed JSON filter** (region, supplier, month, mobility, status) → `usp_Search_Trips` runs with the caller's scope (a traveler only sees their own trips, staff need `Trip.View`) → results come back with their sources. The model never writes SQL and never sees rows the caller cannot see.

## W7 · Document intake (app B)

Upload (size, extension and magic bytes checked, stored under a random name outside the web root) → redact PII (phone, passport, email) → extract fields (regex rules, then AI if it is available) with confidence and source span → review queue → a reviewer edits or accepts the fields and links the trip → audit. A booking or itinerary never changes without that review.
