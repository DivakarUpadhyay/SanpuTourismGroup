# SANPU — Master Claude Code Implementation Skill (Database-Driven Administration)

## Mission
Build TWO separate, production-pattern demo applications in one autonomous implementation campaign:
1. **AI Travel Digital Twin & Trip Recovery**: itinerary generation, dependencies, disruption simulations, recovery suggestions, approval, audit.
2. **Tour Booking & Operations**: tours, departures, inventory, reservations, approvals, group assembly, profitability simulations, audit.

Use **Next.js/TypeScript**, **ASP.NET Core C# REST APIs**, **Clean Architecture modular monolith**, **SQL Server**, **Dapper + stored procedures**, **Playwright**, **xUnit**, and **GitHub Actions**. Each project has its own admin and customer portals, and its own database, but both use the SAME shared admin schema and implementation patterns. Do not create a production shared database that couples both applications. Put reusable code in a shared library or template, not a cross-application runtime dependency.

## Non-negotiable rule: database-driven
No hardcoded menus, roles, permissions, users, business settings, tour catalogs, inventory, pricing, statuses, approval rules, itinerary templates, supplier details, or business decision results in frontend or backend source. These must be loaded from SQL Server via parameterized Dapper calls to stored procedures. Stable code-level constants (e.g. permission keys used as authorization requirements), API routes, validation rules, SQL schema names, and enum-like technical states are permitted where essential, but all mutable business configuration and displayed menu metadata must come from the database. No fake success or hardcoded demo API responses. Seed realistic fictional demo data into SQL scripts; never misrepresent seed data as live supplier data. Secrets (JWT signing keys, connection strings, API keys) must come from environment variables or a secrets manager, never the settings table or source control.

## Central admin schema — five primary tables
Use the following canonical table names, with sensible SQL types, PKs, FK constraints, indexes, uniqueness, UTC timestamps, CreatedBy/UpdatedBy, and RowVersion concurrency columns as appropriate:

1. **dbo.AppSettings**: SettingId, SettingKey UNIQUE, SettingValue (NVARCHAR(MAX)), ValueType, Category, Description, IsPublic, IsEditable, IsActive, UpdatedAtUtc, UpdatedBy, RowVersion. Support JSON values with schema validation and typed parsing. Never expose nonpublic values through public endpoints. Use a scoped cache with invalidation on changes.
2. **dbo.Menus**: MenuId, ParentMenuId NULL FK self, MenuKey UNIQUE, Title, RoutePath NULL, IconKey NULL, SortOrder, IsVisible, IsActive, IsExternal, ApplicationArea (Admin/Customer), CreatedAtUtc, UpdatedAtUtc, RowVersion. Enforce acyclic parent tree and route uniqueness where appropriate; prevent deletion of a menu with dependent children unless explicitly handled.
3. **dbo.Roles**: RoleId, RoleKey UNIQUE, RoleName, Description, IsSystem, IsActive, CreatedAtUtc, UpdatedAtUtc, RowVersion.
4. **dbo.Permissions**: PermissionId, PermissionKey UNIQUE (e.g. Booking.View), ModuleKey, ActionKey, Description, IsActive, CreatedAtUtc. Permissions represent API/business capabilities, NOT menu visibility alone.
5. **dbo.Users**: UserId UNIQUEIDENTIFIER PK, Email normalized UNIQUE, DisplayName, PasswordHash, PasswordHashAlgorithm, IsActive, IsLocked, FailedLoginCount, LockoutEndUtc NULL, EmailVerifiedAtUtc NULL, MustChangePassword, SecurityStamp, PermissionVersion, CreatedAtUtc, UpdatedAtUtc, LastLoginAtUtc NULL, RowVersion. Store only password hashes using ASP.NET Core PasswordHasher or Argon2id, never reversible passwords.

## Required relational/security supporting tables
The five primary tables alone cannot express many-to-many relationships securely. Create:
- **dbo.UserRoles** (UserId, RoleId, AssignedAtUtc, AssignedBy), composite PK, FKs.
- **dbo.RolePermissions** (RoleId, PermissionId, GrantedAtUtc, GrantedBy), composite PK, FKs.
- **dbo.MenuPermissions** (MenuId, PermissionId), composite PK, FKs. Define and test whether ANY required permission permits visibility; default to ANY for menu discovery and enforce actual actions in API.
- **dbo.RefreshTokens**: token ID, UserId, hashed token, expiry, revoked timestamp, replacement token ID, device/session metadata; rotate on refresh, detect reuse and revoke token family.
- **dbo.AuditLogs**: immutable event records of admin changes, authentication events, booking decisions and simulation approvals; redact sensitive values.
- **dbo.UserInvitations**: hashed one-time invite token, UserId, expiry, accepted timestamp, invited by; invitation emails optional when SMTP is not configured, with local test inbox support.
- **dbo.UserSessions** optional for session revocation and device tracking.

## First-time bootstrap
Use an idempotent migration/seed procedure. Create the first admin through a one-time CLI bootstrap that reads initial email/password from secure runtime input or environment; never ship a known default password. Insert foundational role and permission catalog with SQL migrations; all subsequent administration occurs via protected admin UI. Seed representative menu trees and application configuration in the DB. System roles and critical permissions may be protected against deletion. Do not allow removal of the last active system administrator.

## Admin pages — BOTH applications
Create separate protected `/admin` layouts for each application, including:
- Dashboard with genuine database aggregates.
- **Settings Management**: grouped key/value editor, typed validation, visibility controls, audit history, safe cache invalidation.
- **Menu Tree Management**: parent-child tree, drag/reorder or explicit sort controls, icon, route, area, activation, permission mapping, cycle prevention, preview by role.
- **Role Management**: CRUD, active/system status, assign permissions using module/action matrix, preview effective permissions.
- **Permission Management**: searchable catalog and safe administration; prevent dangerous mutation of built-in permission keys without migration.
- **User Management & Onboarding**: invite/create user, assign multiple roles, activate/deactivate, lock/unlock, force password reset, revoke sessions, view audit. Users set their own password using expiring one-time token; admins cannot read passwords.
- **Audit Viewer**: filter actor, entity, action, timestamp; access restricted to authorized roles.
- **Project-specific modules**: Project 1 manages itinerary templates, travel constraints, AI model configuration (non-secret only), disruption scenarios, recovery proposals and approvals. Project 2 manages tours, departures, capacity, suppliers, bookings, refunds/cancellations, group assembly, cost assumptions, profitability simulations, approvals.

