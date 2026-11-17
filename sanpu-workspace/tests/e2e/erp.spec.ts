import { expect, request as apiRequest, test, type Browser } from "@playwright/test";
import { bearer, expectLabelledControls, expectNoHorizontalScroll, login, logout, password, sql, token, unique } from "./helpers";

const API = "http://localhost:5201";
const seedPeriod = (() => { const d = new Date(Date.now() + 18 * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();

async function as(browser: Browser, email: string) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3201" });
  const page = await ctx.newPage();
  await login(page, "erp", email);
  return { ctx, page };
}

test.describe("Authentication", () => {
  test("A01 sign-in success, wrong password and field validation", async ({ page }) => {
    await page.goto("/login");
    await expectLabelledControls(page);
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await page.getByTestId("login-email").fill("ops.manager@demo.sanpu.test");
    await page.getByTestId("login-password").fill("Wrong-Password-123");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText("Email or password is incorrect.");
    await page.getByTestId("login-password").fill(password("erp", "ops.manager@demo.sanpu.test"));
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("kpi-pending")).toBeVisible();
  });

  test("A02 session survives reload (refresh cookie), logout ends it, anonymous admin redirects", async ({ page }) => {
    await login(page, "erp", "traveler.chen@demo.sanpu.test");
    await page.reload();
    await expect(page.getByTestId("user-name")).toBeVisible();
    await logout(page);
    await page.goto("/admin/bookings");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbookings/);
  });

  test("A03 refresh rotation: old token replay revokes the family; missing CSRF header is refused", async ({ request }) => {
    await token(request, "erp", "traveler.lee@demo.sanpu.test");
    const cookies = (await request.storageState()).cookies;
    const rt = cookies.find((c) => c.name === "erp_rt")!.value, csrf = cookies.find((c) => c.name === "erp_csrf")!.value;
    expect((await request.post("/api/v1/auth/refresh")).status()).toBe(403);                         // no CSRF header
    expect((await request.post("/api/v1/auth/refresh", { headers: { "X-CSRF-Token": csrf } })).status()).toBe(200);
    const attacker = await apiRequest.newContext({ baseURL: "http://localhost:3201" });              // replays the stolen, already-rotated token
    const replay = await attacker.post("/api/v1/auth/refresh", { headers: { "X-CSRF-Token": csrf, Cookie: `erp_rt=${rt}; erp_csrf=${csrf}` } });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe("refresh_reuse_detected");
    const newCsrf = (await request.storageState()).cookies.find((c) => c.name === "erp_csrf")!.value;
    expect((await request.post("/api/v1/auth/refresh", { headers: { "X-CSRF-Token": newCsrf } })).status()).toBe(401);   // whole family revoked
    await attacker.dispose();
  });

  test("A04 password reset through the local test inbox", async ({ page, request }) => {
    const email = "director@demo.sanpu.test";
    await page.goto("/forgot-password");
    await page.getByTestId("forgot-email").fill(email);
    await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-sent")).toBeVisible();
    const inbox = await (await request.get(`${API}/api/v1/dev/outbox?to=${email}`)).json();
    const link: string = inbox[0].body.match(/https?:\/\/\S+reset-password\?token=\S+/)[0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await page.getByTestId("reset-password").fill("Fresh-Director-2026");
    await page.getByTestId("reset-confirm").fill("Fresh-Director-2026");
    await page.getByTestId("reset-submit").click();
    await expect(page).toHaveURL(/\/login/);
    await login(page, "erp", email, "Fresh-Director-2026");
    const reused = await request.post("/api/v1/auth/reset-password", { data: { token: new URL(link).searchParams.get("token"), password: "Another-Pass-2026" } });
    expect(reused.status()).toBe(400);   // one-time token
  });
});

test.describe("Admin onboarding, roles and menus", () => {
  test("B01 invite → accept → login → permitted menu; role change revokes access on the next request", async ({ browser }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    const email = `${unique("newagent")}@demo.sanpu.test`;
    await admin.page.goto("/admin/users");
    await admin.page.getByTestId("invite-open").click();
    await admin.page.getByTestId("invite-email").fill(email);
    await admin.page.getByTestId("invite-display").fill("New Agent (E2E)");
    await admin.page.getByTestId("invite-role-reservations_agent").check();
    await admin.page.getByTestId("invite-send").click();
    const link = (await admin.page.getByTestId("invite-link").textContent())!;
    await admin.page.getByTestId("modal-close").click();
    expect(sql("SanpuErp_E2E", `SELECT COUNT(*) FROM dbo.Users WHERE NormalizedEmail = '${email}' AND PasswordHash IS NULL`)).toBe("1");

    const userCtx = await browser.newContext({ baseURL: "http://localhost:3201" });
    const user = await userCtx.newPage();
    await user.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await user.getByTestId("invite-password").fill("Onboard-Agent-2026");
    await user.getByTestId("invite-confirm").fill("Onboard-Agent-2026");
    await user.getByTestId("invite-submit").click();
    await expect(user).toHaveURL(/\/login/);
    await login(user, "erp", email, "Onboard-Agent-2026");
    await expect(user.getByTestId("menu-ops.bookings")).toBeVisible();
    await expect(user.getByTestId("menu-ops.tasks")).toBeVisible();
    await expect(user.getByTestId("menu-admin.users")).toHaveCount(0);
    await user.goto("/admin/users");
    await expect(user.getByTestId("forbidden")).toBeVisible();     // UI guard
    const userToken = await token(userCtx.request, "erp", email, "Onboard-Agent-2026");
    expect((await userCtx.request.get(`${API}/api/v1/admin/users`, { headers: bearer(userToken) })).status()).toBe(403);   // API guard
    expect((await userCtx.request.get(`${API}/api/v1/ops/tasks`, { headers: bearer(userToken) })).status()).toBe(200);

    // admin swaps the role: tasks access must disappear for the SAME token on its next request
    await admin.page.getByTestId("users-search").fill(email);
    await admin.page.getByText("New Agent (E2E)").click();
    await admin.page.getByTestId("user-role-reservations_agent").uncheck();
    await admin.page.getByTestId("user-role-director").check();
    await admin.page.getByTestId("user-save-roles").click();
    await expect(admin.page.getByTestId("toast").filter({ hasText: "Roles saved" })).toBeVisible();
    expect((await userCtx.request.get(`${API}/api/v1/ops/tasks`, { headers: bearer(userToken) })).status()).toBe(403);
    await user.goto("/admin");
    await expect(user.getByTestId("menu-ops.approvals")).toBeVisible();
    await expect(user.getByTestId("menu-ops.tasks")).toHaveCount(0);
    expect(sql("SanpuErp_E2E", "SELECT TOP 1 Action FROM dbo.AuditLogs WHERE Action = 'User.RolesChanged' ORDER BY AuditId DESC")).toBe("User.RolesChanged");

    // deactivation signs the user out everywhere
    await admin.page.getByTestId("user-deactivate").click();
    await admin.page.getByTestId("confirm-yes").click();
    await expect(admin.page.getByTestId("toast").filter({ hasText: "User deactivated" })).toBeVisible();
    expect((await userCtx.request.get(`${API}/api/v1/auth/me`, { headers: bearer(userToken) })).status()).toBe(401);
    await admin.ctx.close(); await userCtx.close();
  });

  test("B02 menu tree: reorder shows up for users without a rebuild; cycles are refused", async ({ browser }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    await admin.page.goto("/admin/menus");
    await expect(admin.page.getByTestId("menu-ops.bookings")).toBeVisible();
    const order = async () => (await admin.page.getByTestId("admin-nav").locator("a").allTextContents()).filter((t) => ["Bookings", "Approval inbox"].includes(t));
    expect(await order()).toEqual(["Bookings", "Approval inbox"]);
    await Promise.all([admin.page.waitForResponse((r) => r.url().includes("/move") && r.status() === 204), admin.page.getByTestId("menu-down-ops.bookings").click()]);
    await admin.page.reload();
    await expect(admin.page.getByTestId("menu-ops.bookings")).toBeVisible();
    expect(await order()).toEqual(["Approval inbox", "Bookings"]);
    await Promise.all([admin.page.waitForResponse((r) => r.url().includes("/move") && r.status() === 204), admin.page.getByTestId("menu-up-ops.bookings").click()]);
    await admin.page.getByTestId("menu-edit-grp.ops").click();
    await admin.page.getByTestId("menu-parent").selectOption({ label: "Bookings (/admin/bookings)" });
    await admin.page.getByTestId("menu-save").click();
    await expect(admin.page.getByText("This parent would create a loop.")).toBeVisible();
    await admin.ctx.close();
  });

  test("B03 settings change reaches the public site without a rebuild", async ({ browser, page }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    const tagline = `E2E tagline ${Date.now()}`;
    await admin.page.goto("/admin/settings");
    await admin.page.getByTestId("setting-edit-Ui.HeroTagline").click();
    await admin.page.getByTestId("setting-value").fill(tagline);
    await admin.page.getByTestId("setting-save").click();
    await expect(admin.page.getByTestId("setting-value-Ui.HeroTagline")).toHaveText(tagline);
    await page.goto("/");
    await expect(page.getByTestId("hero")).toContainText(tagline);
    // typed validation: an Int setting refuses text
    await admin.page.getByTestId("setting-edit-Booking.HoldMinutes").click();
    await admin.page.getByTestId("setting-value").fill("ten");
    await admin.page.getByTestId("setting-save").click();
    await expect(admin.page.getByText("Enter a whole number.")).toBeVisible();
    await admin.ctx.close();
  });

  test("B04 roles matrix: an admin role cannot lose admin rights (last admin protection)", async ({ browser }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    await admin.page.goto("/admin/roles");
    await admin.page.getByTestId("roles-table").getByText("System Administrator").click();
    await admin.page.getByTestId("perm-Admin.Users.Edit").uncheck();
    await admin.page.getByTestId("role-save-perms").click();
    await expect(admin.page.getByTestId("error-box")).toContainText("system administrator");
    await admin.ctx.close();
  });
});

test.describe("Reservations end to end", () => {
  test("C01 customer books → ops approves → finance records payment → customer requests cancellation", async ({ browser }) => {
    const chen = await as(browser, "traveler.chen@demo.sanpu.test");
    await chen.page.goto("/tours/TW-SML-2D");
    await chen.page.getByTestId("departures-table").getByRole("link", { name: "Book" }).first().click();
    await chen.page.getByTestId("hold-submit").click();
    await expect(chen.page.getByTestId("hold-timer")).toContainText("expires in");
    await chen.page.getByTestId("book-submit").click();
    await expect(chen.page.getByText("Enter the lead traveler's name (2–100 characters).")).toBeVisible();
    await chen.page.getByTestId("book-name").fill("Chen Ya-Ting E2E");
    await chen.page.getByTestId("book-phone").fill("+886912345678");
    await chen.page.getByTestId("book-requests").fill('<img src=x onerror="alert(1)"> vegetarian');
    await chen.page.getByTestId("book-terms").check();
    let dialog = false; chen.page.on("dialog", (d) => { dialog = true; d.dismiss(); });
    await chen.page.getByTestId("book-submit").click();
    await expect(chen.page).toHaveURL(/\/my\/bookings\/\d+/);
    const id = chen.page.url().split("/").pop()!;
    await expect(chen.page.getByText('<img src=x onerror="alert(1)"> vegetarian')).toBeVisible();   // rendered as text, not HTML
    expect(dialog).toBe(false);
    expect(sql("SanpuErp_E2E", `SELECT CONCAT(Status,'|',IIF(LeadPhoneEnc IS NULL,'plain','enc'),'|',IIF(CHARINDEX('912345678', LeadPhoneMasked) > 0,'leak','masked')) FROM dbo.Bookings WHERE BookingId = ${id}`)).toBe("Pending|enc|masked");

    const ops = await as(browser, "ops.manager@demo.sanpu.test");
    await ops.page.goto(`/admin/bookings/${id}`);
    await expect(ops.page.getByTestId("phone-value")).toHaveText("+886 9•• ••• 678");
    await ops.page.getByTestId("reveal-pii").click();
    await expect(ops.page.getByTestId("phone-value")).toHaveText("+886912345678");
    await ops.page.getByTestId("approve").click();
    await ops.page.getByTestId("confirm-yes").click();
    await expect(ops.page.getByTestId("approval-history")).toContainText("Approved");
    expect(sql("SanpuErp_E2E", `SELECT Status FROM dbo.Bookings WHERE BookingId = ${id}`)).toBe("Confirmed");
    expect(sql("SanpuErp_E2E", `SELECT COUNT(*) FROM dbo.AuditLogs WHERE Action = 'Booking.PiiRevealed'`)).not.toBe("0");

    const fin = await as(browser, "finance@demo.sanpu.test");
    await fin.page.goto(`/admin/bookings/${id}`);
    await fin.page.getByTestId("pay-open").click();
    await fin.page.getByTestId("pay-submit").click();
    await expect(fin.page.getByText("SIMULATED BankTransfer")).toBeVisible();
    expect(sql("SanpuErp_E2E", `SELECT PaymentStatus FROM dbo.Bookings WHERE BookingId = ${id}`)).toBe("Paid");

    await chen.page.reload();
    await expect(chen.page.getByTestId("booking-history")).toContainText("Confirmed");
    await chen.page.getByTestId("cancel-submit").click();
    await chen.page.getByTestId("confirm-yes").click();
    await expect(chen.page.getByTestId("booking-history")).toContainText("CancelRequested");
    for (const c of [chen, ops, fin]) await c.ctx.close();
  });

  test("C02 the final seat goes to exactly one of two simultaneous buyers", async ({ request }) => {
    const chenT = await token(request, "erp", "traveler.chen@demo.sanpu.test");
    const leeT = await token(request, "erp", "traveler.lee@demo.sanpu.test");
    const tour = await (await request.get("/api/v1/catalog/tours/TW-TNN-2D")).json();
    const dep = tour.departures.find((d: any) => d.seatsLeft === 1);
    expect(dep, "seed has a 3-seat departure with 1 seat left").toBeTruthy();
    const [a, b] = await Promise.all([chenT, leeT].map((t, i) => request.post("/api/v1/bookings/holds", { headers: bearer(t), data: { departureId: dep.departureId, pax: 1, idempotencyKey: `race-e2e-${i}-${Date.now()}` } })));
    expect([a.status(), b.status()].sort()).toEqual([201, 409]);
    const loser = a.status() === 409 ? a : b;
    expect((await loser.json()).code).toBe("insufficient_capacity");
  });

  test("C03 no IDOR, no privilege escalation, no forged tokens", async ({ request }) => {
    const leeT = await token(request, "erp", "traveler.lee@demo.sanpu.test");
    const chenBooking = sql("SanpuErp_E2E", "SELECT TOP 1 b.BookingId FROM dbo.Bookings b JOIN dbo.Users u ON u.UserId = b.CustomerUserId WHERE u.NormalizedEmail = 'traveler.chen@demo.sanpu.test'");
    expect((await request.get(`/api/v1/my/bookings/${chenBooking}`, { headers: bearer(leeT) })).status()).toBe(404);
    expect((await request.get("/api/v1/admin/users", { headers: bearer(leeT) })).status()).toBe(403);
    expect((await request.post(`/api/v1/ops/bookings/${chenBooking}/decision`, { headers: bearer(leeT), data: { decision: "Approved" } })).status()).toBe(403);
    expect((await request.get("/api/v1/ops/bookings")).status()).toBe(401);
    const forged = leeT.slice(0, -4) + (leeT.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect((await request.get("/api/v1/auth/me", { headers: bearer(forged) })).status()).toBe(401);
    const agentT = await token(request, "erp", "agent@demo.sanpu.test");
    const grant = await request.put("/api/v1/admin/roles/1/permissions", { headers: bearer(agentT), data: { ids: [1, 2, 3] } });
    expect(grant.status()).toBe(403);
    const inj = await request.get("/api/v1/ops/bookings", { headers: bearer(await token(request, "erp", "ops.manager@demo.sanpu.test")), params: { search: "' OR 1=1; DROP TABLE dbo.Bookings; --" } });
    expect(inj.status()).toBe(200);
    expect((await inj.json()).items).toEqual([]);
  });
});

test.describe("Operations modules", () => {
  test("D01 supplier webhook: signed mock event is processed once, duplicate is detected", async ({ browser }) => {
    const ops = await as(browser, "ops.manager@demo.sanpu.test");
    await ops.page.goto("/admin/integrations");
    const key = `e2e-${Date.now()}`;
    await ops.page.getByTestId("mock-key").fill(key);
    await ops.page.getByTestId("mock-send").click();
    await expect(ops.page.getByTestId("mock-result")).toContainText("accepted");
    await ops.page.getByTestId("mock-send").click();
    await expect(ops.page.getByTestId("mock-result")).toContainText("duplicate");
    expect(sql("SanpuErp_E2E", `SELECT CONCAT(Status,'|',DuplicateCount) FROM dbo.IntegrationEvents WHERE IdempotencyKey = '${key}'`)).toBe("Processed|1");
    await ops.ctx.close();
  });

  test("D02 unsigned or badly signed webhooks are refused", async ({ request }) => {
    const r = await request.post(`${API}/api/v1/integrations/webhooks/SUP-HTL-01`, {
      headers: { "X-Sanpu-Timestamp": String(Math.floor(Date.now() / 1000)), "X-Sanpu-Signature": "00".repeat(32), "X-Idempotency-Key": "forged-1" },
      data: { eventType: "statement.issued", data: { period: "2026-12", amount: 1 } }
    });
    expect(r.status()).toBe(401);
    expect((await r.json()).code).toBe("invalid_signature");
  });

  test("D03 reconciliation finds the seeded mismatch; accepting it needs a note", async ({ browser }) => {
    const fin = await as(browser, "finance@demo.sanpu.test");
    await fin.page.goto("/admin/reconciliation");
    await fin.page.getByTestId("recon-period").fill(seedPeriod);
    await fin.page.getByTestId("recon-run").click();
    await expect(fin.page.getByTestId("recon-table")).toContainText("Mismatch");
    await fin.page.getByTestId("recon-accept-SUP-BUS-01").click();
    await fin.page.getByTestId("recon-confirm").click();
    await expect(fin.page.getByText("Explain why the difference is accepted.")).toBeVisible();
    await fin.page.getByTestId("recon-note").fill("Fuel surcharge agreed by phone (E2E)");
    await fin.page.getByTestId("recon-confirm").click();
    await expect(fin.page.getByTestId("recon-table")).toContainText("Accepted");
    await fin.ctx.close();
  });

  test("D04 group simulation saves a draft plan and needs another approver", async ({ browser }) => {
    const ops = await as(browser, "ops.manager@demo.sanpu.test");
    await ops.page.goto("/admin/group-sim");
    await ops.page.getByTestId("sim-departure").selectOption({ index: 1 });
    await ops.page.getByTestId("sim-run").click();
    await expect(ops.page.getByTestId("sim-options").locator("tbody tr").first()).toBeVisible();
    await ops.page.getByTestId("sim-submit").click();
    await expect(ops.page.getByTestId("plans-table")).toContainText("Submitted");
    await ops.page.goto("/admin/approvals");
    await expect(ops.page.getByTestId("inbox-table")).toContainText("your request");
    await ops.ctx.close();
  });

  test("D05 workflow designer validates and saves a new version", async ({ browser }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    await admin.page.goto("/admin/workflows");
    await admin.page.getByTestId("wf-edit-refund.approval").click();
    await admin.page.getByTestId("wf-save").click();
    await expect(admin.page.getByText("Refund approval · v2")).toBeVisible();
    await admin.ctx.close();
  });

  test("D06 audit log filters by entity", async ({ browser }) => {
    const admin = await as(browser, "admin@demo.sanpu.test");
    await admin.page.goto("/admin/audit");
    await admin.page.getByTestId("audit-entity").selectOption("Booking");
    await admin.page.getByTestId("audit-search").click();
    const actions = await admin.page.getByTestId("audit-table").locator("tbody tr td:nth-child(3)").allTextContents();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.startsWith("Booking.") || a.startsWith("Payment.") || a.startsWith("Refund."))).toBe(true);
    await admin.ctx.close();
  });
});

