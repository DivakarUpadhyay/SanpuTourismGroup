# Sanpu Presentation Guide

Two connected travel products, built on one shared platform:

- **Sanpu Travel:** a travel booking website and the operations back office behind it.
- **Sanpu AI Travel:** an AI assistant where a traveler plans, compares and books in one conversation.

## Run the APIs and apps manually

**Do not run these during the interview unless a site is down.** The live Vercel sites use the APIs running on this laptop, and restarting them interrupts both sites.

Run every command in PowerShell from the project folder:

```powershell
cd D:\Divakar-Apps\SanpuTourismGroup\sanpu-workspace
```

### Option A: run everything locally

Open four PowerShell windows, go to the project folder in each, and run one command per window:

| Window | Starts | Command | Opens at |
|---|---|---|---|
| 1 | Tour Operations API | `dotnet run --project tour-operations/backend/src/Api --launch-profile http` | http://localhost:5101/swagger |
| 2 | AI Travel API | `dotnet run --project ai-travel/backend/src/Api --launch-profile http` | http://localhost:5102/swagger |
| 3 | Sanpu Travel website | `npm run dev:erp` | http://localhost:3101 |
| 4 | AI Travel website | `npm run dev:ai` | http://localhost:3102 |

Press `Ctrl+C` in a window to stop that service.

### Option B: restart both APIs in the background

```powershell
./scripts/dev-api.ps1
```

This stops the APIs on ports 5101 and 5102, rebuilds them and starts them again for local use.

### Option C: bring the live Vercel sites back

| Situation | Command |
|---|---|
| The APIs stopped but the tunnels still work | `./scripts/go-live.ps1 -ApisOnly` |
| The tunnels also stopped | `npx vercel login`, then `./scripts/go-live.ps1` |
| Check the live connection | `node tools/live.mjs status` |
| Switch the sites to the offline preview | `./scripts/go-live.ps1 -Off` |

Running the full `./scripts/go-live.ps1` creates new tunnel URLs, so the Swagger links in section 1 will change.

### First-time setup on a new computer

Replace `YOUR_SQL_SERVER` with your SQL Server name:

```powershell
npm install
./scripts/dev-secrets.ps1 -Server "YOUR_SQL_SERVER"
./scripts/db-setup.ps1 -App erp -Server "YOUR_SQL_SERVER"
./scripts/db-setup.ps1 -App ai -Server "YOUR_SQL_SERVER"
```

## 1. Links

| What | URL |
|---|---|
| Sanpu Travel: customer site | https://sanpu-travel.vercel.app |
| Sanpu Travel: admin | https://sanpu-travel.vercel.app/admin/login |
| Sanpu AI Travel: customer site | https://sanpu-trip-copilot.vercel.app |
| Sanpu AI Travel: assistant | https://sanpu-trip-copilot.vercel.app/assistant |
| Sanpu AI Travel: admin | https://sanpu-trip-copilot.vercel.app/admin/login |
| Tour Operations API | https://sanpu-travel.vercel.app/api/v1 |
| AI Travel API | https://sanpu-trip-copilot.vercel.app/api/v1 |
| Tour Operations API: Swagger | https://slide-genuine-tiffany-borough.trycloudflare.com/swagger/index.html |
| AI Travel API: Swagger | https://guy-representing-airfare-amendment.trycloudflare.com/swagger/index.html |

**Swagger is not served from the Vercel URLs.** Vercel hosts the websites, and the APIs run on the laptop behind Cloudflare tunnels. These tunnel links change if the tunnels are restarted.

**Keep the laptop on and connected during the interview.** Both live sites depend on it.

## 2. Logins

Passwords are not stored here because this GitHub repository is public. Every account in an app uses the same password, kept in the local `LOGINS.local.txt` files.

Staff sign in at `/admin/login`. Customers sign in at `/login`.

### Sanpu Travel

| Role | Email | Signs in at |
|---|---|---|
| System admin | admin@demo.sanpu.test | /admin/login |
| Director | director@demo.sanpu.test | /admin/login |
| Operations manager | ops.manager@demo.sanpu.test | /admin/login |
| Reservations agent | agent@demo.sanpu.test | /admin/login |
| Finance | finance@demo.sanpu.test | /admin/login |
| Marketing manager | marketing@demo.sanpu.test | /admin/login |
| Customer | traveler.chen@demo.sanpu.test | /login |
| Customer | traveler.lee@demo.sanpu.test | /login |

### Sanpu AI Travel

| Role | Email | Signs in at |
|---|---|---|
| System admin | admin@demo.sanpu.test | /admin/login |
| Operations supervisor | supervisor@demo.sanpu.test | /admin/login |
| Operations agent | ops.agent@demo.sanpu.test | /admin/login |
| AI engineer | ai.engineer@demo.sanpu.test | /admin/login |
| Traveler | traveler.chen@demo.sanpu.test | /login |
| Traveler | traveler.lee@demo.sanpu.test | /login |

## 3. The 10-minute demo