Create responsive customer-facing login, account profile, password reset, and role-authorized customer pages for both applications. Support a 403 page and robust loading/error/empty states.

## Authentication and authorization
- Login: `POST /api/auth/login` verifies password hash, account status, lockout, and email verification policy; returns short-lived signed JWT with minimal claims and issues an opaque rotating refresh token.
- Prefer HttpOnly Secure SameSite cookies for refresh tokens; define CSRF defenses where cookies authenticate requests. Do not persist JWTs in localStorage. Use HTTPS in deployment, with secure cookie handling across frontend/API origins.
- Implement `POST /api/auth/refresh`, `/logout`, `/forgot-password`, `/reset-password`, `/accept-invitation`, `GET /api/auth/me`, and `GET /api/navigation/me`.
- On login and each protected request, validate JWT issuer/audience/signature/expiry, account active state and permission/security version (or reliable short TTL + immediate server-side revocation strategy). Resolve effective permissions from UserRoles -> RolePermissions -> Permissions; cache safely with invalidation.
- Implement ASP.NET Core policy-based authorization on every protected API; server is the authority, frontend menu visibility is UX only. Deny by default. Enforce least privilege and prevent privilege escalation and IDOR.
- `GET /api/navigation/me` builds a nested tree from active Menus and MenuPermissions based on effective permissions, with active ancestors included when appropriate. Admin route and action permission checks must also occur server-side.
- Add rate limiting, lockouts, input validation, logging, safe error handling, password policy, session revocation and audit trails.

## Stored procedures & Dapper
All mutable business data access must use stored procedures through parameterized Dapper. Implement migrations, indexes, FK constraints, transactions and appropriate isolation/concurrency for booking capacity. Create and test procedures such as:
- `usp_Auth_GetUserByEmail`, `usp_Auth_GetUserPermissions`, `usp_Auth_RotateRefreshToken`, `usp_Auth_RevokeSessions`.
- `usp_Admin_Users_List`, `usp_Admin_Users_Create`, `usp_Admin_Users_UpdateStatus`, `usp_Admin_Users_AssignRoles`.
- `usp_Admin_Roles_List`, `usp_Admin_Roles_Upsert`, `usp_Admin_Roles_SetPermissions`.
- `usp_Admin_Permissions_List`, `usp_Admin_Menus_GetTree`, `usp_Admin_Menus_Upsert`, `usp_Admin_Menus_SetPermissions`.
- `usp_Admin_Settings_Get`, `usp_Admin_Settings_Upsert`, `usp_Audit_Search`.
- Project-specific stored procedures for tours, itinerary versions, bookings, group simulations, cost inputs, recovery proposals and approvals.
Do not dynamically concatenate user input into SQL. Use explicit SQL transactions for multi-step changes, especially onboarding, bookings and approval actions.

## End-to-end workflows to implement
**Admin onboarding:** authenticated authorized admin -> create/invite user -> stored procedure persists user and invitation -> admin assigns roles -> role permissions determine access -> invite acceptance sets password -> user logs in -> JWT + refresh -> `/navigation/me` returns permitted menu tree -> authorized page/API -> audit log.

**Admin configuration:** admin edits AppSettings/Menus/Roles/Permissions -> API policy checks -> validation -> stored procedures in transaction -> audit + permission/security version bump and cache invalidation -> next user request sees updated access; API access is enforced even if UI state is stale.

**Project 1:** user preferences from DB -> generate itinerary through real configured LLM provider when available -> validate structured output and verified facts -> store itinerary/version -> simulate disruption with scenario data -> deterministic feasibility and constraints -> propose recovery -> explicit approval -> persist revised itinerary and audit.

**Project 2:** search tours/departures from DB -> reserve capacity atomically -> create booking -> approve/reject by authorized staff -> adjust capacity and statuses transactionally -> simulate group assembly and vehicle/cost allocation -> compare projected profitability -> require approval before changes -> audit. Never invent live prices, availability, supplier status, or payment confirmations.

## AI and optimization boundaries
Use a provider abstraction, environment-provided API key, structured JSON schema outputs, timeouts/retries, token usage/cost logging, and prompt-injection defenses. AI may recommend but cannot silently authorize payments, booking changes, or operational commitments. Where no provider key exists, show an explicit 'AI unavailable' state; deterministic scenario simulation can still run from DB data. All business outcomes and approval decisions must be reproducible and auditable.

## Required repo structure
```
sanpu-workspace/
  README.md
  docs/architecture.md
  docs/database-erd.md
  docs/api-contracts.md
  docs/demo-script.md
  docs/verification-report.md
  shared/                  # reusable source, no shared production DB
  ai-travel/
    backend/src/{Api,Application,Domain,Infrastructure}/
    backend/tests/{Unit,Integration}/
    frontend/{app,components,lib,tests}/
    database/{migrations,procedures,seeds}/
    playwright.config.ts
  tour-operations/
    backend/src/{Api,Application,Domain,Infrastructure}/
    backend/tests/{Unit,Integration}/
    frontend/{app,components,lib,tests}/
    database/{migrations,procedures,seeds}/
    playwright.config.ts
  .github/workflows/
```
Use actual valid project names and folder layouts compatible with dotnet and Next.js tooling rather than treating braces as literal directory names.

