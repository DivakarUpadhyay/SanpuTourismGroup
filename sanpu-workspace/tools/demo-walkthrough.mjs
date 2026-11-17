// Visible Chrome walkthrough of both apps (Playwright drives your installed Google Chrome, slowly, so you can watch).
// Needs the dev stack running: APIs on 5101/5102 and web apps on 3101/3102 (see README / scripts).
// Usage: node tools/demo-walkthrough.mjs            (the window stays open at the end; close it when you are done)
import { chromium } from "playwright";
import fs from "node:fs";

const pw = (file, email) => fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(email + ","))?.split(",")[1];
const ERP = "http://localhost:3101", AI = "http://localhost:3102";
const erpPw = (e) => pw("tour-operations/LOGINS.local.txt", e), aiPw = (e) => pw("ai-travel/LOGINS.local.txt", e);

const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 350, args: ["--start-maximized"] });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const pause = (ms = 1800) => page.waitForTimeout(ms);
const banner = async (text) => {
  await page.evaluate((t) => {
    let b = document.getElementById("demo-banner");
    if (!b) { b = document.createElement("div"); b.id = "demo-banner"; document.body.appendChild(b); }
    Object.assign(b.style, { position: "fixed", left: "50%", top: "62px", transform: "translateX(-50%)", zIndex: 9999, background: "rgba(2,67,136,.94)", color: "#fff",
      padding: "8px 16px", borderRadius: "8px", font: "600 14px Segoe UI, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.25)", pointerEvents: "none" });
    b.textContent = t;
  }, text).catch(() => {});
};
const go = async (url, text, wait = 2200) => { await page.goto(url); await page.locator("h1").first().waitFor().catch(() => {}); await banner(text); await pause(wait); };
const login = async (base, email, password, text) => {
  await page.goto(base + "/login"); await banner(text);
  await page.getByTestId("login-email").fill(email); await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click(); await page.getByTestId("user-name").waitFor(); await pause(1200);
};
const logout = async () => { await page.getByTestId("logout").click(); await page.waitForURL(/\/login/); };

