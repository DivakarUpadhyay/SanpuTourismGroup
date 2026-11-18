// Customer filters on every listing page + one booking of each kind (tour, hotel, flight, bus, taxi) by a new customer,
// then checks that every booking and payment shows on the admin side. Usage: node tools/e2e-filters-bookings.mjs [erpBase] [--headless]
import { chromium } from "playwright";
import fs from "node:fs";

const headless = process.argv.includes("--headless");
const [E = "https://sanpu-travel.vercel.app"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const out = [];
const step = async (name, fn) => {
  try { const info = await fn(); out.push({ name, ok: true, info }); console.log(`PASS ${name}${info ? " · " + info : ""}`); }
  catch (e) { out.push({ name, ok: false, info: e.message.split("\n")[0] }); console.log(`FAIL ${name} · ${e.message.split("\n")[0]}`); }
};
const b = await chromium.launch({ channel: "chrome", headless });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const apiErr = []; p.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) apiErr.push(`${r.status()} ${r.url()}`); });
const settle = (ms = 1500) => p.waitForTimeout(ms);
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// ---------------- filters ----------------
await step("Tours: destination filter narrows results to that destination", async () => {
  await p.goto(E + "/tours"); await p.getByTestId("tour-list").waitFor({ timeout: 30000 }); await settle();
  const all = await p.locator("[data-testid=tour-list] [data-testid^=tour-]").count();
  const opts = await p.locator("[data-testid=tours-destination] option").evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent })).filter((x) => x.v));
  const lines = [];
  for (const o of opts.slice(0, 4)) {
    await p.getByTestId("tours-destination").selectOption(o.v); await settle(1800);
    const n = await p.locator("[data-testid=tour-list] [data-testid^=tour-]").count();
    const text = n ? await p.getByTestId("tour-list").innerText() : "";
    if (n > all) throw new Error(`${o.t}: more results than unfiltered`);
    if (n && !text.toLowerCase().includes(o.t.split(/[ /]/)[0].toLowerCase())) throw new Error(`${o.t}: results do not mention the destination`);
    lines.push(`${o.t}=${n}`);
  }
  await p.getByTestId("tours-destination").selectOption(""); await settle();
  return `all=${all}; ${lines.join(", ")}`;
});
await step("Tours: travelers stepper keeps prices per group", async () => {
  await p.getByRole("button", { name: "More travelers" }).click(); await settle(1500);
  return (await p.locator("output").first().innerText());
});

for (const [kind, path] of [["Hotel", "hotels"], ["Flight", "flights"], ["Bus", "buses"], ["Taxi", "taxis"]]) {
  await step(`${kind}: city filter, date and sort`, async () => {
    await p.goto(E + "/" + path); await p.getByTestId("svc-results").waitFor({ timeout: 30000 }); await settle();
    const total = await p.locator(".svc-card").count();
    const opts = await p.locator("[data-testid=svc-from] option").evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent })).filter((x) => x.v));
    let checked = "";
    for (const o of opts) {
      await p.getByTestId("svc-from").selectOption(o.v); await p.getByTestId("svc-search").click(); await settle(2200);
      const n = await p.locator(".svc-card").count();
      if (n > 0) {
        if (n > total) throw new Error(`${o.t}: more than unfiltered`);
        const txt = (await p.getByTestId("svc-results").innerText()).toLowerCase();
        const city = o.t.toLowerCase().split(/[ ·(]/)[0];
        if (!txt.includes(city)) throw new Error(`${o.t}: results not from ${city}`);
        checked = `${o.t}=${n}`; break;
      }
    }
    await p.getByTestId("svc-from").selectOption(""); await p.getByTestId("svc-search").click(); await settle(2000);
    // sort by price: totals ascending
    const prices = (await p.locator(".svc-price").allInnerTexts()).map((t) => Number((t.match(/TWD\s*([\d,]+)/) ?? [])[1]?.replace(/,/g, ""))).filter((x) => !Number.isNaN(x));
    for (let i = 1; i < prices.length; i++) if (prices[i] < prices[i - 1]) throw new Error("not sorted by lowest price: " + prices.join(","));
    return `all=${total}; ${checked || "no city with results"}; price order ok (${prices.length})`;
  });
}
await step("Deals: coupon list and Use now", async () => {
  await p.goto(E + "/deals"); await p.getByTestId("coupons").waitFor({ timeout: 30000 });
  return `${await p.locator("[data-testid^=deal-]").count()} coupons`;
});
await step("Destinations, calendar, compare, help search, news categories", async () => {
  await p.goto(E + "/destinations"); await p.getByTestId("destination-tiles").waitFor({ timeout: 30000 });
  const dest = await p.locator("[data-testid=destination-tiles] a").count();
  await p.goto(E + "/calendar"); await p.getByTestId("departure-calendar").waitFor({ timeout: 30000 });
  await p.getByRole("button", { name: "Next month" }).click().catch(() => {}); await settle();
  await p.goto(E + "/compare"); await settle(2500);
  await p.goto(E + "/help"); await p.getByTestId("help-search").fill("refund"); await settle(1500);
  const help = await p.locator("[data-testid=help-articles] mark, [data-testid=help-articles] article, [data-testid=help-articles] li").count();
  await p.goto(E + "/news"); await p.locator(".st-cats button").nth(1).click(); await settle(2000);
  const news = await p.locator(".st-feature, .st-card").count();
  return `destinations=${dest}, help hits=${help}, news in first category=${news}`;
});

