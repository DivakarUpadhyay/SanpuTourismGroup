// Triggers every customer and staff email through the real flows on the live sites and lists what was sent.
// Usage: node tools/e2e-emails.mjs <inbox-name> <domain>   e.g. node tools/e2e-emails.mjs someone gmail.com
import { execFileSync } from "node:child_process";

const [name, domain] = process.argv.slice(2);
if (!name || !domain) throw new Error("Usage: node tools/e2e-emails.mjs <inbox-name> <domain>");
const ERP = "https://sanpu-travel.vercel.app/api/v1", AI = "https://sanpu-trip-copilot.vercel.app/api/v1";
const stamp = Date.now().toString().slice(-6);
const to = (tag) => `${name}+${tag}${stamp}@${domain}`;
const J = { "Content-Type": "application/json" };
const call = async (base, method, path, token, body, extra = {}) => {
  const r = await fetch(base + path, { method, headers: { ...J, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* empty */ }
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${json?.detail ?? t.slice(0, 120)}`);
  return json;
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const step = async (label, fn) => { try { await fn(); console.log("sent  " + label); } catch (e) { console.log("FAIL  " + label + " · " + e.message); } };
const admin = { "X-Session-Realm": "admin" };

const customer = to("customer");
let T;
await step("Sanpu Travel: welcome", async () => { T = (await call(ERP, "POST", "/auth/register", null, { email: customer, displayName: "Email Test", password: "Travel2026" })).accessToken; });
await step("Sanpu Travel: password reset", () => call(ERP, "POST", "/auth/forgot-password", null, { email: customer }));

const adminToken = (await call(ERP, "POST", "/auth/login", null, { email: "admin@demo.sanpu.test", password: "Welcome@Sanpu2026" }, admin)).accessToken;
const role = (await call(ERP, "GET", "/auth/staff-roles")).find((r) => r.roleKey !== "system_admin").roleKey;
const decide = async (email, approve) => {
  await call(ERP, "POST", "/auth/staff-request", null, { email, displayName: "Email Test Staff", password: "Travel2026", roleKey: role, note: "Email test" });
  const req = (await call(ERP, "GET", "/admin/users/access-requests", adminToken, null, admin)).find((r) => r.email === email);
  await call(ERP, "POST", `/admin/users/access-requests/${req.userId}`, adminToken, { approve, roleKey: role }, admin);
};
await step("Sanpu Travel: staff request received + approved", () => decide(to("staffok"), true));
await step("Sanpu Travel: staff request received + declined", () => decide(to("staffno"), false));

await step("Sanpu Travel: tour booking received + cancellation request", async () => {
  const dep = (await call(ERP, "GET", "/catalog/tours/TW-ALI-2D")).departures.filter((d) => d.seatsLeft > 1).at(-1);
  const hold = await call(ERP, "POST", "/bookings/holds", T, { departureId: dep.departureId, pax: 1, idempotencyKey: `mailhold-${stamp}` });
  const b = await call(ERP, "POST", "/bookings", T, { holdId: hold.holdId, leadName: "Email Test", leadPhone: "+886912345678", acceptTerms: true });
  await call(ERP, "POST", `/my/bookings/${b.bookingId}/cancel`, T, { reason: "Schedule change" });
});
let hotel;
await step("Sanpu Travel: hotel booking received + cancelled", async () => {
  hotel = (await call(ERP, "GET", `/travel/search?kind=Hotel&date=${day(50)}&endDate=${day(52)}&travelers=2&units=1`))[0];
  const b = await call(ERP, "POST", "/travel/bookings", T, { serviceCode: hotel.code, date: day(50), endDate: day(52), units: 1, travelers: 2, leadName: "Email Test", leadPhone: "+886912345678", acceptTerms: true, idempotencyKey: `mailsvc-${stamp}` });
  await call(ERP, "POST", `/travel/my/bookings/${b.serviceBookingId}/cancel`, T, {});
});

let A;
await step("AI Travel: welcome", async () => { A = (await call(AI, "POST", "/auth/register", null, { email: to("ai"), displayName: "Email Test", password: "Travel2026" })).accessToken; });
await step("AI Travel: deposit paid + fully paid + cancelled", async () => {
  const r = await call(AI, "POST", "/assistant/prepare", A, { kind: "Hotel", code: hotel.code, date: day(50), end_date: day(52), travelers: 2 });
  const id = r.cards.find((c) => c.type === "booking").data.reservationId;
  await call(AI, "POST", `/my/bookings/${id}/pay`, A, { mode: "Deposit" });
  await call(AI, "POST", `/my/bookings/${id}/pay`, A, { mode: "Balance" });
  await call(AI, "POST", `/my/bookings/${id}/cancel`, A);
});

console.log("\nEmails recorded by the apps:");
for (const db of ["SanpuErp", "SanpuAiOps"]) console.log(execFileSync("sqlcmd", ["-S", "DIVAKARLAPTOP\\DEVELOPERMSSQL", "-E", "-h", "-1", "-W", "-s", "|", "-d", db, "-Q",
  `SET NOCOUNT ON; SELECT '${db === "SanpuErp" ? "Sanpu Travel" : "AI Travel"}', Subject FROM dbo.DevOutbox WHERE ToAddress LIKE '%${stamp}@%' ORDER BY MessageId`], { encoding: "utf8" }).trim());