Before you start, open these tabs and sign in: Sanpu Travel customer, Sanpu Travel admin, AI Travel assistant, AI Travel admin. Admin and customer sessions are separate, so both can stay signed in on one browser.

| Time | Show | Where | What to say |
|---|---|---|---|
| 0:00–1:00 | Introduction | Sanpu Travel home | "One platform, two products: a booking site with its operations back office, and an AI assistant that books from a conversation." |
| 1:00–3:00 | Search and filters | /tours, then /hotels or /flights | "Filters show result counts and removable tags. Tours, hotels, flights, buses and taxis are all bookable." |
| 3:00–3:30 | Compare tours | /compare | "Customers pick up to three tours and compare them side by side." |
| 3:30–5:00 | Booking and payment | Book a hotel, then My bookings | "A booking is confirmed only after a successful payment. Customers can pay a deposit or the full amount." |
| 5:00–6:30 | Admin operations | Dashboard, Bookings, Payments & transactions | "Every dashboard number opens its detail. Staff see each customer transaction, paid, pending or failed." |
| 6:30–8:30 | AI assistant | /assistant | Type: **Find a hotel in Kinmen for 2 nights next Friday**. Press **Book this**, then **Pay**. "Prices are live. The AI can prepare a booking, but only the traveler can pay." |
| 8:30–9:30 | AI admin | Assistant bookings, Payments | "Staff see every assistant booking and every payment attempt." |
| 9:30–10:00 | Architecture and close | Swagger, or section 9 below | "Next.js front ends, ASP.NET Core APIs, SQL Server with stored procedures, and role-based access from the database." |

### ECPay in the demo

Pressing **Pay** in AI Travel opens the real ECPay sandbox page with the correct amount. No real money moves.

**Rehearse one full payment before the interview.** The automated test reached the ECPay page, but the sandbox payment did not complete, so a successful return to AI Travel is not yet verified.

Sandbox test card: `4311-9522-2222-2222`, expiry `12/30`, security code `222`.

If it stalls, say: "This is ECPay's sandbox. The booking stays unconfirmed until ECPay reports success." Then show the booking still waiting for payment.

## 4. What to show in each app

### Sanpu Travel: customer

| Area | Pages | Function |
|---|---|---|
| Tours | /tours, /destinations, /calendar, /compare | Browse, filter, see departures, compare |
| Book travel | /hotels, /flights, /buses, /taxis | Search and book travel services |
| Offers and stories | /deals, /news, /blog | Promotions, travel news and articles |
| My trips | /my/bookings, /for-you, /account | Bookings, payments, recommendations, profile |
| Help | /help, /contact | Help center and contact form |

### Sanpu Travel: admin

| Menu group | Pages | Function |
|---|---|---|
| Dashboard | /admin | Business numbers that open their detail |
| Operations | Bookings, Approval inbox, Departures, Tours, Task queue, Group simulation | Run tours and approve work |
| Travel services | Hotels, flights, buses & taxis; Service bookings | Manage services and their bookings |
| Partners & finance | Suppliers, Payments & transactions, Reconciliation, Business units, Cost assumptions | Suppliers, money and costs |
| Sales & marketing | Promotions & banners, Coupon codes, News & blog | Offers and content |
| Customer care | Contact requests, Help center | Customer questions |
| Team & access | People | Staff accounts and access |

### Sanpu AI Travel: customer

| Page | Function |
|---|---|
| /assistant | Plan, compare and book in one conversation |
| /my/bookings | Pay a balance, see references, cancel |
| /my/trips | Day-by-day trip plans |
| /trips/new | Plan from a template |
| /account | Profile |

### Sanpu AI Travel: admin

| Menu group | Pages | Function |
|---|---|---|
| Dashboard | /admin | Overview |
| Copilot | Ask the copilot, Trips, Assistant bookings, Payments, Recovery proposals, Document intake | Daily AI operations |
| Planning rules | Disruption scenarios, Itinerary templates, Travel constraints | Rules the planner follows |
| Team & access | People | Staff accounts and access |

## 5. Payments, approvals and cancellations

### Make an ECPay sandbox payment in AI Travel

1. Sign in at https://sanpu-trip-copilot.vercel.app/login as `traveler.chen@demo.sanpu.test`.
2. Open **AI assistant** and type `Find a hotel in Kinmen`.
3. Press **Book this**, then **Pay now** or **Pay 30% deposit**.
4. On the ECPay page, stay on the **信用卡** (credit card) tab and enter card `4311 9522 2222 2222`, expiry `12` / `30`, security code `222`, name `TEST TRAVELER`, phone `0912345678` and email `traveler@example.com`.
5. Press the orange **測試付款請點此** (test payment) button. If a notice appears, press **關閉** (close), then press the orange button again.
6. If it asks for an SMS code, try `1234`.
7. You should return to **My bookings** with "Payment received".

### Where each booking and payment shows in admin

