// Captures the standalone snapshot: signs in as every account (and as a visitor), walks every reachable page in Chrome,
// and records each GET /api/v1 response. Output: <app>/frontend/public/snapshot/<prefix>.json (no passwords inside).
// Needs the local stack running (web 3101/3102 + APIs). Usage: node tools/snapshot.mjs erp|ai
import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";

const app = process.argv[2] ?? "erp";
const cfg = app === "erp"
  ? { api: "http://localhost:5101/api/v1", base: "http://localhost:3101", logins: "tour-operations/LOGINS.local.txt", out: "tour-operations/frontend/public/snapshot/erp.json" }
  : { api: "http://localhost:5102/api/v1", base: "http://localhost:3102", logins: "ai-travel/LOGINS.local.txt", out: "ai-travel/frontend/public/snapshot/ai.json" };
const accounts = fs.readFileSync(cfg.logins, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && !l.startsWith("email,"))
  .map((l) => { const [email, password, roles] = l.split(","); return { email, password, staff: !/^(customer|traveler)$/.test(roles ?? "") }; });
// the same hash the browser checks (standalone-auth.ts): PBKDF2-SHA256, 120k rounds; only the hash is published
const hashOf = (password) => { const salt = crypto.randomBytes(16).toString("hex"); return { salt, hash: crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex") }; };

const responses = {};       // account -> key -> body
const users = [];
const keyOf = (u) => { const url = new URL(u); const path = url.pathname.replace(/^\/api\/v1/, ""); const q = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)); return path + (q.length ? "?" + new URLSearchParams(q).toString() : ""); };

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function crawl(account) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const bucket = (responses[account?.email ?? "anon"] ??= {});
  page.on("response", async (r) => {
    try {
      if (r.request().method() !== "GET" || r.status() !== 200 || !r.url().includes("/api/v1/")) return;
      if (!(r.headers()["content-type"] ?? "").includes("json")) return;
      bucket[keyOf(r.url())] = await r.json();
    } catch { /* body gone (navigation) */ }
  });
  const visit = async (path, wait = 1400) => {
    try { await page.goto(cfg.base + path, { waitUntil: "load", timeout: 45000 }); await page.locator("h1").first().waitFor({ timeout: 15000 }).catch(() => {}); await page.waitForTimeout(wait); }
    catch (e) { console.log("  skip", path, e.message.split("\n")[0]); }
  };
  const got = (key) => bucket[key] ?? responses.anon?.[key];

  if (account) {
    await visit(account.staff ? "/admin/login" : "/login", 600);
    await page.getByTestId("login-email").fill(account.email); await page.getByTestId("login-password").fill(account.password);
    await page.getByTestId("login-submit").click(); await page.waitForTimeout(2500);
  }
  // customer-facing pages (every account sees them; visitors too)
  const common = app === "erp"
    ? ["/", "/tours", "/destinations", "/calendar", "/compare", "/hotels", "/flights", "/buses", "/taxis", "/deals", "/help", "/contact", "/credits", "/legal/privacy.notice", "/legal/terms", "/legal/cookies"]
    : ["/", "/credits", "/legal/privacy.notice", "/legal/terms", "/legal/cookies"];
  for (const p of common) await visit(p);
  if (app === "erp" && !account) {
    for (const t of got("/catalog/tours?pax=1") ?? []) await visit(`/tours/${t.slug ?? t.code}`);
    for (const d of got("/catalog/destinations") ?? []) await visit(`/destinations/${d.slug ?? d.code}`);
    const tours = (got("/catalog/tours?pax=1") ?? []).map((t) => t.code);
    for (let i = 0; i < tours.length; i++) for (let j = i + 1; j < tours.length; j++) await visit(`/compare?codes=${tours[i]},${tours[j]}`, 900);
    for (let m = 1; m <= 4; m++) { const d = new Date(); d.setMonth(d.getMonth() + m); await page.goto(cfg.base + "/calendar"); await page.waitForTimeout(400);
      for (let k = 0; k < m; k++) { await page.getByRole("button", { name: "Next month" }).click().catch(() => {}); await page.waitForTimeout(700); } }
    for (const kind of ["Hotel", "Flight", "Bus", "Taxi"]) {
      const key = Object.keys(responses.anon).find((k) => k.startsWith("/travel/search?") && k.includes(`kind=${kind}`));
      for (const s of (key ? responses.anon[key] : [])) await visit(`/services/${s.slug ?? s.code}`, 1200);
    }
  }
  if (account) {
    const me = bucket["/auth/me"];
    if (me) users.push({ email: me.user.email, displayName: me.user.displayName, userType: me.user.userType, roles: me.roles, ...hashOf(account.password) });
    // booking pages of every departure (customers)
    if (app === "erp" && !account.staff)
      for (const t of responses.anon["/catalog/tours?pax=1"] ?? []) {
        const d = responses.anon[`/catalog/tours/${t.code}`];
        for (const dep of (d?.departures ?? []).slice(0, 8)) await visit(`/book/${dep.departureId}`, 900);
      }
    // own bookings / trips
    if (app === "erp") {
      await visit("/my/bookings"); await visit("/for-you"); await visit("/account");
      for (const b of bucket["/my/bookings"] ?? []) await visit(`/my/bookings/${b.bookingId}`);
    } else {
      await visit("/my/trips"); await visit("/trips/new"); await visit("/my/ask"); await visit("/account");
      for (const t of bucket["/my/trips"] ?? []) await visit(`/trips/${t.tripId}`);
    }
    // admin pages from the account's own menu
    if (me?.user.userType === "Staff") {
      await visit("/admin");
      const links = await page.$$eval(".sidebar a[href^='/admin']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]).catch(() => []);
      for (const href of links) await visit(href);
      const detail = (listKey, idField, route, max = 6) => (Object.entries(bucket).find(([k]) => k.split("?")[0] === listKey)?.[1]?.items ?? Object.entries(bucket).find(([k]) => k.split("?")[0] === listKey)?.[1] ?? [])
        .slice?.(0, max).map((x) => `${route}/${x[idField]}`) ?? [];
      const extra = app === "erp" ? detail("/ops/bookings", "bookingId", "/admin/bookings") : [...detail("/aiops/trips", "tripId", "/admin/trips"), ...detail("/aiops/proposals", "proposalId", "/admin/proposals")];
      for (const p of extra) await visit(p);
    }
  }
  await ctx.close();
}