## Testing — mandatory, real execution
- Backend xUnit unit tests for permission resolution, menu tree cycles, auth, trip constraints, booking capacity, profitability math, concurrency.
- SQL Server integration tests with a real ephemeral SQL Server instance/container when infrastructure permits; test stored procedures, uniqueness, FK integrity, transactional rollbacks, concurrent booking and role changes.
- Playwright E2E tests for BOTH apps: login success/failure, refresh/logout, admin user invite/onboarding, role assignment, permission changes, menu visibility, direct unauthorized API 403, settings edit, menu tree CRUD, password reset, itinerary simulation and approval, booking create/approve/cancel, group simulation, accessibility/responsive smoke checks.
- Playwright must exercise real Next.js pages and the real API/SQL Server. No mocked API success in acceptance E2E tests. Test data is seeded in SQL and isolated per run; use test-only accounts provisioned securely and never production credentials.
- Record actual commands, pass/fail counts, screenshots/traces for failures, environment dependencies, and unverified items in `docs/verification-report.md`. Fix failures and rerun. Never claim a test passed if it was not executed.

## Deployment
Frontend: Vercel or Cloudflare-compatible Next.js deployment. Backend: separate ASP.NET Core-capable host. Database: reachable SQL Server instance with TLS and restricted network access; local MSSQL for development, hosted SQL Server for public demo. Environment-specific CORS, cookie domains, HTTPS, secure headers, secret injection, migrations, CI/CD. Do not expose SQL Server directly to browsers. Document Cloudflare Next.js runtime limitations and choose compatible deployment mode.

## Autonomous build instructions — one user prompt
Execute all phases without repeatedly requesting confirmation, unless credentials, destructive operations, external service signup, or infrastructure decisions require user input. Phase order: (1) repo/architecture; (2) migrations and admin tables; (3) bootstrap and auth; (4) admin APIs/UI; (5) project 2 vertical slice; (6) project 1 vertical slice; (7) complete project modules; (8) Playwright/xUnit/integration tests; (9) fix/retest; (10) documentation/deployment instructions. Run code generation, builds and tests as you go. Do not stop after scaffolding. Maintain `docs/progress.md` with completed/incomplete tasks. If tool context or runtime limits prevent completion, leave the repo runnable, clearly report what is unfinished, and provide the exact continuation command. Do not silently omit functionality or falsely claim production readiness.

## Acceptance criteria
Both apps must have real SQL Server-backed admin/customer login, secure JWT/refresh flow, admin user onboarding, roles and permissions, dynamic menu tree, settings management, protected APIs, auditable workflows, complete UI-to-DB paths, working representative project-specific flows, and actually executed Playwright and backend tests. All secrets externalized; no hardcoded business data or mock success responses. The finished README must explain exact local startup, migrations, secure bootstrap, test execution, and deployment steps.

## Single-shot Claude Code command
Read this entire Markdown skill and implement the complete two-project workspace according to all acceptance criteria. Work autonomously through schema, APIs, UIs, security, business workflows, tests, defect fixes and docs. Do not stop at scaffolding. Use real SQL Server stored procedures for all mutable business data. Execute Playwright and backend tests, report actual results, and document any incomplete tasks accurately.

## Mandatory Clean Architecture + Dapper Enforcement (Final Override)
- Use ASP.NET Core Clean Architecture with four projects per backend: Domain, Application, Infrastructure, API. Separate deployments/databases for AI Travel Planner and Booking Operations; shared reusable source patterns or libraries must not couple business data.
- Domain contains entities, value objects, domain events and pure business rules, with no external package dependencies.
- Application contains use-case command/query handlers, DTOs, validation, interfaces (repositories, transactions, clock, current user), and authorization policies. It must not reference Infrastructure, Dapper, SqlClient, EF Core, or ASP.NET controllers.
- Infrastructure implements Application interfaces using Dapper + Microsoft.Data.SqlClient; use parameterized SQL Server stored procedures with CommandType.StoredProcedure for all application data operations, async calls, cancellation tokens, explicit transactions for multi-step writes, proper disposal and bounded command timeouts.
- API contains thin controllers, DI, authentication/authorization middleware, input contracts, versioned endpoints, and standardized error handling; no SQL in API/controllers.
- Do not install or use Entity Framework Core, DbContext, migrations via EF, or repositories that return IQueryable. Maintain versioned idempotent SQL scripts for tables, constraints, indexes, stored procedures, and approved demo seed data.
- Primary administration tables: AppSettings, Menus (ParentMenuId, SortOrder, RouteKey, IsActive), Roles, Permissions, Users. Required junction/support tables: UserRoles, RolePermissions, MenuPermissions, RefreshTokens, UserInvitations, AuditLogs. Use foreign keys, unique constraints, concurrency control, and indexes. A single Settings table is sufficient for nonsecret app configuration; JWT signing keys and credentials belong in secret storage, never database plaintext.
- Admin portal must support settings CRUD with validation, hierarchical menu CRUD and ordering, role/permission management, invitation/onboarding, user activation/deactivation, audit logs and scoped admin access. Customer and admin portals must obtain menus and allowed actions via authenticated API calls; do not hardcode menu lists or permission assignments in Next.js. Route definitions and system-required permission codes can be declared in code as technical contracts, but all enabled menu records, grants, user assignments, prices, inventory and business configuration must be read from SQL Server.
- JWT: short-lived access tokens; securely stored hashed rotating refresh tokens; login/logout/refresh/revoke; password hashing via vetted library; backend authorization on every protected action; revoke or revalidate access after permission changes. Avoid storing access tokens in localStorage when secure cookie/BFF patterns are practical; protect cookies against CSRF.
- Each workflow must be complete: Next.js -> API -> Application use case -> repository interface -> Infrastructure Dapper -> SQL Server stored procedure -> database -> response. Build both read and write examples with validation, transaction boundaries and failure paths.
- Testing: xUnit unit tests for domain/application; SQL Server integration tests against a disposable isolated test database; Playwright end-to-end tests for login, invalid login, token refresh/logout, admin onboarding, role changes, permission denial, menu tree updates, settings changes, tour booking, AI itinerary and disruption recovery, and group optimization. Test both UI and direct API privilege escalation. Run tests and report real pass/fail counts, environment blockers and evidence; never claim unrun tests passed.
- Generation instruction: implement all files, SQL scripts, UI pages, API routes, configuration templates, README, Docker Compose for local SQL Server/API where feasible, CI workflow and tests in one autonomous campaign. Work in verified vertical slices, execute builds/tests after each slice, repair defects, and provide a precise continuation checkpoint if context/time/tool limits interrupt the run. Never invent secrets or simulate real external data without explicit labeling.

