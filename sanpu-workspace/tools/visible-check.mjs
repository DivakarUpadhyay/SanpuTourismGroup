// Visible Chrome check: walks every page of one app in your installed Chrome (headed, slow), records console errors,
// failed API calls, sideways overflow and broken images, and saves a screenshot per page.
// Usage: node tools/visible-check.mjs ai|erp [width]
import { chromium } from "playwright";
import fs from "node:fs";

const app = process.argv[2] ?? "ai";
const width = Number(process.argv[3] ?? 1440);
const base = app === "ai" ? "http://localhost:3102" : "http://localhost:3101";
const logins = app === "ai" ? "ai-travel/LOGINS.local.txt" : "tour-operations/LOGINS.local.txt";
const pw = (email) => fs.readFileSync(logins, "utf8").split(/\r?\n/).find((l) => l.startsWith(email + ","))?.split(",")[1];
const outDir = `artifacts/visible/${app}-${width}`;
fs.mkdirSync(outDir, { recursive: true });

const routes = app === "ai"
  ? { anon: ["/", "/login", "/register", "/forgot-password"],
      traveler: ["traveler.chen@demo.sanpu.test", ["/my/trips", "/trips/new", "/trips/1", "/my/ask", "/account"]],
      staff: ["admin@demo.sanpu.test", ["/admin", "/admin/trips", "/admin/trips/3", "/admin/proposals", "/admin/documents", "/admin/scenarios", "/admin/constraints",
        "/admin/templates", "/admin/search", "/admin/evals", "/admin/ai", "/admin/ai-usage", "/admin/users", "/admin/roles", "/admin/permissions", "/admin/menus",
        "/admin/settings", "/admin/content", "/admin/audit", "/admin/system"]] }
  : { anon: ["/", "/tours", "/tours/TW-ERV-3D", "/destinations", "/destinations/KINMEN", "/calendar", "/compare?codes=TW-ERV-3D,TW-SML-2D", "/hotels", "/flights", "/buses", "/taxis", "/deals", "/help", "/contact", "/legal/terms", "/login", "/register", "/forgot-password"],
      traveler: ["traveler.chen@demo.sanpu.test", ["/my/bookings", "/for-you", "/account"]],
      staff: ["admin@demo.sanpu.test", ["/admin", "/admin/bookings", "/admin/approvals", "/admin/departures", "/admin/tours", "/admin/users", "/admin/roles", "/admin/menus", "/admin/settings", "/admin/audit", "/admin/services", "/admin/service-bookings", "/admin/promotions", "/admin/coupons", "/admin/contacts", "/admin/help"]] };

const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 150 });
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const page = await ctx.newPage();
const issues = [];
let current = "";
page.on("console", (m) => { if (m.type() === "error") issues.push(`${current}: console error: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => issues.push(`${current}: page crash: ${e.message.slice(0, 200)}`));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/auth/refresh")) issues.push(`${current}: HTTP ${r.status()} ${r.request().method()} ${r.url().replace(base, "")}`); });

const visit = async (path) => {
  current = path;
  await page.goto(base + path);
  await page.locator("h1").first().waitFor({ timeout: 15000 }).catch(() => issues.push(`${path}: no page title (h1) after 15s`));
  await page.waitForLoadState("load"); await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
    errorBox: document.querySelector("[data-testid=error-box]")?.textContent?.slice(0, 160) ?? null,
    spinners: document.querySelectorAll(".skeleton, [aria-busy=true]").length
  }));
  if (r.overflow > 1) issues.push(`${path}: page scrolls sideways by ${r.overflow}px`);
  if (r.brokenImgs.length) issues.push(`${path}: broken images ${r.brokenImgs.join(", ")}`);
  if (r.errorBox) issues.push(`${path}: error shown: ${r.errorBox}`);
  if (r.spinners) issues.push(`${path}: still loading after wait (${r.spinners})`);
  await page.screenshot({ path: `${outDir}/${path === "/" ? "home" : path.slice(1).replace(/[/?=,&]/g, "_")}.png`, fullPage: true });
};
const login = async (email) => {
  current = "/login(" + email + ")";
  await page.goto(base + "/login");
  await page.getByTestId("login-email").fill(email); await page.getByTestId("login-password").fill(pw(email));
  await page.getByTestId("login-submit").click(); await page.getByTestId("user-name").waitFor({ timeout: 15000 });
};
const logout = async () => { await page.getByTestId("logout").click(); await page.waitForURL(/\/login/); };

for (const p of routes.anon) await visit(p);
await login(routes.traveler[0]); for (const p of routes.traveler[1]) await visit(p); await logout();
await login(routes.staff[0]); for (const p of routes.staff[1]) await visit(p);
await browser.close();
fs.writeFileSync(`${outDir}/issues.txt`, issues.join("\n"));
console.log(issues.length ? issues.join("\n") : "no issues found");
console.log(`screenshots: ${outDir}`);