// public data straight from the API: every departure and every hotel / flight / bus / taxi detail page
async function apiData() {
  responses.anon ??= {};
  const j = async (p, headers = {}) => { const r = await fetch(cfg.api + p, { headers }); return r.ok ? r.json() : null; };
  if (app === "erp") {
    const admin = accounts.find((a) => /^admin@/.test(a.email));
    const login = await fetch(cfg.api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Realm": "admin" }, body: JSON.stringify({ email: admin.email, password: admin.password }) }).then((r) => r.json());
    const services = (await j("/ops/services", { Authorization: `Bearer ${login.accessToken}`, "X-Session-Realm": "admin" })) ?? [];
    for (const s of services.items ?? services)
      for (const key of [s.slug, s.code].filter(Boolean)) { const d = await j(`/travel/services/${key}`); if (d) responses.anon[`/travel/services/${key}`] = d; }
    for (const t of (await j("/catalog/tours?pax=1")) ?? []) {
      const d = await j(`/catalog/tours/${t.code}`); if (!d) continue;
      responses.anon[`/catalog/tours/${t.code}`] = d; if (t.slug) responses.anon[`/catalog/tours/${t.slug}`] = d;
      for (const dep of d.departures ?? []) { const x = await j(`/catalog/departures/${dep.departureId}`); if (x) responses.anon[`/catalog/departures/${dep.departureId}`] = x; }
    }
  }
  const roles = await j("/auth/staff-roles"); if (roles) responses.anon["/auth/staff-roles"] = roles;
}
await apiData();
await crawl(null);
for (const a of accounts) { console.log("crawling as", a.email); await crawl(a); }
await browser.close();
fs.mkdirSync(cfg.out.replace(/\/[^/]+$/, ""), { recursive: true });
const snap = { capturedAt: new Date().toISOString(), users, responses };
// the preview is public: real people's emails and names never leave this computer (demo accounts use *.test)
let text = JSON.stringify(snap);
const realEmails = [...new Set(text.match(/[A-Za-z0-9._%+-]+@(?![A-Za-z0-9.-]*\.test\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])];
const realNames = new Set();
for (const pool of Object.values(responses)) JSON.stringify(pool, (k, v) => {
  if (v && typeof v === "object" && typeof v.email === "string" && realEmails.includes(v.email) && typeof v.displayName === "string") realNames.add(v.displayName);
  return v;
});
realEmails.forEach((e, i) => { text = text.split(e).join(`member${i + 1}@sanpu.test`); });
[...realNames].forEach((n, i) => { text = text.split(JSON.stringify(n)).join(JSON.stringify(`Sanpu Member ${i + 1}`)); });
text = text.replace(/[A-Za-z0-9]*+@[A-Za-z0-9.-]+.[a-z]{2,}/g, (m) => (m.endsWith(".test") ? m : "m***@sanpu.test"));   // masked addresses too
fs.writeFileSync(cfg.out, text);
if (realEmails.length) console.log(`masked ${realEmails.length} real email(s) and ${realNames.size} name(s)`);
const n = Object.values(responses).reduce((a, r) => a + Object.keys(r).length, 0);
console.log(`snapshot ${cfg.out}: ${users.length} accounts, ${n} responses, ${(fs.statSync(cfg.out).size / 1024).toFixed(0)} KB`);
