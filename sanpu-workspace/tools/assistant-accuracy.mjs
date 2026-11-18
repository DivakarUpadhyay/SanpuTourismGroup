// Accuracy test for the AI Travel assistant: sends realistic requests to the live chat API and checks each answer against
// what was asked (city, route, dates, travelers, budget, length). Usage: node tools/assistant-accuracy.mjs [baseUrl]
import fs from "node:fs";

const BASE = process.argv[2] ?? "https://sanpu-trip-copilot.vercel.app";
const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date(Date.now() + 8 * 3600e3);   // Taiwan date
const addDays = (n) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const nextDow = (dow) => { const d = new Date(now); const gap = ((dow - d.getUTCDay() + 7) % 7) || 7; d.setUTCDate(d.getUTCDate() + gap); return d; };
const nextFri = nextDow(5); const nextSat = nextDow(6);
const plus = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

const chat = async (content) => {
  const r = await fetch(`${BASE}/api/v1/assistant/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content }] }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const card = (b, t) => (b.cards ?? []).find((c) => c.type === t)?.data;
const all = (rows, f) => rows.length > 0 && rows.every(f);

const S = [
  ["Hotel by city", "Find a hotel in Kinmen", (b) => { const c = card(b, "services"); return [["hotel results", c?.kind === "Hotel" && c.items.length > 0], ["all in Kinmen", all(c?.items ?? [], (x) => x.fromCity === "Kinmen")]]; }],
  ["Hotel, relative dates", "Find a hotel in Tainan for 2 nights from next Friday", (b) => { const c = card(b, "services"); return [["all in Tainan", all(c?.items ?? [], (x) => x.fromCity === "Tainan")], ["check-in next Friday", c?.date === iso(nextFri)], ["2 nights", c?.endDate === plus(nextFri, 2)]]; }],
  ["Hotel, exact dates", "Hotel in Taipei from 2026-12-20 to 2026-12-23", (b) => { const c = card(b, "services"); return [["all in Taipei", all(c?.items ?? [], (x) => x.fromCity === "Taipei")], ["check-in", c?.date === "2026-12-20"], ["check-out", c?.endDate === "2026-12-23"]]; }],
  ["Hotel, group size", "Hotel in Hualien for 5 guests", (b) => { const c = card(b, "services"); return [["all in Hualien", all(c?.items ?? [], (x) => x.fromCity === "Hualien")], ["5 guests", String(c?.travelers) === "5"]]; }],
  ["Hotel, budget", "Hotel in Taipei under TWD 8000", (b) => { const c = card(b, "services"); return [["results", (c?.items ?? []).length > 0], ["within budget", all(c?.items ?? [], (x) => x.totalPrice <= 8000)]]; }],
  ["Flight route + date + people", "Flights from Taipei to Kinmen next weekend for 2", (b) => { const c = card(b, "services"); return [["flight results", c?.kind === "Flight" && c.items.length > 0], ["from Taipei", all(c?.items ?? [], (x) => x.fromCity === "Taipei")], ["to Kinmen", all(c?.items ?? [], (x) => x.toCity === "Kinmen")], ["next Saturday", c?.date === iso(nextSat)], ["2 travelers", String(c?.travelers) === "2"]]; }],
  ["Bus route + tomorrow + people", "Bus from Taipei to Tainan tomorrow for 3 people", (b) => { const c = card(b, "services"); return [["from Taipei", all(c?.items ?? [], (x) => x.fromCity === "Taipei")], ["to Tainan", all(c?.items ?? [], (x) => x.toCity === "Tainan")], ["tomorrow", c?.date === addDays(1)], ["3 travelers", String(c?.travelers) === "3"]]; }],
  ["Taxi from airport", "Book a taxi from Taoyuan airport to Taipei tomorrow morning", (b) => { const c = card(b, "services"); return [["taxi results", c?.kind === "Taxi" && c.items.length > 0], ["from Taoyuan", all(c?.items ?? [], (x) => x.fromCity === "Taoyuan")], ["to Taipei", all(c?.items ?? [], (x) => x.toCity === "Taipei")], ["tomorrow", c?.date === addDays(1)]]; }],
  ["Tours by place + budget", "Tours in Hualien under TWD 10000", (b) => { const c = card(b, "tours") ?? []; return [["results", c.length > 0], ["all Hualien", all(c, (x) => /hualien/i.test(x.destinationName))], ["within budget", all(c, (x) => (x.fromPrice ?? 0) <= 10000)]]; }],
  ["Tours by length", "3 day tours in Kinmen", (b) => { const c = card(b, "tours") ?? []; return [["results", c.length > 0], ["all Kinmen", all(c, (x) => /kinmen/i.test(x.destinationName))], ["3 days", all(c, (x) => x.days === 3)]]; }],
  ["Tours by interest", "Food tours in Tainan", (b) => { const c = card(b, "tours") ?? []; return [["results", c.length > 0], ["all Tainan", all(c, (x) => /tainan/i.test(x.destinationName))], ["food themed", all(c, (x) => /food|cook|flavou?r|market/i.test(`${x.title} ${x.slogan} ${x.summary}`))]]; }],
  ["Compare tours", "Compare the East Rift Valley and Kinmen Heritage tours", (b) => { const c = card(b, "compare") ?? []; return [["comparison shown", c.length === 2]]; }],
  ["Trip plan request", "Plan 3 relaxed days in Hualien for 2 people under TWD 25,000", (b) => { const c = card(b, "tours") ?? []; return [["Hualien options", all(c, (x) => /hualien/i.test(x.destinationName))], ["within budget for 2", all(c, (x) => (x.fromPrice ?? 0) * 2 <= 25000)]]; }],
  ["My bookings as a guest", "Show my bookings", (b) => [["asks to sign in", (b.cards ?? []).some((c) => c.type === "signin")]]],
  ["Greeting", "Hello", (b) => [["no random listings", (b.cards ?? []).length === 0], ["replies", (b.reply ?? "").length > 0]]],
  ["Place we do not serve", "Hotel in Paris", (b) => [["does not show Taiwan hotels as Paris", (card(b, "services")?.items ?? []).length === 0], ["says so", /taiwan|not (available|cover)|only/i.test(b.reply ?? "")]]],
  ["Nonsense text", "asdfghjkl qwerty", (b) => [["no random listings", (b.cards ?? []).length === 0]]],
  ["Past date", "Hotel in Tainan on 2020-01-01", (b) => [["no results for a past date", (card(b, "services")?.items ?? []).length === 0], ["explains", /past|future|passed/i.test(b.reply ?? "")]]],
];

const results = [];
for (const [name, text, check] of S) {
  const { status, body } = await chat(text);
  const checks = status === 200 ? check(body) : [["answered", false]];
  const failed = checks.filter(([, ok]) => !ok).map(([l]) => l);
  results.push({ name, text, status, reply: body.reply, passed: checks.length - failed.length, total: checks.length, failed });
  console.log(`${failed.length ? "FAIL" : "PASS"} ${name} (${checks.length - failed.length}/${checks.length})${failed.length ? " · wrong: " + failed.join(", ") : ""}`);
  await new Promise((r) => setTimeout(r, 400));
}
const empty = await chat("   ");
console.log(`${empty.status === 422 ? "PASS" : "FAIL"} Empty message is refused (${empty.status})`);
const p = results.reduce((a, r) => a + r.passed, 0), t = results.reduce((a, r) => a + r.total, 0);
console.log(`\nScenarios fully correct: ${results.filter((r) => !r.failed.length).length}/${results.length} · individual checks: ${p}/${t}`);
fs.writeFileSync("artifacts/assistant-accuracy.json", JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
