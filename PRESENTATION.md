# Sanpu Presentation Guide

Two connected travel products, built on one shared platform:

- **Sanpu Travel:** a travel booking website and the operations back office behind it.
- **Sanpu AI Travel:** an AI assistant where a traveler plans, compares and books in one conversation.

## 1. Links

| What | URL |
|---|---|
| Sanpu Travel: customer site | https://sanpu-travel.vercel.app |
| Sanpu Travel: admin | https://sanpu-travel.vercel.app/admin/login |
| Sanpu AI Travel: customer site | https://sanpu-trip-copilot.vercel.app |
| Sanpu AI Travel: assistant | https://sanpu-trip-copilot.vercel.app/assistant |
| Sanpu AI Travel: admin | https://sanpu-trip-copilot.vercel.app/admin/login |
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
| 9:30–10:00 | Architecture and close | Swagger, or section 6 below | "Next.js front ends, ASP.NET Core APIs, SQL Server with stored procedures, and role-based access from the database." |

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

## 5. Major database tables

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

## 6. Architecture answers

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

## 7. Known limits

Say these plainly if asked:

- Payments use the ECPay **sandbox**, so no real money moves.
- Flights, hotels, buses and taxis use Sanpu's own catalog, not a live airline or hotel supplier.
- No email is sent when staff approve, cancel or refund a booking.
- The APIs and database run on the presenter's laptop for this demo.