| Booked in | Booking shows at | Payment shows at |
|---|---|---|
| Sanpu Travel: tour | Admin > Operations > **Bookings** (`/admin/bookings`) | Admin > Partners & finance > **Payments & transactions** (`/admin/payments`), and inside the booking |
| Sanpu Travel: hotel, flight, bus, taxi | Admin > Travel services > **Service bookings** (`/admin/service-bookings`) | Admin > Partners & finance > **Payments & transactions** (`/admin/payments`) |
| AI Travel: assistant | Admin > Copilot > **Assistant bookings** (`/admin/reservations`) | Admin > Copilot > **Payments** (`/admin/payments`) |

### Approve or reject a Sanpu Travel tour booking

Sign in as `admin@demo.sanpu.test` or `ops.manager@demo.sanpu.test`.

1. Open **Bookings** and set **Status** to **Pending**.
2. Open a booking that has a payment. An unpaid booking shows "Approval opens after payment".
3. Press **Approve**, then confirm. The held seats become sold and the booking becomes **Confirmed**.
4. To reject, enter a **Decision comment**, press **Reject**, then confirm. The seats are released.

The **Approval inbox** (`/admin/approvals`) lists the approvals waiting for the signed-in person, with **Approve** and **Reject** buttons.

### Cancel or refund a Sanpu Travel tour booking

| Who | Booking status | What to do | Result |
|---|---|---|---|
| Customer | Pending | My bookings > open the booking > **Withdraw booking** | Seats are released |
| Customer | Confirmed | My bookings > open the booking > **Request cancellation** | Status becomes **CancelRequested** for staff to handle |
| Staff | Pending, Confirmed or CancelRequested | Bookings > open the booking > **Cancel booking** | Booking is cancelled |
| Finance or admin | Has a payment | Bookings > open the booking > **Issue refund** | The refund workflow decides, and large amounts need a second approver |

### Cancel other bookings

| App | Booking | How to cancel |
|---|---|---|
| Sanpu Travel | Hotel, flight, bus, taxi | Customer: My bookings > **Cancel**. Allowed until 24 hours before the start date. |
| AI Travel | Not paid yet | Customer: press **Not now** on the booking card |
| AI Travel | Deposit paid | Customer: My bookings > **Cancel booking** |

### AI Travel has no staff approval step

A booking is confirmed automatically when it is fully paid through ECPay. The AI Travel admin pages are view-only, so staff cannot approve, cancel or refund there. A fully paid AI Travel booking has no cancel button.

### Who can do what in Sanpu Travel

| Action | Roles |
|---|---|
| Approve or reject a booking | System admin, Director, Operations manager |
| Act on the Approval inbox | System admin, Director, Operations manager, Finance |
| Cancel a booking | System admin, Operations manager, Reservations agent |
| Issue a refund | System admin, Finance |

## 6. Major database tables

### Sanpu Travel (`SanpuErp`)

| Category | Tables | Used for |
|---|---|---|
| Users and access | Users, Roles, UserRoles, Permissions, RolePermissions, UserInvitations | Accounts, roles and what each role can do |
| Sign-in security | RefreshTokens, PasswordResetTokens | Sessions and password reset |
| Menus and settings | Menus, MenuPermissions, AppSettings, ContentTemplates | Database-driven menus, settings, email templates |
| Tour catalog | Tours, Departures, Destinations, DestinationHistory, Places, NearbyPlaces, TourViews | Tours, dates, seats and destination content |
| Tour bookings | Bookings, BookingStatusHistory, InventoryHolds | Bookings, status history and seat holds |
| Travel services | TravelServices, ServiceInventory, ServiceBookings | Hotels, flights, buses, taxis and availability |
| Payments and finance | PaymentIntents, Payments, ServicePayments, Refunds, Reconciliations, SupplierStatements | Gateway attempts, received money, refunds, supplier checks |
| Suppliers and costs | Suppliers, DepartureCosts, CostAssumptions, VehicleTypes, BusinessUnits, GroupPlans | Partners, costing and group planning |
| Approvals and tasks | WorkflowDefinitions, WorkflowSteps, ApprovalRequests, ApprovalActions, StaffTasks | Approval rules, decisions and staff work |
| Marketing and content | Promotions, Coupons, CouponRedemptions, Articles, ArticleBotSchedules, NewsletterSubscribers, MediaFiles | Offers, news, blog and uploads |
| Customer care | ContactRequests, HelpArticles | Contact form and help center |
| System | AuditLogs, IntegrationEvents, RetentionPolicies, DevOutbox, SchemaVersions | Audit trail, supplier events, data retention, email log, database versions |

### Sanpu AI Travel (`SanpuAiOps`)

| Category | Tables | Used for |
|---|---|---|
| Users and access | Users, Roles, UserRoles, Permissions, RolePermissions, UserInvitations | Accounts, roles and what each role can do |
| Sign-in security | RefreshTokens, PasswordResetTokens | Sessions and password reset |
| Menus and settings | Menus, MenuPermissions, AppSettings, ContentTemplates | Database-driven menus, settings, email templates |
| Assistant bookings | Reservations, ReservationPayments | Bookings made in chat and each ECPay attempt |
| Trip planning | Trips, ItineraryVersions, ItineraryItems, ItineraryTemplates, TemplateItems, Regions, Places | Trip plans, versions, templates and locations |
| Disruption recovery | DisruptionScenarios, Simulations, RecoveryProposals, TravelConstraints | Test disruptions and propose plan changes under the rules |
| Documents | Documents, DocumentFields | Uploaded documents and extracted fields |
| AI quality and cost | PromptTemplates, AiUsageLogs, EvalCases, EvalRuns, EvalResults | Prompts, usage tracking and accuracy tests |
| System | AuditLogs, DevOutbox, NewsletterSubscribers, SchemaVersions | Audit trail, email log, subscribers, database versions |

