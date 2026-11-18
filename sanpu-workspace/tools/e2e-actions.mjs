// End-to-end ACTIONS on the live sites (default: the Vercel URLs). A brand-new customer signs up, books a tour and a hotel,
// sees the payment summary and goes to the ECPay sandbox; staff see the transactions; AI Travel books and pays.
// Usage: node tools/e2e-actions.mjs [erpBase] [aiBase] [--headless]
import { chromium } from "playwright";
import fs from "node:fs";

const headless = process.argv.includes("--headless");
const [ERP = "https://sanpu-travel.vercel.app", AI = "https://sanpu-trip-copilot.vercel.app"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PW = "Welcome@Sanpu2026";
const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try { const info = await fn(); results.push({ name, ok: true, info }); console.log(`PASS ${name}${info ? " · " + info : ""} (${((Date.now() - t) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push({ name, ok: false, info: e.message.split("\n")[0] }); console.log(`FAIL ${name} · ${e.message.split("\n")[0]}`); }
};
const b = await chromium.launch({ channel: "chrome", headless });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const stamp = Date.now().toString().slice(-6);
const customer = `guest${stamp}@example.com`;
const fieldFill = async (label, value) => { await p.getByLabel(label, { exact: false }).first().fill(value); };

// ---------------- Sanpu Travel ----------------
await step("ERP: customer signs up with own email and password", async () => {
  await p.goto(ERP + "/register");
  await fieldFill("Name", "Guest Traveler"); await fieldFill("Email", customer);
  await p.locator("input[type=password]").nth(0).fill("Travel2026"); await p.locator("input[type=password]").nth(1).fill("Travel2026");
  await p.getByRole("button", { name: /create account/i }).click();
  await p.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
  await p.getByTestId("user-name").waitFor({ timeout: 15000 });
  return customer;
});

let bookingUrl = "";
await step("ERP: tour booking (hold seats, traveler details, confirm)", async () => {
  await p.goto(ERP + "/tours/east-rift-valley-3d2n"); await p.locator("[data-testid=departures-table] tbody tr").first().waitFor({ timeout: 20000 });
  await p.locator("[data-testid=departures-table] a, [data-testid=departures-table] button").filter({ hasText: /book/i }).first().click();
  await p.getByTestId("hold-submit").waitFor({ timeout: 20000 });
  await p.getByTestId("hold-submit").click(); await p.getByTestId("book-name").waitFor({ timeout: 20000 });
  await p.getByTestId("book-name").fill("Guest Traveler"); await p.getByTestId("book-phone").fill("+886912345678");
  await p.getByLabel(/accept/i).check();
  await p.getByTestId("book-submit").click();
  await p.waitForURL(/\/my\/bookings\/\d+/, { timeout: 30000 }); bookingUrl = p.url();
  return new URL(bookingUrl).pathname;
});

await step("ERP: payment summary on the booking", async () => {
  await p.getByTestId("pay-deposit").or(p.getByTestId("pay-full")).first().waitFor({ timeout: 20000 });
  const text = await p.locator("main").innerText();
  if (!/total/i.test(text) || !/deposit/i.test(text)) throw new Error("summary text missing");
  return (text.match(/TWD [\d,]+/g) ?? []).slice(0, 3).join(" / ");
});

await step("ERP: pay deposit through the ECPay sandbox gateway", async () => {
  await Promise.all([p.waitForURL(/ecpay\.com\.tw/, { timeout: 45000 }), p.getByTestId("pay-deposit").click()]);
  await p.waitForLoadState("domcontentloaded");
  return "ECPay sandbox checkout opened: " + new URL(p.url()).host;
});

await step("ERP: hotel booking (search, detail, book)", async () => {
  await p.goto(ERP + "/hotels"); await p.getByTestId("svc-results").waitFor({ timeout: 30000 });
  await p.locator(".svc-card .svc-more, .svc-card a.svc-title").first().click();
  await p.waitForURL(/\/services\//, { timeout: 20000 });
  await p.getByTestId("sd-reserve").waitFor({ timeout: 30000 }); await p.waitForTimeout(800);
  await p.getByTestId("sd-reserve").click();
  await p.getByTestId("svc-name").waitFor({ timeout: 30000 });
  await p.getByTestId("svc-name").fill("Guest Traveler"); await p.getByTestId("svc-phone").fill("+886912345678");
  await p.getByLabel(/accept/i).check();
  await p.getByTestId("svc-confirm").click();
  await p.waitForURL(/my\/bookings/, { timeout: 30000 });
  await p.getByTestId("my-service-bookings").waitFor({ timeout: 20000 });
  return (await p.getByTestId("my-service-bookings").innerText()).split("\n").slice(0, 2).join(" | ").slice(0, 120);
});

// staff
const s = await ctx.newPage();
await step("ERP admin: sign in (separate session) and open Payments & transactions", async () => {
  await s.goto(ERP + "/admin/login"); await s.getByTestId("login-email").fill("admin@demo.sanpu.test"); await s.getByTestId("login-password").fill(PW); await s.getByTestId("login-submit").click();
  await s.waitForURL(/\/admin$/, { timeout: 20000 });
  await s.goto(ERP + "/admin/payments"); await s.getByTestId("payments").waitFor({ timeout: 20000 });
  const first = await s.locator("[data-testid=payments] tbody tr").first().innerText();
  if (!first.includes("Guest Traveler") && !first.includes(customer)) throw new Error("new transaction not at the top: " + first.slice(0, 80));
  return first.replace(/\s+/g, " ").slice(0, 140);
});
await step("ERP admin: customer session still signed in (no mixing)", async () => {
  await p.goto(ERP + "/"); await p.getByTestId("user-name").waitFor({ timeout: 15000 });
  return await p.getByTestId("user-name").innerText();
});
await step("ERP admin: Excel and PDF downloads", async () => {
  const out = [];
  for (const k of ["xlsx", "pdf"]) { const [d] = await Promise.all([s.waitForEvent("download", { timeout: 30000 }), s.getByTestId(`export-${k}`).first().click()]); out.push(d.suggestedFilename()); }
  return out.join(", ");
});
await step("ERP admin: dashboard numbers open their pages", async () => {
  await s.goto(ERP + "/admin"); await s.locator("a.kpi.link").first().waitFor({ timeout: 20000 });
  const n = await s.locator("a.kpi.link").count(); await s.locator("a.kpi.link").first().click(); await s.waitForTimeout(1500);
  return `${n} clickable numbers; first opened ${new URL(s.url()).pathname}`;
});
await step("ERP: News and blog pages", async () => {
  await p.goto(ERP + "/news"); await p.locator(".st-card").first().waitFor({ timeout: 20000 });
  await p.goto(ERP + "/blog"); await p.locator(".st-card h3 a").first().click(); await p.locator(".st-body").waitFor({ timeout: 20000 });
  return await p.locator("h1").innerText();
});

// ---------------- AI Travel ----------------
const a = await ctx.newPage();
await step("AI: customer signs up", async () => {
  await a.goto(AI + "/register");
  await a.getByLabel("Name", { exact: false }).first().fill("Guest Traveler"); await a.getByLabel("Email", { exact: false }).first().fill(customer);
  await a.locator("input[type=password]").nth(0).fill("Travel2026"); await a.locator("input[type=password]").nth(1).fill("Travel2026");
  await a.getByRole("button", { name: /create account/i }).click(); await a.getByTestId("user-name").waitFor({ timeout: 20000 });
  return customer;
});
await step("AI: assistant finds hotels and Book this prepares a booking", async () => {
  await a.goto(AI + "/assistant"); await a.getByTestId("chat-input").waitFor({ timeout: 20000 });
  await a.getByTestId("chat-input").fill("Find a hotel in Kinmen"); await a.getByTestId("chat-send").click();
  await a.locator(".as-row").first().waitFor({ timeout: 60000 });
  await a.locator(".as-row button", { hasText: "Book this" }).first().click();
  await a.getByTestId("pay-deposit").last().waitFor({ timeout: 30000 });
  return (await a.locator(".as-booking .body > b").last().innerText());
});
await step("AI: pay deposit then balance (sandbox) → Confirmed", async () => {
  await a.getByTestId("pay-deposit").last().click(); await a.getByTestId("pay-balance").last().waitFor({ timeout: 20000 });
  await a.getByTestId("pay-balance").last().click(); await a.locator(".as-booking .pill", { hasText: "Confirmed" }).last().waitFor({ timeout: 20000 });
  return "Confirmed";
});
const sa = await ctx.newPage();
await step("AI admin: booking shows in Assistant bookings", async () => {
  await sa.goto(AI + "/admin/login"); await sa.getByTestId("login-email").fill("admin@demo.sanpu.test"); await sa.getByTestId("login-password").fill(PW); await sa.getByTestId("login-submit").click();
  await sa.waitForURL(/\/admin$/, { timeout: 20000 });
  await sa.goto(AI + "/admin/reservations"); await sa.getByTestId("reservations").waitFor({ timeout: 20000 });
  const first = await sa.locator("[data-testid=reservations] tbody tr").first().innerText();
  if (!first.includes("Guest Traveler")) throw new Error("not found: " + first.slice(0, 80));
  return first.replace(/\s+/g, " ").slice(0, 120);
});

await b.close();
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/e2e-actions.json", JSON.stringify({ at: new Date().toISOString(), erp: ERP, ai: AI, results, pageErrors: errs }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} actions passed${errs.length ? " · page errors: " + errs.slice(0, 3).join(" | ") : ""}`);