---
# SANPU JOB-DESCRIPTION ALIGNMENT ADDENDUM (2026-11-17)

## Product positioning and interview integrity
The job emphasizes **internal cross-platform operating systems and digital transformation**, not only consumer booking. Position Project A as **Tourism Enterprise Operations ERP (non-AI full-stack)** and Project B as **AI Tourism Operations Copilot (AI-related)**. Preserve existing booking, group optimization, itinerary, and trip recovery features as modules. Present these as new portfolio prototypes, not as past production deployments; describe genuine past experience separately. Build a credible 20-minute demo per project, with optional 60-minute technical deep dives. The calendar invite may be only 30 minutes; prepare a 12-minute fallback per project.

## Mandatory Project A modules (internal ERP)
- Reservation operations: lifecycle, inventory holds with expiration, concurrency-safe capacity, refunds/cancellations, group assembly and cost/profitability simulations.
- Supplier and OTA integration: adapter interfaces, idempotent webhook ingestion, retry/backoff, deduplication, reconciliation, correlation IDs, rate limits and versioned API contracts. Provide a clearly labeled local mock supplier and contract tests; never claim a live OTA connection without credentials.
- Approval workflow engine: database-configured workflow definitions, states, steps, approver roles, escalation rules, delegation and immutable approval history. No hardcoded approval routing.
- Employee operations: task queues, ownership, SLAs, exception handling, notifications and operational dashboards with real SQL aggregates.
- Finance operations: booking payment state, settlement and supplier reconciliation; simulated payment providers only until approved credentials exist; avoid storing card details.
- Requirements-to-delivery artifacts: user personas, stakeholder interview questions, as-is/to-be workflow, user stories, acceptance criteria, traceability matrix and architecture decision records.
- Admin: settings, menus, roles, permissions, users, onboarding, workflow designer, supplier connections, integration jobs, data-retention policies, audit viewer, and operational alerts.

## Mandatory Project B modules (AI operations copilot)
- Natural-language search over authorized booking, supplier and itinerary data using safe, permission-filtered retrieval. Enforce row-level scoping before sending any data to the model.
- Document intake: ingest redacted itinerary/supplier documents, extract structured fields, confidence scores, human review and provenance; prohibit unreviewed changes to bookings.
- AI trip disruption simulation and recovery proposals, group preference constraints, cost impact, explainable suggestions, approval and audit. Ground operational decisions in deterministic rules and verified supplier data.
- Prompt-injection defenses, strict JSON schema validation, timeouts, token/cost budgets, fallback when model unavailable, PII minimization, no secrets in prompts, configurable model settings in AppSettings (credentials in secret store).
- Evaluation suite: curated fictional scenarios, accuracy/grounding metrics, permission-leak tests, hallucination checks, reproducible prompt/version records and human feedback.
- Admin: AI configuration, prompt templates/versioning, scenario rules, document processing queue, evaluation dashboard, approval workflow, audit and cost monitoring.

## Security and personal-data processing (critical JD criterion)
- Identify and classify PII fields; encrypt sensitive PII at rest with application-layer envelope encryption or appropriate database encryption and managed keys, and enforce TLS in transit. Do not confuse hashing passwords with reversible PII encryption.
- Implement per-field masking in UI/API, least privilege, object-level authorization, audit trails without raw PII, configurable retention/deletion/export workflow, and test access revocation.
- Include threat model (STRIDE), OWASP ASVS-inspired checklist, secrets scanning, dependency scanning, SAST, security-focused integration and Playwright tests, and incident/runbook documentation.
- Include privacy notices and sample consent/retention workflows; note Taiwan personal-data obligations require actual legal review before production.

## Engineering practices explicitly required by job
- Git is source of truth. Include branch strategy, conventional commits, pull-request template, review checklist, CODEOWNERS example, and a sample reviewed PR narrative.
- GitHub Actions: restore/build, format/lint, unit tests, SQL integration tests using an ephemeral SQL Server service/container, Playwright browser tests, vulnerability/dependency scans, artifact upload, gated deploy and rollback documentation. Do not claim deployment if credentials are missing.
- Document API via OpenAPI, architecture via C4/sequence diagrams, ADRs, database migrations, operational runbooks and a short developer onboarding guide.
- Show AI-assisted development with human responsibility: record generated code review, verify business invariants, test security and performance, and never accept unverified model output.
- Include a legacy PHP interoperability demo: a small documented sample PHP client calling the ASP.NET Core API with proper auth, and a legacy data mapping/anti-corruption layer. Do not claim PHP production expertise; show code-reading and migration competence.
- Cloud: Next.js on Vercel/Cloudflare; ASP.NET Core on Azure App Service/AWS App Runner/compatible compute; SQL Server on Azure SQL/managed SQL Server or securely hosted SQL Server. Include environment-based configuration, migration/deploy strategy, health checks, telemetry, logs and monitoring. Do not place SQL Server credentials in browser code.

## Strict implementation priorities
1. Five canonical admin tables and mapping tables, database migrations, admin bootstrap, login, JWT, refresh, permission checks, dynamic menu tree, onboarding and audit.
2. Project A complete vertical slice: supplier/tour -> availability -> reservation -> approval -> reconciliation; include failure and concurrency cases.
3. Project B complete vertical slice: authorized data -> scenario -> AI proposal -> validation -> human approval -> audited change.
4. Documentation, CI/CD, security tests, Playwright E2E, API contract tests, cloud deployment manifests.
5. Additional features only after the above pass.