## 7. Most important APIs and tables

Swagger lists 151 Tour Operations routes and 92 AI Travel routes. These are the ones to explain first. All paths start with `/api/v1`.

### Shared APIs (both apps)

| Method and path | Purpose |
|---|---|
| `POST /auth/register` | Create a customer account |
| `POST /auth/login` | Sign in and receive a token |
| `POST /auth/refresh` | Renew the session from the refresh cookie |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | Password reset |
| `GET /auth/me` | The signed-in user |
| `GET /navigation/me` | Menus allowed for the user's role |
| `GET /public/settings` | Public site settings |
| `GET /admin/users`, `PUT /admin/users/{id}/roles` | Manage staff and their roles |
| `POST /admin/users/access-requests/{id}` | Decide a staff access request |

### Tour Operations APIs

| Area | Method and path | Purpose |
|---|---|---|
| Catalog | `GET /catalog/tours`, `GET /catalog/tours/{code}` | Search tours and open one |
| Catalog | `GET /discover/compare` | Compare tours |
| Tour booking | `POST /bookings/holds` | Hold seats while the customer books |
| Tour booking | `POST /bookings` | Create a booking from the hold |
| Tour booking | `GET /my/bookings`, `POST /my/bookings/{id}/cancel` | Customer bookings and cancellation |
| Travel services | `GET /travel/search` | Search hotels, flights, buses and taxis |
| Travel services | `POST /travel/bookings` | Book a travel service |
| Travel services | `POST /travel/my/bookings/{id}/cancel` | Cancel a travel service booking |
| Payments | `GET /payments/summary` | Amount paid and balance |
| Payments | `POST /payments/checkout` | Start an ECPay payment |
| Payments | `POST /payments/{tradeNo}/refresh` | Re-check a payment with ECPay |
| Payments | `POST /payments/ecpay/result`, `POST /payments/ecpay/notify` | ECPay results. These are hidden from Swagger |
| Operations | `GET /ops/dashboard` | Admin business numbers |
| Operations | `GET /ops/bookings`, `GET /ops/bookings/{id}` | Staff booking list and detail |
| Operations | `POST /ops/bookings/{id}/decision` | Approve or reject a booking |
| Operations | `POST /ops/bookings/{id}/cancel` | Staff cancellation |
| Operations | `POST /ops/bookings/{id}/refunds` | Issue a refund |
| Operations | `GET /ops/approvals/inbox`, `POST /ops/approvals/{id}/act` | Approval inbox and decisions |
| Operations | `GET /ops/payments` | Every payment transaction |
| Operations | `GET /ops/services/bookings` | Staff list of travel service bookings |

### AI Travel APIs

| Area | Method and path | Purpose |
|---|---|---|
| Assistant | `POST /assistant/chat` | One conversation turn with live results |
| Assistant | `POST /assistant/prepare` | Prepare a booking at the live price |
| Bookings | `GET /my/bookings`, `POST /my/bookings/{id}/cancel` | Traveler bookings and cancellation |
| Payments | `POST /my/bookings/{id}/checkout` | Start an ECPay payment |
| Payments | `POST /payments/{tradeNo}/refresh` | Re-check a payment with ECPay |
| Payments | `POST /payments/ecpay/result`, `POST /payments/ecpay/notify` | ECPay results. These are hidden from Swagger |
| Staff | `GET /aiops/reservations` | Every assistant booking |
| Staff | `GET /aiops/payments` | Every payment attempt |
| Staff | `GET /aiops/dashboard` | Admin overview |
| Trip planning | `POST /trips`, `GET /my/trips` | Create and list trip plans |
| Disruption recovery | `POST /aiops/simulations`, `POST /aiops/simulations/{id}/proposal` | Test a disruption and propose a new plan |
| Disruption recovery | `POST /aiops/proposals/{id}/decision` | Staff approve or reject the proposal |
| Documents | `POST /aiops/documents`, `POST /aiops/documents/{id}/review` | Upload a document and review its fields |
| AI quality | `POST /aiops/evals/run`, `GET /aiops/ai-usage` | Run accuracy tests and track AI usage |

### Important database tables

Start with the **Must explain** tables. Use the others if the interviewer asks for more detail.

#### Shared tables (in both databases)

