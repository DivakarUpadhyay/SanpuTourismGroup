// Measures what a visitor sees on every click on the live sites: full page reloads, how long loading placeholders stay on
// screen, layout jumps, blank time and the API calls behind each page. Usage: node tools/ui-smoothness.mjs [erpBase] [aiBase]
import { chromium } from "playwright";
import fs from "node:fs";

const [ERP = "https://sanpu-travel.vercel.app", AI = "https://sanpu-trip-copilot.vercel.app"] = process.argv.slice(2);
const PW = "Welcome@Sanpu2026";
const b = await chromium.launch({ channel: "chrome", headless: true });

const probe = () => {
  const s = (window.__ux = { skeletonMs: 0, skeletonShows: 0, shift: 0, since: null, docId: window.__ux?.docId ?? Math.random() });
  const busy = () => [...document.querySelectorAll(".skeleton")].some((e) => Number(getComputedStyle(e).opacity) > 0.05);   // only what the eye can see
  let on = false, t0 = 0;
  const tick = () => { const now = !!busy(); if (now && !on) { on = true; t0 = performance.now(); s.skeletonShows++; } if (!now && on) { on = false; s.skeletonMs += performance.now() - t0; } requestAnimationFrame(tick); };
  tick();
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) s.shift += e.value; }).observe({ type: "layout-shift", buffered: false });
  s.reset = () => { s.skeletonMs = 0; s.skeletonShows = on ? 1 : 0; t0 = performance.now(); s.shift = 0; };
  s.read = () => ({ skeletonMs: Math.round(s.skeletonMs + (on ? performance.now() - t0 : 0)), skeletonShows: s.skeletonShows, shift: +s.shift.toFixed(3) });
};

async function walk(label, base, loginPath, email, routes) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(probe);
  const p = await ctx.newPage();
  let docLoads = 0, api = [];
  const started = new Map();
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) docLoads += 0; });
  p.on("request", (r) => { if (r.isNavigationRequest() && r.frame() === p.mainFrame()) docLoads++; if (r.url().includes("/api/v1/")) started.set(r, Date.now()); });
  p.on("requestfinished", (r) => { if (started.has(r)) api.push({ url: r.url().replace(/^.*\/api\/v1/, ""), ms: Date.now() - started.get(r) }); });
  if (email) { await p.goto(base + loginPath); await p.getByTestId("login-email").fill(email); await p.getByTestId("login-password").fill(PW); await p.getByTestId("login-submit").click(); await p.locator(".sidebar a").first().waitFor({ timeout: 30000 }).catch(() => {}); await p.waitForTimeout(800); }
  else { await p.goto(base + routes[0]); await p.locator(`a[href="${routes[1]}"]`).first().waitFor({ state: "attached", timeout: 30000 }).catch(() => {}); await p.waitForTimeout(800); }
  if (email && !(await p.locator(".sidebar a").count())) console.log(`${label}: sign-in did not reach the admin panel (${p.url()})`);
  const rows = [];
  for (const round of [1, 2]) for (const route of routes) {
    const link = p.locator(`a[href="${route}"]`).first();
    if (!(await link.count())) { rows.push({ label, round, route, missing: true }); continue; }
    await p.evaluate(() => window.__ux.reset()); api = []; docLoads = 0;
    const t = Date.now();
    await link.evaluate((a) => a.click());
    await p.waitForURL((u) => u.pathname === route, { timeout: 15000 }).catch(() => {});
    const urlMs = Date.now() - t;
    await p.waitForFunction(() => !document.querySelector(".skeleton, [aria-busy=true]") && document.querySelector("main")?.innerText.trim().length > 20, null, { timeout: 20000 }).catch(() => {});
    const readyMs = Date.now() - t;
    await p.waitForTimeout(700);
    const ux = await p.evaluate(() => window.__ux.read());
    const dup = api.length - new Set(api.map((x) => x.url)).size;
    rows.push({ label, round, route, urlMs, readyMs, ...ux, fullReload: docLoads > 0, apiCalls: api.length, duplicateCalls: dup, slowestApiMs: Math.max(0, ...api.map((x) => x.ms)), slowest: api.sort((a, b) => b.ms - a.ms)[0]?.url });
  }
  await ctx.close();
  return rows;
}

const all = [
  ...(await walk("Travel visitor", ERP, null, null, ["/tours", "/hotels", "/flights", "/deals", "/news", "/blog", "/help"])),
  ...(await walk("Travel admin", ERP, "/admin/login", "admin@demo.sanpu.test", ["/admin/bookings", "/admin/tours", "/admin/payments", "/admin/service-bookings", "/admin/users", "/admin"])),
  ...(await walk("AI admin", AI, "/admin/login", "admin@demo.sanpu.test", ["/admin/trips", "/admin/proposals", "/admin/reservations", "/admin/users", "/admin"])),
];
await b.close();
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/ui-smoothness.json", JSON.stringify(all, null, 1));
const ok = all.filter((r) => !r.missing);
const avg = (l, k) => Math.round(l.reduce((a, r) => a + (r[k] ?? 0), 0) / (l.length || 1));
for (const round of [1, 2]) { const l = ok.filter((r) => r.round === round); console.log(`Visit ${round}: ${l.length} clicks | ready avg ${avg(l, "readyMs")} ms, worst ${Math.max(...l.map((r) => r.readyMs))} ms | placeholder on screen avg ${avg(l, "skeletonMs")} ms, on ${l.filter((r) => r.skeletonShows > 0).length} clicks | full reloads ${l.filter((r) => r.fullReload).length} | layout jump avg ${(l.reduce((a, r) => a + r.shift, 0) / l.length).toFixed(3)} | duplicate API calls ${l.reduce((a, r) => a + r.duplicateCalls, 0)}`); }
console.log("\nSlowest clicks:"); for (const r of [...ok].sort((a, b) => b.readyMs - a.readyMs).slice(0, 8)) console.log(` ${r.label} ${r.route} (visit ${r.round}): ready ${r.readyMs} ms, placeholder ${r.skeletonMs} ms, jump ${r.shift}, api ${r.apiCalls}, slowest ${r.slowestApiMs} ms ${r.slowest ?? ""}`);
const miss = all.filter((r) => r.missing); if (miss.length) console.log("Links not found:", [...new Set(miss.map((r) => r.route))].join(", "));