try {
  // ---------------- App A · Tour Operations ERP ----------------
  await go(ERP + "/", "App A · Tour Operations ERP: customer home (tours, images and texts come from SQL Server)", 3500);
  await page.mouse.wheel(0, 500); await pause();
  await go(ERP + "/tours/TW-ERV-3D", "Tour detail with live seats left per departure");
  await login(ERP, "traveler.chen@demo.sanpu.test", erpPw("traveler.chen@demo.sanpu.test"), "Sign in as a fictional customer");
  await go(ERP + "/tours/TW-SML-2D", "Book a departure: seats are held atomically for 15 minutes");
  await page.getByTestId("departures-table").getByRole("link", { name: "Book" }).first().click();
  await page.getByTestId("hold-submit").click(); await pause();
  await page.getByTestId("book-name").fill("Chen Ya-Ting (walkthrough)"); await page.getByTestId("book-phone").fill("+886912345678");
  await page.getByTestId("book-terms").check(); await banner("Phone is encrypted at rest and shown masked to staff"); await pause();
  await page.getByTestId("book-submit").click(); await page.waitForURL(/\/my\/bookings\/\d+/);
  const bookingId = page.url().split("/").pop();
  await banner("Booking is Pending until a staff member approves it"); await pause(2500);
  await logout();

  await login(ERP, "ops.manager@demo.sanpu.test", erpPw("ops.manager@demo.sanpu.test"), "Sign in as the operations manager");
  await go(ERP + "/admin", "Operations dashboard: real SQL aggregates", 3000);
  await go(ERP + `/admin/bookings/${bookingId}`, "Approve the booking through the workflow engine");
  await page.getByTestId("approve").click(); await page.getByTestId("confirm-yes").click(); await pause(2500);
  for (const [p, t] of [["/admin/approvals", "Approval inbox (routing stored as data)"], ["/admin/departures", "Departures and capacity"], ["/admin/group-sim", "Group assembly & profitability simulation"],
    ["/admin/integrations", "Signed supplier webhooks: idempotent, retried, dead-lettered"], ["/admin/tasks", "Task queue with SLAs"]]) await go(ERP + p, t);
  await logout();

  await login(ERP, "admin@demo.sanpu.test", erpPw("admin@demo.sanpu.test"), "Sign in as the system administrator");
  for (const [p, t] of [["/admin/users", "Users & onboarding (invitations, no admin-set passwords)"], ["/admin/roles", "Roles & permission matrix (anti-escalation)"],
    ["/admin/menus", "Menu tree stored in SQL: reorder, permissions, cycle checks"], ["/admin/settings", "Typed settings: changes reach the site without a rebuild"], ["/admin/audit", "Insert-only audit log"]]) await go(ERP + p, t);

  // phone width: drawer navigation
  await page.setViewportSize({ width: 390, height: 844 }); await go(ERP + "/admin/bookings", "Phone width: navigation becomes a drawer");
  await page.locator(".menu-toggle").click(); await pause(2000); await page.locator(".menu-toggle").click(); await pause(800);
  await ctx.close().catch(() => {});

  // ---------------- App B · AI Operations Copilot ----------------
  const ctx2 = await browser.newContext({ viewport: null });
  const p2 = await ctx2.newPage();
  const page2 = p2;
  const go2 = async (url, text, wait = 2200) => { await page2.goto(url); await page2.locator("h1").first().waitFor().catch(() => {}); await page2.evaluate((t) => {
    const b = document.createElement("div"); b.id = "demo-banner"; document.body.appendChild(b);
    Object.assign(b.style, { position: "fixed", left: "50%", top: "62px", transform: "translateX(-50%)", zIndex: 9999, background: "rgba(126,125,168,.95)", color: "#fff", padding: "8px 16px", borderRadius: "8px", font: "600 14px Segoe UI, sans-serif", pointerEvents: "none" });
    b.textContent = t; }, text).catch(() => {}); await page2.waitForTimeout(wait); };
  const login2 = async (email, password) => { await page2.goto(AI + "/login"); await page2.getByTestId("login-email").fill(email); await page2.getByTestId("login-password").fill(password);
    await page2.getByTestId("login-submit").click(); await page2.getByTestId("user-name").waitFor(); };

  await login2("traveler.chen@demo.sanpu.test", aiPw("traveler.chen@demo.sanpu.test"));
  await go2(AI + "/my/trips", "App B · AI Copilot: a traveler's trips", 3000);
  await go2(AI + "/trips/1", "Itinerary with versions (recoveries create new versions)", 3000);
  await page2.getByTestId("logout").click(); await page2.waitForURL(/\/login/);
  await login2("supervisor@demo.sanpu.test", aiPw("supervisor@demo.sanpu.test"));
  for (const [p, t] of [["/admin", "Copilot dashboard (AI status, costs, evaluations)"], ["/admin/trips/3", "Simulate a disruption on a trip"], ["/admin/proposals", "Recovery proposals wait for a human decision"],
    ["/admin/documents", "Document intake: PII redacted, fields extracted with confidence"], ["/admin/scenarios", "Disruption scenarios are data"]]) await go2(AI + p, t);
  await page2.getByTestId("logout").click(); await page2.waitForURL(/\/login/);
  await login2("ai.engineer@demo.sanpu.test", aiPw("ai.engineer@demo.sanpu.test"));
  await go2(AI + "/admin/evals", "Evaluation suite: accuracy, grounding, injection, permission leaks");
  await page2.getByTestId("eval-run").click(); await page2.waitForTimeout(3500);
  await go2(AI + "/admin/ai", "AI settings and versioned prompts (the API key is never shown)", 3000);

  await page2.evaluate(() => { const b = document.getElementById("demo-banner"); if (b) b.textContent = "Walkthrough finished. Explore freely, then close this window."; });
  console.log("Walkthrough finished. The Chrome window stays open until you close it.");
  await new Promise((resolve) => browser.on("disconnected", resolve));
} catch (e) {
  console.error("Walkthrough stopped:", e.message);
  await new Promise((resolve) => browser.on("disconnected", resolve));
}