| Priority | Table | What it is used for | Key columns |
|---|---|---|---|
| Must explain | `Users` | Every staff and customer account, with the hashed password, lock status and customer or staff type | Email, PasswordHash, UserType, IsActive, IsLocked |
| Must explain | `Roles` | Job roles such as system admin, finance or traveler | RoleKey, RoleName |
| Must explain | `Permissions` | Each individual action the system can allow, such as approving a booking | PermissionKey, ModuleKey, ActionKey |
| Must explain | `UserRoles` | Links each user to their roles | UserId, RoleId |
| Must explain | `RolePermissions` | Links each role to the actions it may perform | RoleId, PermissionId |
| Must explain | `Menus` | Builds the admin and customer menus from the database | Title, RoutePath, ParentMenuId, ApplicationArea |
| Must explain | `MenuPermissions` | Decides which roles can see each menu | MenuId, PermissionId |
| Must explain | `AuditLogs` | Records who did what and when | ActorUserId, Action, EntityType, EntityId, OccurredAtUtc |
| If asked | `RefreshTokens` | Keeps users signed in safely and lets sessions be revoked | UserId, FamilyId, TokenHash, ExpiresAtUtc, RevokedAtUtc |
| If asked | `AppSettings` | Business settings that can change without new code, such as the deposit percentage | SettingKey, SettingValue, ValueType |
| If asked | `ContentTemplates` | Email and content templates | TemplateKey, Subject, Body |
| If asked | `DevOutbox` | A copy of each generated email, used to check notifications | ToAddress, Subject, CreatedAtUtc |

#### Sanpu Travel (`SanpuErp`)

| Priority | Area | Table | What it is used for | Key columns |
|---|---|---|---|---|
| Must explain | Tours | `Tours` | The tour products customers can buy | Code, Title, Days, BasePrice, IsPublished |
| Must explain | Tours | `Departures` | Each tour date, with its price and seats | TourId, DepartureDate, Capacity, SeatsSold, SeatsHeld, Price |
| Must explain | Tour booking | `InventoryHolds` | Holds seats for a short time so two customers cannot buy the same last seat | DepartureId, UserId, Pax, ExpiresAtUtc, Status |
| Must explain | Tour booking | `Bookings` | The main tour booking record | BookingRef, CustomerUserId, DepartureId, TotalAmount, Status, PaymentStatus, AmountPaid |
| Must explain | Tour booking | `BookingStatusHistory` | Every status change on a booking | BookingId, FromStatus, ToStatus, ActorUserId, Comment |
| Must explain | Travel services | `TravelServices` | Hotels, flights, buses and taxis | Code, Kind, Name, FromPlaceId, ToPlaceId, BasePrice |
| Must explain | Travel services | `ServiceInventory` | Daily availability and price for each service | ServiceId, ServiceDate, Capacity, Sold, Held, Price |
| Must explain | Travel services | `ServiceBookings` | Hotel, flight, bus and taxi bookings | BookingRef, ServiceId, StartDate, TotalAmount, Status, PaymentStatus |
| Must explain | Payments | `PaymentIntents` | Every payment attempt sent to ECPay: paid, pending or failed | MerchantTradeNo, OrderType, OrderRef, Mode, Amount, Status, ProviderTradeNo |
| Must explain | Payments | `Payments` | Money received for tour bookings | BookingId, Amount, Provider, ProviderRef, Method |
| Must explain | Payments | `ServicePayments` | Money received for travel service bookings | ServiceBookingId, Amount, Mode, Provider, ProviderRef |
| Must explain | Payments | `Refunds` | Money returned to customers | RefundRef, BookingId, Amount, Reason, Status |
| Must explain | Approvals | `WorkflowDefinitions` | The approval processes the business uses | WorkflowKey, Version, EntityType, Name |
| Must explain | Approvals | `WorkflowSteps` | Who approves each step, under what condition and by when | WorkflowId, StepNo, ApproverRoleId, ConditionType, SlaHours |
| Must explain | Approvals | `ApprovalRequests` | Each item waiting for approval | EntityType, EntityRef, Amount, CurrentStepNo, Status |
| Must explain | Approvals | `ApprovalActions` | Each approve, reject or delegate decision | ApprovalRequestId, ActorUserId, Decision, Comment |
| If asked | Tours | `Destinations` | Destination pages and travel guides | Code, Name, Region, Overview, BestTime |
| If asked | Travel services | `Places` | Cities, airports and stations used for routes | Code, Name, Kind, City |
| If asked | Suppliers | `Suppliers` | Hotels, transport companies and other partners | Code, Name, SupplierType, ConnectionStatus |
| If asked | Suppliers | `DepartureCosts` | What each tour date costs the business | DepartureId, SupplierId, CostType, Amount |
| If asked | Suppliers | `SupplierStatements` | Amounts suppliers say they are owed | SupplierId, Period, Amount |
| If asked | Suppliers | `Reconciliations` | Compares Sanpu's amount with the supplier's amount | SupplierId, Period, OurAmount, SupplierAmount, Difference, Status |
| If asked | Suppliers | `IntegrationEvents` | Supplier messages, with protection against duplicates | SupplierId, EventType, IdempotencyKey, Status, Attempts |
| If asked | Operations | `StaffTasks` | Work assigned to staff | Title, TaskType, AssignedUserId, Status, Priority, DueAtUtc |
| If asked | Operations | `GroupPlans` | Group trip cost, revenue and margin simulations | DepartureId, ProjectedCost, ProjectedRevenue, ProjectedMarginPct |
| If asked | Marketing | `Promotions` | Banners and offers on the website | Title, Placement, CouponCode, StartsAtUtc, EndsAtUtc |
| If asked | Marketing | `Coupons` | Discount codes and their limits | Code, DiscountType, DiscountValue, UsageLimit |
| If asked | Marketing | `CouponRedemptions` | Each time a customer uses a coupon | CouponId, CustomerUserId, OrderRef, DiscountAmount |
| If asked | Content | `Articles` | News and blog posts | Kind, Title, Body, Status, WrittenBy, PublishedAtUtc |
| If asked | Content | `ArticleBotSchedules` | When the AI writer creates news and blog posts | Kind, IsEnabled, Days, TimeLocal, AutoPublish |
| If asked | Customer care | `ContactRequests` | Messages from the contact form | ContactRef, Name, Email, Topic, Status |
| If asked | Customer care | `HelpArticles` | Help center questions and answers | Category, Question, Answer, IsPublished |