test.describe("Quality gates", () => {
  test("E01 responsive: no sideways scrolling on phone width; labelled controls", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:3201", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByTestId("tour-cards")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectLabelledControls(page);
    await login(page, "erp", "ops.manager@demo.sanpu.test");
    for (const p of ["/admin", "/admin/bookings", "/admin/departures", "/admin/integrations"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("brand")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("user-name")).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await ctx.close();
  });

  test("E02 empty and error states render; unknown pages 404", async ({ page }) => {
    await login(page, "erp", "ops.manager@demo.sanpu.test");
    await page.goto("/admin/bookings");
    await page.getByTestId("bookings-search").fill("no-such-booking-zzz");
    await expect(page.getByTestId("empty")).toBeVisible();
    await page.goto("/admin/bookings/999999");
    await expect(page.getByTestId("error-box")).toContainText("not found");
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("E03 Swagger UI and OpenAPI with the Bearer scheme", async ({ request }) => {
    expect((await request.get(`${API}/swagger/index.html`)).status()).toBe(200);
    const spec = await (await request.get(`${API}/openapi/v1.json`)).json();
    expect(spec.components.securitySchemes.Bearer.scheme).toBe("bearer");
    expect(Object.keys(spec.paths)).toContain("/api/v1/auth/login");
    expect(Object.keys(spec.paths)).toContain("/api/v1/bookings/holds");
  });
});