## Mandatory Playwright scenarios
- Admin invitation -> activation -> login -> permission-specific menu tree; role change -> revoked access; no privilege escalation by manually entering URL or calling API.
- Booking simultaneous final-seat contention; approval/rejection; supplier webhook duplicate/retry; cancellation and reconciliation.
- AI scenario simulation, proposal explanation, approval, prompt-injection attempt, cross-user data isolation, model outage fallback.
- Settings changes reflected without frontend rebuild; menu parent/child reordering; accessibility smoke tests; responsive admin/mobile; error and empty states.
- Run real tests against the running frontend/API/SQL Server. Never replace actual assertions with mocked success responses. Explicitly distinguish fixture data from live external integrations.

## Final Claude Code execution contract
Read this entire file, generate both projects in a monorepo using **Clean Architecture, ASP.NET Core, Dapper, stored procedures, SQL Server and Next.js**, without EF Core. Build runnable vertical slices before expanding features. Execute the complete automated test suite, fix verified failures, and produce a `DELIVERY_REPORT.md` with implemented features, test commands/results, uncovered limitations, configuration/secrets needed, deployment readiness and 20-minute demo scripts. Continue autonomously within available runtime, but do not claim one-shot completion when tools, time, credentials or infrastructure prevent it. Never invent supplier availability, AI results, successful tests or live integrations.

# FINAL OVERRIDE — Swagger, Postman, Validation, Security, Guardrails & SQL Seed Data

This section is mandatory and takes precedence over any weaker or ambiguous earlier requirement. Apply it independently to BOTH projects and BOTH admin panels. Do not skip these requirements to save time. Where runtime resources are insufficient, report incomplete work explicitly.

## 1. REST API documentation and interactive Swagger UI
- Use ASP.NET Core controllers with explicit DTO contracts, consistent versioned routes (`/api/v1/...`), proper HTTP methods, status codes, pagination, filtering, sorting, and cancellation tokens.
- Generate valid OpenAPI 3 documentation from actual routes and schemas; expose interactive Swagger UI at `/swagger` in local development and a protected staging environment. Never expose production API documentation publicly by default; configure access deliberately.
- Document every endpoint, including login, refresh, logout, users, roles, permissions, menus, settings, invitations, tours, bookings, approvals, suppliers, AI simulations, and audit logs.
- Document request/response schemas, sample payloads, field constraints, errors, auth scopes/permission codes, 401/403/404/409/422/429 responses where relevant, and operation summaries.
- Configure Swagger UI's JWT Bearer security scheme and Authorize flow so a developer can paste a valid access token and test protected endpoints. Do not embed sample valid JWTs or credentials in repository files.
- Export the generated OpenAPI spec to `artifacts/openapi/project-a.json` and `artifacts/openapi/project-b.json`; validate schema generation in CI. Avoid exposing secret fields in response schemas.

## 2. Postman interoperability
- Deliver `postman/Project-A.postman_collection.json` and `postman/Project-B.postman_collection.json`, generated or verified against OpenAPI; group requests by module and include positive/negative examples.
- Deliver separate environment templates (`local`, `staging`) with placeholders for `baseUrl`, `accessToken`, `refreshToken`, `testUserEmail`; never commit real secrets or tokens.
- Include scripts to capture a token from login only in a local Postman environment, then send `Authorization: Bearer {{accessToken}}`; use environment variables, not hardcoded hostnames.
- Add automated Postman/Newman smoke tests for login, authorized read, forbidden write, validation error, not-found, and one complete business workflow per project. Include CLI commands in README and CI. Token storage in Postman is for testing only, not a production browser-auth design.

## 3. End-to-end validation contract
- Validate on frontend for immediate user feedback AND independently on backend for trust. SQL constraints enforce final invariants; frontend validation is never a security boundary.
- Implement reusable application validators (e.g. FluentValidation or equivalent), DTO validation, normalization, type/length/format/range checks, required fields, date/timezone rules, cross-field rules, uniqueness and state-transition rules.
- Validate user invitations, email normalization, passwords, roles, menu trees (no cycles), settings value types, permission assignment, bookings (capacity, date, supplier availability), approvals, finance amounts/currency, uploaded files, AI proposals, and OTA/webhook payloads.
- Use parameterized Dapper calls to stored procedures only; stored procedures validate critical constraints and return stable error codes. Use transactions, unique/check/foreign-key constraints, rowversion/optimistic concurrency or locking for final-seat bookings, and idempotency keys for retried writes.
- Return standardized RFC 7807 ProblemDetails with field-level errors, safe messages, correlation IDs, and stable machine-readable error codes; never leak stack traces, SQL statements, or PII.
- For UI, cover inline errors, disabled/working states, retry-safe actions, server errors, expired sessions, accessibility labels, and confirmation before destructive operations.

## 4. End-to-end security baseline
- Threat-model both applications and document trust boundaries: browser, API, database, external supplier, AI provider, admin portal, and CI/CD.
- Use ASP.NET Core authentication and authorization with short-lived signed JWT access tokens; validate issuer, audience, signature, expiry, and clock skew. Use refresh-token rotation, hashing at rest, revocation, device/session tracking, and reuse detection. Do not store refresh tokens in localStorage; use Secure HttpOnly SameSite cookies when using cookie-based refresh, with CSRF protection appropriate to deployment topology.
- Enforce permission checks at API endpoint AND resource/tenant/object level. A hidden menu does not grant security. Apply default deny, least privilege, separation of duties, and immediate or bounded-time revocation with permission versioning/session invalidation.
- Implement safe admin bootstrap via environment-provided one-time setup or secure CLI; no default production admin passwords, no demo secrets in code, no public bootstrap endpoint after setup.
- Enforce HTTPS, strict CORS allowlist, CSP and security headers, rate limits and login throttling, account lockout/backoff, CSRF defenses where cookies are used, safe redirect rules, and output encoding. Avoid verbose auth errors and user enumeration.
- Encrypt classified PII at rest with managed keys; mask by permission, redact logs, control exports, audit reads/writes, and provide configurable retention. Never log passwords, tokens, full personal identifiers, or prompts containing unredacted sensitive data.
- Validate uploads by size, type/signature, content scanning when available, randomized storage names, and private access; reject unsafe file paths and untrusted URLs; protect outbound calls against SSRF.
- For AI: treat retrieved documents and prompts as untrusted; schema-validate model outputs; apply permission-scoped retrieval; prohibit model-executed SQL or autonomous privileged mutations; require human approval for booking/financial changes; log decisions without leaking sensitive inputs.
- Supply `SECURITY.md`, threat model, authorization matrix, security test cases, and incident response notes. Scan dependencies, secrets, and source code in CI.

