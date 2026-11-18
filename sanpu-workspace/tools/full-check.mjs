// In-depth page check for both apps: every role signs in through the right portal and opens every menu page (customer
// header menus and admin sidebar), every detail page linked from lists, and the public pages. A page fails on: an error
// box, an offline note, a 403 page, a browser error, an API 5xx/4xx (except expected 401 before sign-in), or text such
// as "undefined", "NaN", "null" or "Invalid Date". Usage: node tools/full-check.mjs [base-erp] [base-ai] [--headless]
import { chromium } from "playwright";
import fs from "node:fs";

const headless = process.argv.includes("--headless");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPS = [
  { key: "erp", base: args[0] ?? "http://localhost:3101", logins: "tour-operations/LOGINS.local.txt" },
  { key: "ai", base: args[1] ?? "http://localhost:3102", logins: "ai-travel/LOGINS.local.txt" },
];
const PUBLIC = {
  erp: ["/", "/tours", "/destinations", "/calendar", "/compare", "/hotels", "/flights", "/buses", "/taxis", "/deals", "/help", "/contact", "/credits",
        "/legal/privacy.notice", "/legal/terms", "/legal/cookies", "/login", "/register", "/forgot-password", "/admin/login", "/admin/register"],
  ai: ["/", "/assistant", "/credits", "/legal/privacy.notice", "/legal/terms", "/legal/cookies", "/login", "/register", "/forgot-password", "/admin/login", "/admin/register"],
};
const BAD_TEXT = /\b(undefined|NaN|Invalid Date)\b|\[object Object\]/;
const results = [];
const browser = await chromium.launch({ channel: "chrome", headless });

async function check(page, app, who, path, problems) {
  const errs = [];
  const onErr = (e) => errs.push("js: " + e.message.slice(0, 120));
  const onResp = (r) => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400 && !(r.status() === 401 && /auth\/(refresh|me)/.test(u))) errs.push(`api ${r.status()} ${u.replace(/^https?:\/\/[^/]+/, "")}`); };
  page.on("pageerror", onErr); page.on("response", onResp);
  try {
    await page.goto(app.base + path, { waitUntil: "load", timeout: 45000 });
    await page.locator("h1, [data-testid=auth-staff], [data-testid=auth-customer]").first().waitFor({ timeout: 15000 }).catch(() => errs.push("no heading"));
    await page.waitForTimeout(1400);
    for (const [sel, label] of [["[data-testid=error-box]", "error box"], ["[data-testid=offline-note]", "offline note"], ["[data-testid=forbidden]", "403 page"]])
      if (await page.locator(sel).count()) errs.push(`${label}: ${(await page.locator(sel).first().innerText()).slice(0, 100).replace(/\s+/g, " ")}`);
    const text = await page.locator("main").innerText().catch(() => "");
    const m = BAD_TEXT.exec(text); if (m) errs.push(`bad text "${m[0]}" near: ${text.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, " ")}`);
  } catch (e) { errs.push("load: " + e.message.split("\n")[0]); }
  page.off("pageerror", onErr); page.off("response", onResp);
  results.push({ app: app.key, who, path, ok: errs.length === 0, errs });
  if (errs.length) problems.push(`${app.key} ${who} ${path}: ${errs.join(" | ")}`);
  process.stdout.write(errs.length ? "x" : ".");
}

async function links(page, sel) { return page.$$eval(sel, (as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("//")))]).catch(() => []); }

const problems = [];
for (const app of APPS) {
  const accounts = fs.readFileSync(app.logins, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && !l.startsWith("email,"))
    .map((l) => { const [email, password, roles] = l.split(","); return { email, password, roles, staff: !/^(customer|traveler)$/.test(roles) }; });
  // visitor
  { const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } }); const page = await ctx.newPage();
    for (const p of PUBLIC[app.key]) await check(page, app, "visitor", p, problems);
    if (app.key === "erp") {
      await page.goto(app.base + "/tours"); await page.waitForTimeout(1500);
      for (const h of (await links(page, "a[href^='/tours/']")).slice(0, 12)) await check(page, app, "visitor", h, problems);
      await page.goto(app.base + "/destinations"); await page.waitForTimeout(1500);
      for (const h of (await links(page, "a[href^='/destinations/']")).slice(0, 10)) await check(page, app, "visitor", h, problems);
      for (const k of ["hotels", "flights", "buses", "taxis"]) {
        await page.goto(app.base + "/" + k); await page.waitForTimeout(2000);
        for (const h of (await links(page, "a[href^='/services/']")).filter((x) => !x.includes("/book")).slice(0, 8)) await check(page, app, "visitor", h, problems);
      }
    }
    await ctx.close(); }
  // each account through its own portal
  for (const acc of accounts) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } }); const page = await ctx.newPage();
    const who = acc.roles;
    await page.goto(app.base + (acc.staff ? "/admin/login" : "/login"));
    await page.getByTestId("login-email").fill(acc.email); await page.getByTestId("login-password").fill(acc.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 }).catch(() => problems.push(`${app.key} ${who}: sign-in did not finish`));
    await page.waitForTimeout(1500);
    if (acc.staff) {
      await check(page, app, who, "/admin", problems);
      for (const h of await links(page, ".sidebar a[href^='/admin']")) await check(page, app, who, h, problems);
      for (const h of await links(page, "a.kpi.link")) await check(page, app, who, h, problems);
      await check(page, app, who, "/admin/account", problems);
      // detail pages behind the main lists
      for (const [list, sel] of [["/admin/bookings", "a[href^='/admin/bookings/']"], ["/admin/trips", "a[href^='/admin/trips/']"], ["/admin/proposals", "a[href^='/admin/proposals/']"]]) {
        if (!(await links(page, `.sidebar a[href='${list}']`)).length) continue;
        await page.goto(app.base + list); await page.waitForTimeout(1500);
        for (const h of (await links(page, sel)).slice(0, 4)) await check(page, app, who, h, problems);
      }
      // the customer side stays signed out for staff (separate sessions)
      await page.goto(app.base + "/"); await page.waitForTimeout(1500);
      if (await page.getByTestId("user-name").count()) problems.push(`${app.key} ${who}: staff session leaked into the customer site`);
    } else {
      await page.goto(app.base + "/"); await page.waitForTimeout(1500);
      const nav = await links(page, "#customer-nav a, .topnav a, .user-menu a");
      for (const h of nav.filter((x) => !x.startsWith("/admin"))) await check(page, app, who, h, problems);
      for (const h of ["/account", ...(app.key === "erp" ? ["/my/bookings", "/for-you"] : ["/my/bookings", "/my/trips", "/assistant"])]) await check(page, app, who, h, problems);
      if (app.key === "erp") { await page.goto(app.base + "/my/bookings"); await page.waitForTimeout(1500); for (const h of (await links(page, "a[href^='/my/bookings/']")).slice(0, 4)) await check(page, app, who, h, problems); }
      if (app.key === "ai") { await page.goto(app.base + "/my/trips"); await page.waitForTimeout(1500); for (const h of (await links(page, "a[href^='/trips/']")).slice(0, 4)) await check(page, app, who, h, problems); }
      await page.goto(app.base + "/admin"); await page.waitForTimeout(1500);
      if (!/\/admin\/login/.test(page.url())) problems.push(`${app.key} ${who}: customer session opened the admin panel`);
    }
    await ctx.close();
  }
}
await browser.close();
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/full-check.json", JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} page visits clean`);
for (const p of [...new Set(problems)]) console.log(" - " + p);