// ---------------- bookings of every kind ----------------
const stamp = Date.now().toString().slice(-6);
const email = `buyer${stamp}@example.com`;
await step("Customer signs up", async () => {
  await p.goto(E + "/register");
  await p.getByLabel("Name", { exact: false }).first().fill("Demo Buyer"); await p.getByLabel("Email", { exact: false }).first().fill(email);
  await p.locator("input[type=password]").nth(0).fill("Travel2026"); await p.locator("input[type=password]").nth(1).fill("Travel2026");
  await p.getByRole("button", { name: /create account/i }).click(); await p.getByTestId("user-name").waitFor({ timeout: 20000 });
  return email;
});
const refs = {};
await step("Book a tour", async () => {
  await p.goto(E + "/tours/sun-moon-lake-lodge-2d1n"); await p.locator("[data-testid=departures-table] tbody tr").first().waitFor({ timeout: 30000 });
  await p.locator("[data-testid=departures-table] a, [data-testid=departures-table] button").filter({ hasText: /book/i }).first().click();
  await p.getByTestId("hold-submit").click(); await p.getByTestId("book-name").waitFor({ timeout: 20000 });
  await p.getByTestId("book-name").fill("Demo Buyer"); await p.getByTestId("book-phone").fill("+886912345678"); await p.getByLabel(/accept/i).check();
  await p.getByTestId("book-submit").click(); await p.waitForURL(/\/my\/bookings\/\d+/, { timeout: 30000 });
  refs.Tour = (await p.locator("h1").innerText()).split(" ")[0]; refs.tourUrl = p.url();
  return refs.Tour;
});
for (const [kind, path] of [["Hotel", "hotels"], ["Flight", "flights"], ["Bus", "buses"], ["Taxi", "taxis"]]) {
  await step(`Book a ${kind.toLowerCase()}`, async () => {
    await p.goto(E + "/" + path); await p.getByTestId("svc-results").waitFor({ timeout: 30000 }); await settle();
    await p.locator(".svc-card a.svc-title, .svc-card .svc-more").first().click(); await p.waitForURL(/\/services\//, { timeout: 20000 });
    await p.getByTestId("sd-reserve").waitFor({ timeout: 30000 }); await settle(800); await p.getByTestId("sd-reserve").click();
    await p.getByTestId("svc-name").waitFor({ timeout: 30000 });
    await p.getByTestId("svc-name").fill("Demo Buyer"); await p.getByTestId("svc-phone").fill("+886912345678");
    if (await p.getByTestId("svc-pickup").count()) await p.getByTestId("svc-pickup").fill("Taoyuan Airport Terminal 2");
    await p.getByLabel(/accept/i).check(); await p.getByTestId("svc-confirm").click();
    await p.waitForURL(/my\/bookings/, { timeout: 30000 }); await p.getByTestId("my-service-bookings").waitFor({ timeout: 20000 }); await settle();
    const row = (await p.getByTestId("my-service-bookings").innerText()).split("\n").find((l) => /SB-\d+/.test(l)) ?? "";
    refs[kind] = (row.match(/SB-\d+/) ?? [])[0];
    if (!refs[kind]) throw new Error("no reference on My bookings");
    return refs[kind];
  });
}
await step("Customer starts a payment (deposit) on the tour", async () => {
  await p.goto(refs.tourUrl);
  await p.getByTestId("pay-deposit").or(p.getByTestId("pay-full")).first().waitFor({ timeout: 20000 });
  await Promise.all([p.waitForURL(/ecpay\.com\.tw/, { timeout: 45000 }), p.getByTestId("pay-deposit").or(p.getByTestId("pay-full")).first().click()]);
  return "ECPay sandbox opened";
});

// ---------------- admin side ----------------
const s = await ctx.newPage();
await step("Admin: every booking and payment appears", async () => {
  await s.goto(E + "/admin/login"); await s.getByTestId("login-email").fill("admin@demo.sanpu.test"); await s.getByTestId("login-password").fill("Welcome@Sanpu2026"); await s.getByTestId("login-submit").click();
  await s.waitForURL(/\/admin$/, { timeout: 20000 });
  await s.goto(E + "/admin/bookings"); await s.locator("tbody tr").first().waitFor({ timeout: 20000 });
  const tours = await s.locator("main").innerText();
  if (!tours.includes(refs.Tour)) throw new Error(`tour ${refs.Tour} not in Bookings`);
  await s.goto(E + "/admin/service-bookings"); await s.locator("tbody tr").first().waitFor({ timeout: 20000 }); await s.waitForTimeout(1500);
  const svc = await s.locator("main").innerText();
  const missing = ["Hotel", "Flight", "Bus", "Taxi"].filter((k) => refs[k] && !svc.includes(refs[k]));
  if (missing.length) throw new Error("not in Service bookings: " + missing.map((k) => refs[k]).join(", "));
  await s.goto(E + "/admin/payments"); await s.getByTestId("payments").waitFor({ timeout: 20000 });
  const pay = await s.getByTestId("payments").innerText();
  if (!pay.includes(refs.Tour)) throw new Error(`payment for ${refs.Tour} not in Payments`);
  const kpis = (await s.locator(".kpi").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ");
  return `Bookings has ${refs.Tour}; Service bookings has ${["Hotel", "Flight", "Bus", "Taxi"].map((k) => refs[k]).join(", ")}; Payments has ${refs.Tour}; ${kpis}`;
});

await b.close();
fs.writeFileSync("artifacts/e2e-filters-bookings.json", JSON.stringify({ at: new Date().toISOString(), base: E, customer: email, refs, results: out, serverErrors: apiErr }, null, 2));
console.log(`\n${out.filter((r) => r.ok).length}/${out.length} passed · customer ${email} · refs ${JSON.stringify(refs)}${apiErr.length ? " · server errors: " + apiErr.slice(0, 3).join(" | ") : ""}`);