## 5. Code generation guardrails — MUST be obeyed by Claude Code
- Before coding, produce an implementation plan, dependency graph, SQL schema, permission matrix, and acceptance tests. Implement in vertical slices; keep going autonomously only while tooling/resources permit.
- Never invent test results, cloud deployments, live OTA availability, supplier prices, or AI provider responses. Label simulations, test fixtures, and mocked adapters clearly.
- Never hardcode mutable business data, user accounts, roles, menu items, permissions, prices, destinations, workflow routes, prompt templates, feature toggles, or settings into UI/API source. Read them from SQL Server through application services. Immutable technical constants (route templates, HTTP status codes, claim names, validation codes, safe default limits) are permitted and should be documented.
- Do not use EF Core or DbContext. Use Clean Architecture dependency direction; SQL access only through Infrastructure Dapper repositories and stored procedures. No SQL concatenation with user input.
- Keep security-sensitive configuration in environment variables or a secret manager; database `AppSettings` may store non-secret configurable values and encrypted references, not plaintext secrets.
- Use secure defaults, explicit error handling, bounded retries, structured logging, cancellation/timeouts, deterministic database migrations, and versioned API contracts.
- After each feature, run formatting, compile, tests, security checks, and Playwright; fix failures before moving on. Never bypass tests by deleting assertions or disabling security.
- Add code-review checklist: authorization, input validation, SQL injection, XSS, CSRF, SSRF, secrets, PII exposure, transactionality, race conditions, tenant scoping, prompt injection, logging, performance, and accessibility.
- Generate `DELIVERY_REPORT.md` with real executed commands, passing/failing test counts, incomplete features, security exceptions, and exact local startup steps.

## 6. Database-owned fictional demo data and content
- All demo content must be inserted into SQL Server by idempotent, versioned seed scripts or seed stored procedures. Never ship application screens backed by inline arrays, hardcoded JSON fixture data, or fake static success responses.
- Create `database/Seeds/001_AdminCatalog.sql`, `002_TourismCatalog.sql`, `003_BookingsAndOperations.sql`, `004_AiScenarios.sql`, `005_Reporting.sql` (or equivalent), plus a documented seed runner and a reset script restricted to development/test.
- Seed the canonical `AppSettings`, `Menus`, `Roles`, `Permissions`, `Users` (only with secure test onboarding/password initialization), and mapping tables; include menu hierarchy, permissions for every UI action, feature flags, workflow definitions, and configurable labels.
- Seed realistic but entirely fictional tour destinations, packages, schedules, capacities, suppliers, booking customers, staff tasks, approvals, reconciliation records, simulated disruptions, AI prompts/templates, and evaluation scenarios. Label them `DEMO / FICTIONAL` in the database and UI; avoid real individuals' PII.
- Ensure stable deterministic seed identifiers (natural keys or explicit seed keys), idempotent upserts, foreign-key correctness, no duplicate records on rerun, and reproducible sample dates relative to a configurable demo reference date.
- Seed separate datasets for Project A and Project B with clear shared-schema conventions. Keep production seeds limited to essential reference/configuration data; load fictional records only in dev/test/demo environments.
- All user-visible copy that must be configurable (marketing text, notifications, email templates, labels) should be persisted in appropriate `ContentTemplates`, `NotificationTemplates`, or localization tables rather than forcing everything into one key/value settings table.
- Provide admin CRUD for managing seed-derived content and verify edits persist after refresh/restart. Never overwrite administrator edits during normal startup or production migration.

## 7. Required automated acceptance tests
- Swagger UI opens in development; both OpenAPI documents validate; JWT Authorize works; unauthenticated and unauthorized requests return correct statuses.
- Both Postman collections import cleanly; Newman runs documented smoke suites with correct environment placeholders and generated test credentials.
- Validation tests: missing/invalid fields, duplicate user, invalid menu parent/cycle, disallowed role escalation, booking overcapacity, conflicting approval, malformed supplier webhook, invalid AI output.
- Security tests: expired/forged JWT, refresh-token replay, revoked role, IDOR/tenant boundary, SQL injection payload, XSS content, CSRF where relevant, rate limiting, PII redaction, prompt injection, unauthorized admin API calls.
- Seed scripts can run twice without duplicates; database constraints hold; UI shows seeded records from API; admin edits survive reload; feature flags and menu changes appear without rebuilding Next.js.
- Playwright covers admin onboarding -> login -> menu tree -> CRUD -> permissions; booking approval; AI scenario proposal -> human approval; error states and responsive UI. Test actual browser/API/SQL integration, not static mock screens.
- Include local `docker compose` for SQL Server and other necessary dependencies where feasible, migration/seed commands, API/frontend startup commands, Swagger URL, Postman/Newman commands, and Playwright commands. Report any infrastructure-dependent test as not run, never as passed.

## 8. Final deliverables
- Runnable monorepo source for both projects, separate admin/customer UIs, migrations, stored procedures, seed scripts, Swagger UI, two OpenAPI JSON specs, two Postman collections + environment templates, backend unit/integration tests, Newman smoke tests, Playwright E2E suite, CI/CD workflow, security documentation, and `DELIVERY_REPORT.md`.
- Ensure a reviewer can start the database, apply migrations/seeds, launch both APIs/frontends, log in with securely provisioned demo accounts, inspect Swagger, import Postman collections, and execute end-to-end tests without manually editing application source.

---