#### Sanpu AI Travel (`SanpuAiOps`)

| Priority | Area | Table | What it is used for | Key columns |
|---|---|---|---|---|
| Must explain | Assistant booking | `Reservations` | Bookings prepared by the AI assistant and paid by the traveler | Ref, TravelerUserId, Kind, ItemName, Total, PaidAmount, Status, ExpiresAtUtc |
| Must explain | Assistant booking | `ReservationPayments` | Every ECPay attempt on those bookings | MerchantTradeNo, ReservationId, Mode, Amount, Status, ProviderTradeNo |
| Must explain | Trip planning | `Trips` | A traveler's trip plan and preferences | TripRef, TravelerUserId, StartDate, Days, Pax, BudgetPerPax, Status |
| Must explain | Trip planning | `ItineraryVersions` | Each saved version of a trip plan | TripId, VersionNo, Source, ProposalId |
| Must explain | Trip planning | `ItineraryItems` | The day-by-day activities in a version | VersionId, DayNo, StartTime, Title, Category, Status |
| Must explain | Disruption recovery | `DisruptionScenarios` | Problems to test, such as a delay or closure | Code, Name, AffectedCategories, Effect, DelayMinutes |
| Must explain | Disruption recovery | `Simulations` | The result of testing a disruption on a trip | TripId, VersionId, ScenarioId, ImpactJson, ImpactCount |
| Must explain | Disruption recovery | `RecoveryProposals` | The suggested plan change, which staff approve or reject | ProposalRef, TripId, Status, ChangesJson, Explanation, CostImpactPerPax, DecidedBy |
| Must explain | AI control | `AiUsageLogs` | Each AI call, with its tokens, cost, speed and result | Feature, Provider, Model, InputTokens, OutputTokens, CostUsd, LatencyMs, Outcome |
| If asked | Trip planning | `ItineraryTemplates` | Ready-made trip plans | Code, Name, RegionId, Days, Pace |
| If asked | Trip planning | `TemplateItems` | The activities inside a ready-made plan | TemplateId, DayNo, StartTime, PlaceId |
| If asked | Trip planning | `Regions` | Travel regions | Code, Name |
| If asked | Trip planning | `Places` | Attractions and stops, with opening times and access details | Code, Name, Category, OpenTime, CloseTime, WheelchairAccessible |
| If asked | Disruption recovery | `TravelConstraints` | Rules that every proposed plan must follow | Code, Name, RuleType, Value |
| If asked | Documents | `Documents` | Uploaded travel documents and their review status | DocumentRef, DocType, Status, TripId, RedactionCount, ReviewedBy |
| If asked | Documents | `DocumentFields` | Details extracted from a document, with a confidence score | DocumentId, FieldName, Value, Confidence, ReviewedValue |
| If asked | AI control | `PromptTemplates` | Versioned instructions given to the AI | PromptKey, Version, Body, IsActive |
| If asked | AI control | `EvalCases` | Test questions used to check AI accuracy | Code, Name, InputJson, ExpectedJson |
| If asked | AI control | `EvalRuns` | The overall score of each accuracy test | RunAtUtc, Total, Passed, GroundingScore, UsedModel |
| If asked | AI control | `EvalResults` | The pass or fail result for each test question | RunId, CaseId, Passed, Detail, HumanFeedback |

#### How the main tables connect

| Flow | Tables, in order |
|---|---|
| Sign-in and access | `Users` → `UserRoles` → `Roles` → `RolePermissions` → `Permissions` → `MenuPermissions` → `Menus` |
| Tour booking | `Tours` → `Departures` → `InventoryHolds` → `Bookings` → `PaymentIntents` → `Payments` → `ApprovalRequests` → `ApprovalActions` → `BookingStatusHistory` |
| Hotel, flight, bus or taxi booking | `TravelServices` → `ServiceInventory` → `ServiceBookings` → `PaymentIntents` → `ServicePayments` |
| AI assistant booking | `Reservations` → `ReservationPayments` → `Reservations` updated after ECPay confirms payment |
| Disruption recovery | `Trips` → `ItineraryVersions` → `ItineraryItems` → `DisruptionScenarios` → `Simulations` → `RecoveryProposals` → new `ItineraryVersions` after staff approval |