# Mandatory Final Phase: GitBook Screen-by-Screen Documentation, Exhaustive Interaction Testing, and Code Quality

## Completion gate and execution order
This phase is mandatory for BOTH applications. Execute only after implementation, migrations, seed data, API verification, and core E2E tests. Sequence: inventory routes and controls -> create interaction coverage matrix -> implement and run tests -> fix issues -> rerun affected tests and regression suite -> capture verified screenshots -> write GitBook-ready documentation -> publish to GitBook only if access/credentials are available and authorized -> prepare interview demo. Never claim publication, execution, zero defects, or coverage that cannot be evidenced. If GitBook access is unavailable, generate complete GitBook-ready Markdown, images, navigation structure, and instructions for import; do not pretend it is live.

## Documentation deliverables
Create `/docs/gitbook/` with `README.md`, `SUMMARY.md`, `getting-started.md`, `architecture.md`, `security-and-roles.md`, `database-and-stored-procedures.md`, `api-swagger-postman.md`, `testing-and-evidence.md`, `troubleshooting.md`, `interview-20-minute.md`, `interview-60-minute.md`, plus `erp/` and `ai-operations/` folders. Document EVERY implemented screen in a separate page or a logically grouped page when screens are truly trivial; keep the navigation concise. Use relative links and screenshot files in `docs/gitbook/assets/`. Include actual screenshots from a running application (not invented images).

Each screen page MUST include: purpose, route/URL, roles and permissions, entry/navigation path, preconditions and required seed data, labeled screenshot, UI field specifications and validation rules, complete action/event inventory (including disabled/hidden behavior), happy path, alternative paths, empty/loading/error states, request/response API endpoints and Swagger operation references, relevant stored procedures and tables, audit/security effects, expected outcomes, Playwright test IDs, and a concise presenter script. Document cross-screen workflows end-to-end, including Admin creates user -> assigns roles -> configures menu -> user signs in -> sees permitted features; ERP booking -> approval -> supplier coordination -> reconciliation; AI disruption -> proposal -> human approval -> audited changes. Clearly mark mocked/simulated integrations and never present them as live.

Generate an interview presentation checklist with 20-minute and 60-minute variants PER project, and an exact click-by-click demo script with fallback screenshots and seed data reset instructions. Use GitBook-compatible Markdown, `SUMMARY.md` navigation, and clear page titles. Do not publish private tokens, real personal data, passwords, or production connection strings in docs or screenshots; use fictional seeded identities and redact secrets.

## Complete UI interaction inventory and Playwright testing
Automatically enumerate ALL frontend routes, rendered interactive components, and role-specific states. Produce `tests/interaction-matrix.csv` (or Markdown table) with columns: project, route, role, control/test ID, event, precondition, expected UI result, expected API/database side effect, negative/edge case, Playwright test path, last verified status. Every actionable control MUST have an accessible label and stable selector (prefer role/name; use `data-testid` where needed). Do not add decorative buttons or nonfunctional links.

Test every relevant click and event: navigation links, nested menus, login/logout, refresh and session expiry, user onboarding and invitations, role/permission changes, settings, create/read/update/delete, approve/reject, form submit/reset, required-field validation, input change/blur, select/radio/checkbox, modal open/close/escape, confirmation/cancel, search/filter/sort, pagination, tab changes, upload/download, export, keyboard accessibility, loading/empty/error states, retry, duplicate submission, optimistic/concurrent updates, network failure, and authorization denial. Validate UI behavior AND corresponding API response AND persisted database state for consequential actions. Ensure no cross-role privilege escalation. Include negative tests for SQL injection, XSS, CSRF as relevant to cookie-based flows, IDOR, token expiry/revocation, invalid payloads, overposting, file type/size limits, and race conditions. Test mobile/tablet/desktop breakpoints, focus states, basic accessibility and responsive overflow.

Use Playwright fixtures and isolated, deterministic test data, seeded through database scripts or controlled test APIs; do not depend on execution order. Capture traces, screenshots and videos on failure, with CI artifacts. Run against a dedicated test database and never mutate production. Mock external services only in explicitly labeled contract tests; use real local API/database integration for critical workflows. Test all meaningful controls rather than relying on superficial click-only checks. Track inventory coverage and list untested controls and reasons. Add visual regression snapshots at stable viewports with approved baselines, avoiding nondeterministic timestamps and animations. Check browser console errors, uncaught exceptions, failed network requests, and accessibility findings. Document environmental limitations and unresolved issues.

## Backend, database, and quality gates
Use xUnit unit tests for domain rules, application handlers, validators and authorization policy; integration tests against SQL Server and stored procedures for transactions, rollback, constraints, concurrency and error mapping; API contract tests against generated OpenAPI; Postman collection with environment templates and test assertions; and Playwright for UI E2E. Keep Swagger/OpenAPI and Postman synchronized with actual routes. CI must run lint/format/typecheck, build, unit tests, integration tests where infrastructure exists, Playwright, dependency/secret scanning, and publish test reports. Fail the build for failing required checks; never suppress exceptions or disable tests to create a green status.

## Design and code cleanliness guardrails
Aim for the smallest maintainable number of files, NOT a monolithic codebase or arbitrary file-count target. Use clear Clean Architecture boundaries: Domain, Application, Infrastructure (Dapper), API, and Next.js. Group files by cohesive feature and responsibility; reuse common UI components, validation schemas, API clients, permission checks, error handling, and styles. Do not create redundant abstractions, empty placeholder classes, duplicate DTOs, dead code, duplicate pages, unused packages, or premature microservices. Keep controllers thin; parameterize all stored procedure calls; use explicit transactions where needed; enforce server-side authorization and validation regardless of UI. Store mutable business configuration, menus, permissions, workflow definitions, templates, and fictional demo content in SQL Server; keep framework constants and safe technical configuration in code as appropriate. Secrets belong in a secrets manager/environment, not in tables or commits. Enforce consistent formatting, naming, TypeScript strictness, nullable reference types, meaningful logs, clean error messages, and responsive, accessible UI. Avoid unnecessary animations and decorative UI that complicate workflows.

## Acceptance criteria and final evidence
Before calling a project complete: (1) all required routes/screens exist and are connected; (2) all interactive controls are cataloged and covered by meaningful automated or explicitly documented manual checks; (3) core workflows pass end-to-end with real API + SQL Server; (4) role and permission restrictions are verified server-side; (5) Swagger loads and Postman collection executes; (6) lint/typecheck/build/unit/integration/Playwright/security checks pass in the available environment; (7) screenshots and GitBook-ready screen-by-screen docs match the verified build; (8) 20-minute and 60-minute interview scripts work using fictional seed data; (9) final report provides actual commands, pass/fail counts, environment, uncovered items, known issues and next steps. Never promise absolute zero bugs; fix all discovered blockers and disclose remaining limitations. If a prerequisite such as SQL Server, API keys, GitBook authorization or deployment access is missing, provide exact setup steps and classify checks as NOT RUN, not PASS.

## One-shot autonomous execution instruction
Read the entire master skill and complete both projects in dependency order. Do not stop at scaffolding. Implement, run, test, fix, and document incrementally, keeping a resumable progress ledger. Once verified, generate GitBook-ready documentation and the full interaction coverage matrix. Publish only when authorized GitBook integration is available. Produce a final delivery report with links/paths to apps, Swagger, Postman collections, Playwright reports, GitBook docs, screenshots and demo scripts. If context/time/tool limits interrupt the run, save a checkpoint and a precise next-step prompt rather than claiming completion.

---

# Mandatory Third-Party Services Policy: Free-First, Approval-Gated

## Non-negotiable policy
- Prefer **free and open-source local dependencies** first, then genuine free-tier hosted services. Do not assume any vendor's free tier is permanent or that usage is unlimited. Check current terms, quotas, commercial restrictions, data residency, and availability before selecting a hosted provider.
- **Never purchase, upgrade, activate a paid plan, or enable billable resources without explicit user approval.** No credit card, billing account, or trial that automatically converts to paid without explaining the risk and requesting consent.
- Before any service requiring account creation, API key, OAuth authorization, domain verification, billing activation, or external access: **STOP at that integration boundary and ask the user** for the required action. Explain the purpose, provider, free limits, data shared, exact setup steps, and what credential/permission is needed. Never request passwords or private keys in chat; instruct the user to configure secrets in local environment variables or a secure secrets manager.
- Do not block unrelated implementation while waiting. Build a provider interface and a clearly labeled **local simulator** or deterministic fixture; keep live integration status marked PENDING until credentials and verification exist. Simulated responses must never be described as live supplier availability, actual payments, real AI results, or production services.
- No account signups or key creation performed on the user's behalf without explicit authorization. Never commit `.env`, tokens, passwords, connection strings, or screenshots containing secrets.

## Recommended zero-cost development defaults (verify eligibility before hosted deployment)
| Need | Free-first default | When to ask user |
|---|---|---|
| SQL Server | SQL Server Developer Edition for non-production development/testing; SQL Server Express where its limits fit | Before provisioning a paid/hosted SQL Server; Developer Edition is not for production |
| API hosting | Run ASP.NET Core locally with HTTPS; optionally user-approved free-tier compatible host if available | Before account creation, deployment, or resource provisioning |
| Next.js hosting | Local dev; Vercel Hobby or Cloudflare free offering only if project and account usage comply with current terms | Before signup, connecting GitHub, deploying, or configuring domains; check commercial-use restrictions |
| Source control / CI | Git locally, GitHub Free and GitHub Actions within current free allowances | Before creating repositories or connecting accounts |
| API testing | Swagger/OpenAPI locally; Postman free plan or open-source alternatives such as Bruno/Newman where appropriate | Before Postman signup/sync or workspace access |
| E2E tests | Playwright locally and CI within free quotas | Before connecting external test dashboards |
| AI | Local deterministic demo engine; optional local open-source model if machine resources allow | Before any hosted LLM account/API key, including providers advertising free credits |
| Maps / geocoding | Static seeded location data and offline demos; optional free-tier map provider subject to attribution and usage terms | Before signup/API key or transmitting location data |
| Email | Local capture tool (Mailpit) for invitation/reset testing; no real messages | Before connecting transactional email provider or sending external email |
| File storage | Local dev storage with secure file validation | Before external object-storage account/key |
| Monitoring | Structured logs and local dashboards first | Before connecting hosted error monitoring or analytics |
| GitBook | Generate GitBook-ready Markdown, SUMMARY.md, and verified screenshots locally | Before GitBook account/workspace connection or publication; verify free-plan limits |
| Travel/OTA suppliers | Contract-tested adapter and explicitly labeled fictional seed data | Before supplier onboarding, partner credentials, or live requests |

## Credential and registration request format
Create `docs/THIRD_PARTY_DEPENDENCIES.md` with provider, feature, local fallback, free-tier assumptions, quotas/limits, privacy/security implications, registration URL (verified), required scopes, account owner, status (`NOT_NEEDED`, `PENDING_USER`, `CONFIGURED`, `VERIFIED`), and verification evidence. Create `.env.example` with placeholder names only. When blocked, ask a **single consolidated question** listing only the essential accounts/keys needed for the next integration milestone; prioritize no-key local workflows. For each key, identify its exact environment variable and whether it belongs to server-side only. Never put server-side credentials in `NEXT_PUBLIC_*` variables.

## Verification and delivery gates
- CI and local tests must pass using free local infrastructure and deterministic mocks where external services are not authorized.
- Separate tests for real provider integrations; mark them SKIPPED/PENDING if credentials are missing, never PASS.
- Document any free-tier quota risk, required attribution, API rate limits, licensing restrictions, and fallback behavior.
- Publish to GitBook, deploy to Vercel/Cloudflare, send emails, and call paid/billable APIs only after user authorization.
- Include a zero-cost local demo runbook and an optional hosted deployment plan with an explicit cost/approval checklist.