## 8. Ready-to-use API requests

| API | Vercel base URL |
|---|---|
| Tour Operations | https://sanpu-travel.vercel.app/api/v1 |
| AI Travel | https://sanpu-trip-copilot.vercel.app/api/v1 |

Open these in a browser to see live data without signing in:

- https://sanpu-travel.vercel.app/api/v1/public/settings
- https://sanpu-travel.vercel.app/api/v1/catalog/destinations
- https://sanpu-travel.vercel.app/api/v1/catalog/tours?destination=ALISHAN&pax=2
- https://sanpu-travel.vercel.app/api/v1/catalog/tours/TW-G29
- https://sanpu-travel.vercel.app/api/v1/discover/compare?codes=TW-G29,TW-G15
- https://sanpu-travel.vercel.app/api/v1/travel/places
- https://sanpu-travel.vercel.app/api/v1/travel/search?kind=Hotel&date=2027-01-07&endDate=2027-01-09&units=1&travelers=2
- https://sanpu-travel.vercel.app/api/v1/travel/search?kind=Flight&date=2027-01-07&travelers=1
- https://sanpu-travel.vercel.app/api/v1/travel/search?kind=Bus&date=2027-01-07&travelers=1
- https://sanpu-travel.vercel.app/api/v1/travel/search?kind=Taxi&date=2027-01-07&travelers=1
- https://sanpu-trip-copilot.vercel.app/api/v1/public/settings

### Step 1: sign in from PowerShell

Replace `YOUR_PASSWORD`, then paste this block:

```powershell
$erp = "https://sanpu-travel.vercel.app/api/v1"
$ai = "https://sanpu-trip-copilot.vercel.app/api/v1"
$password = "YOUR_PASSWORD"
function Get-Auth($base, $email, $realm) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  $login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType "application/json" -Headers @{ "X-Session-Realm" = $realm } -Body $body
  @{ Authorization = "Bearer $($login.accessToken)"; "X-Session-Realm" = $realm }
}
$erpCustomer = Get-Auth $erp "traveler.chen@demo.sanpu.test" "site"
$erpAdmin = Get-Auth $erp "admin@demo.sanpu.test" "admin"
$aiCustomer = Get-Auth $ai "traveler.chen@demo.sanpu.test" "site"
$aiAdmin = Get-Auth $ai "admin@demo.sanpu.test" "admin"
function Send-Json($url, $headers, $data) { Invoke-RestMethod $url -Method Post -Headers $headers -ContentType "application/json" -Body ($data | ConvertTo-Json -Depth 6) }
```

### Step 2: read data (safe to repeat)

```powershell
Invoke-RestMethod "$erp/auth/me" -Headers $erpCustomer
Invoke-RestMethod "$erp/my/bookings" -Headers $erpCustomer
Invoke-RestMethod "$erp/travel/my/bookings" -Headers $erpCustomer
Invoke-RestMethod "$erp/payments/summary?orderType=Tour&orderId=8" -Headers $erpCustomer
Invoke-RestMethod "$erp/ops/dashboard" -Headers $erpAdmin
Invoke-RestMethod "$erp/ops/bookings?status=Pending&page=1&pageSize=5" -Headers $erpAdmin
Invoke-RestMethod "$erp/ops/bookings/24" -Headers $erpAdmin
Invoke-RestMethod "$erp/ops/approvals/inbox" -Headers $erpAdmin
Invoke-RestMethod "$erp/ops/payments?status=Paid&page=1" -Headers $erpAdmin
Invoke-RestMethod "$erp/ops/services/bookings?kind=Hotel" -Headers $erpAdmin
Invoke-RestMethod "$ai/my/bookings" -Headers $aiCustomer
Invoke-RestMethod "$ai/aiops/dashboard" -Headers $aiAdmin
Invoke-RestMethod "$ai/aiops/reservations?status=Confirmed" -Headers $aiAdmin
Invoke-RestMethod "$ai/aiops/payments?status=Pending" -Headers $aiAdmin
Invoke-RestMethod "$ai/aiops/ai-usage" -Headers $aiAdmin
```

### Step 3: AI Travel booking and ECPay checkout

This creates one booking, starts an ECPay checkout, then cancels the booking:

```powershell
$chat = Send-Json "$ai/assistant/chat" @{} @{ messages = @(@{ role = "user"; content = "Find a hotel in Kinmen" }) }
$chat.reply

$prepared = Send-Json "$ai/assistant/prepare" $aiCustomer @{ kind = "Hotel"; code = "H-G39"; date = "2027-01-07"; end_date = "2027-01-09"; travelers = 2 }
$booking = ($prepared.cards | Where-Object { $_.type -eq "booking" }).data
$booking | Select-Object ref, status, total

$checkout = Send-Json "$ai/my/bookings/$($booking.reservationId)/checkout" $aiCustomer @{ mode = "Deposit" }
$checkout | Select-Object provider, amount, completed, action

Invoke-RestMethod "$ai/payments/$($checkout.merchantTradeNo)/refresh" -Method Post -Headers $aiCustomer | Select-Object status
Invoke-RestMethod "$ai/my/bookings/$($booking.reservationId)/cancel" -Method Post -Headers $aiCustomer | Select-Object ref, status
```

### Request bodies that change live data

Replace `{id}` with a real ID. Use `Send-Json` with the matching sign-in from step 1.

| App | Sign in as | Full URL | JSON body |
|---|---|---|---|
| Tour Operations | None | `POST https://sanpu-travel.vercel.app/api/v1/auth/register` | `{"email":"new.user@example.com","displayName":"New User","password":"YOUR_NEW_PASSWORD"}` |
| Tour Operations | None | `POST https://sanpu-travel.vercel.app/api/v1/auth/forgot-password` | `{"email":"traveler.chen@demo.sanpu.test"}` |
| Tour Operations | Customer | `POST https://sanpu-travel.vercel.app/api/v1/bookings/holds` | `{"departureId":489,"pax":2,"idempotencyKey":"demo-hold-001"}` |
| Tour Operations | Customer | `POST https://sanpu-travel.vercel.app/api/v1/bookings` | `{"holdId":"HOLD_ID_FROM_THE_HOLD_RESPONSE","leadName":"Chen Ya Ting","leadPhone":"+886912345678","passportNo":"A12345678","specialRequests":"","acceptTerms":true,"couponCode":null}` |
| Tour Operations | Customer | `POST https://sanpu-travel.vercel.app/api/v1/travel/bookings` | `{"serviceCode":"H-G39","date":"2027-01-07","endDate":"2027-01-09","units":1,"travelers":2,"leadName":"Chen Ya Ting","leadPhone":"+886912345678","pickupAddress":null,"pickupTime":null,"notes":null,"couponCode":null,"acceptTerms":true,"idempotencyKey":"demo-service-001"}` |
| Tour Operations | Customer | `POST https://sanpu-travel.vercel.app/api/v1/payments/checkout` | `{"orderType":"Tour","orderId":{id},"mode":"Deposit"}` |
| Tour Operations | Customer | `POST https://sanpu-travel.vercel.app/api/v1/my/bookings/{id}/cancel` | `{"reason":"Change of plans"}` |
| Tour Operations | Admin | `POST https://sanpu-travel.vercel.app/api/v1/ops/bookings/{id}/decision` | `{"decision":"Approved","comment":"Payment checked"}` |
| Tour Operations | Admin | `POST https://sanpu-travel.vercel.app/api/v1/ops/bookings/{id}/cancel` | `{"reason":"Customer request"}` |
| Tour Operations | Admin | `POST https://sanpu-travel.vercel.app/api/v1/ops/bookings/{id}/refunds` | `{"amount":1000,"reason":"Customer request"}` |
| AI Travel | Customer | `POST https://sanpu-trip-copilot.vercel.app/api/v1/my/bookings/{id}/checkout` | `{"mode":"Full"}` |

### Allowed values

| Field | Values |
|---|---|
| `kind` | `Hotel`, `Flight`, `Bus`, `Taxi`, and `Tour` for `/assistant/prepare` only |
| `mode` | `Deposit`, `Balance`, `Full` |
| `orderType` | `Tour`, `Service` |
| `decision` | `Approved`, `Rejected`. A comment is required to reject |
| Tour booking `status` | `Pending`, `Confirmed`, `Rejected`, `CancelRequested`, `Cancelled` |
| Payment `status` | `Paid`, `Pending`, `Failed` |
| AI booking `status` | `AwaitingConfirmation`, `PartiallyPaid`, `Confirmed`, `Cancelled` |
| `from`, `to` | Place codes from `/travel/places`, such as `TSA` or `KNH` |
| Dates | `YYYY-MM-DD` |

## 9. Architecture answers

| Question | Answer |
|---|---|
| Front end | Next.js 16 on Vercel |
| Back end | ASP.NET Core on .NET 10, Clean Architecture |
| Database | SQL Server, with Dapper and stored procedures only |
| Sign-in | JWT with a refresh cookie, and separate admin and customer sessions |
| Access control | Roles, permissions and menus are stored in the database |
| AI | Gemini first, then ChatGPT, then Claude if a provider is unavailable |
| AI safety | The AI can prepare a booking but can never pay or confirm it |
| Payments | ECPay sandbox. The signature is checked, then the trade is confirmed with ECPay server to server |

## 10. Known limits

Say these plainly if asked:

- Payments use the ECPay **sandbox**, so no real money moves.
- Flights, hotels, buses and taxis use Sanpu's own catalog, not a live airline or hotel supplier.
- No email is sent when staff approve, cancel or refund a booking.
- The APIs and database run on the presenter's laptop for this demo.
