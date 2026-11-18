// Proves "no confirmation without a successful payment" on the live site. The gateway's result is applied with the same
// procedure the ECPay callback uses (usp_Payment_CompleteIntent). Usage: node tools/e2e-payment-rule.mjs [erpBase]
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const E = process.argv[2] ?? "https://sanpu-travel.vercel.app";
const A = E + "/api/v1";
const J = { "Content-Type": "application/json" };
let pass = 0, fail = 0;
const check = (name, ok, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " · " + info : ""}`); };
const call = async (method, path, token, body, extra = {}) => {
  const r = await fetch(A + path, { method, headers: { ...J, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
  return { status: r.status, json };
};
const gateway = (trade, ok, amount) => execFileSync("sqlcmd", ["-S", "DIVAKARLAPTOP\\DEVELOPERMSSQL", "-E", "-b", "-I", "-d", "SanpuErp", "-Q",
  `SET NOCOUNT ON; EXEC dbo.usp_Payment_CompleteIntent @MerchantTradeNo='${trade}', @Succeeded=${ok ? 1 : 0}, @PaidAmount=${amount}, @ProviderTradeNo='TEST${Date.now() % 1e8}', @ProviderMessage=N'${ok ? "Paid" : "Card declined"}', @PaymentMethod='Credit', @BalanceDueDays=14`], { encoding: "utf8" });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const email = `payrule${Date.now() % 1e7}@example.com`, password = "Travel2026";
const reg = await call("POST", "/auth/register", null, { email, displayName: "Payment Rule Test", password });
const T = reg.json.accessToken;
check("customer signs up", !!T, email);

// ---- hotel: awaiting payment -> failed payment -> successful payment ----
const found = (await call("GET", `/travel/search?kind=Hotel&date=${day(40)}&endDate=${day(42)}&travelers=2&units=1`)).json[0];
const hotel = await call("POST", "/travel/bookings", T, { serviceCode: found.code, date: day(40), endDate: day(42), units: 1, travelers: 2, leadName: "Payment Rule", leadPhone: "+886912345678", acceptTerms: true, idempotencyKey: `payrule-${Date.now()}` });
check("new hotel booking is not confirmed", hotel.json?.status === "AwaitingPayment", `${hotel.json?.bookingRef} = ${hotel.json?.status}`);
const svc = async () => (await call("GET", "/travel/my/bookings", T)).json.find((b) => b.bookingRef === hotel.json.bookingRef);
const pay1 = await call("POST", "/payments/checkout", T, { orderType: "Service", orderId: hotel.json.serviceBookingId, mode: "Full" });
check("payment starts at the gateway", !!pay1.json?.merchantTradeNo, pay1.json?.provider);
check("payment started but not finished: still not confirmed", (await svc()).status === "AwaitingPayment");
gateway(pay1.json.merchantTradeNo, false, pay1.json.amount);
let s = await svc();
check("FAILED payment: still not confirmed", s.status === "AwaitingPayment" && s.paymentStatus === "Unpaid", `${s.status} / ${s.paymentStatus}`);
const pay2 = await call("POST", "/payments/checkout", T, { orderType: "Service", orderId: hotel.json.serviceBookingId, mode: "Full" });
gateway(pay2.json.merchantTradeNo, true, pay2.json.amount);
s = await svc();
check("SUCCESSFUL payment: confirmed and paid", s.status === "Confirmed" && s.paymentStatus === "Paid", `${s.status} / ${s.paymentStatus}`);

// ---- tour: staff cannot approve unpaid; deposit, then approval confirms ----
const admin = (await call("POST", "/auth/login", null, { email: "admin@demo.sanpu.test", password: "Welcome@Sanpu2026" }, { "X-Session-Realm": "admin" })).json.accessToken;
const tour = (await call("GET", "/catalog/tours/TW-ALI-2D")).json;
const dep = tour.departures.filter((d) => d.seatsLeft > 1).at(-1);
const hold = await call("POST", "/bookings/holds", T, { departureId: dep.departureId, pax: 1, idempotencyKey: `payrulehold-${Date.now()}` });
const bk = await call("POST", "/bookings", T, { holdId: hold.json.holdId, leadName: "Payment Rule", leadPhone: "+886912345678", acceptTerms: true });
check("new tour booking is not confirmed", bk.json?.status === "Pending", `${bk.json?.bookingRef} = ${bk.json?.status}`);
// the approval step belongs to one role: use the staff member who really owns it
const staff = [admin];
for (const who of ["agent", "ops.manager", "finance", "director"]) staff.push((await call("POST", "/auth/login", null, { email: `${who}@demo.sanpu.test`, password: "Welcome@Sanpu2026" }, { "X-Session-Realm": "admin" })).json.accessToken);
const decide = async () => { let r; for (const tok of staff) { r = await call("POST", `/ops/bookings/${bk.json.bookingId}/decision`, tok, { decision: "Approved", comment: "Payment rule test" }, { "X-Session-Realm": "admin" }); if (r.status < 400 || !/another role|permission/i.test(r.json?.detail ?? "") && r.status !== 403) return r; } return r; };
const refused = await decide();
const tourNow = async () => (await call("GET", `/my/bookings/${bk.json.bookingId}`, T)).json.booking;
check("staff CANNOT approve an unpaid tour", refused.status === 409 && (await tourNow()).status === "Pending", `HTTP ${refused.status}: ${refused.json?.detail ?? ""}`);
const payT = await call("POST", "/payments/checkout", T, { orderType: "Tour", orderId: bk.json.bookingId, mode: "Full" });
gateway(payT.json.merchantTradeNo, false, payT.json.amount);
check("FAILED tour payment: still not confirmed", (await tourNow()).status === "Pending");
const payT2 = await call("POST", "/payments/checkout", T, { orderType: "Tour", orderId: bk.json.bookingId, mode: "Full" });
gateway(payT2.json.merchantTradeNo, true, payT2.json.amount);
let t = await tourNow();
check("SUCCESSFUL tour payment is recorded", t.paymentStatus === "Paid", `${t.status} / ${t.paymentStatus}`);
if (t.status === "Pending") { const ok = await decide(); t = await tourNow(); check("staff can approve after payment: confirmed", ok.status < 400 && t.status === "Confirmed", `${t.status} / ${t.paymentStatus}`); }
else check("confirmed after payment", t.status === "Confirmed", t.status);

// ---- what the customer and admin see ----
const unpaid = (await call("POST", "/travel/bookings", T, { serviceCode: found.code, date: day(44), endDate: day(46), units: 1, travelers: 2, leadName: "Payment Rule", leadPhone: "+886912345678", acceptTerms: true, idempotencyKey: `payrule2-${Date.now()}` })).json;
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(E + "/login"); await p.getByTestId("login-email").fill(email); await p.getByTestId("login-password").fill(password); await p.getByTestId("login-submit").click(); await p.waitForTimeout(2500);
await p.goto(E + "/my/bookings"); await p.getByTestId("my-service-bookings").waitFor({ timeout: 30000 }); await p.waitForTimeout(1500);
const block = await p.locator("[data-testid=my-service-bookings] > *", { hasText: unpaid.bookingRef }).first().innerText();
check("My bookings shows Awaiting payment on the unpaid booking", /awaiting payment/i.test(block) && !/\bConfirmed\b/.test(block));
await p.screenshot({ path: "artifacts/visible/payment-rule.png" });
await b.close();
const leak = execFileSync("sqlcmd", ["-S", "DIVAKARLAPTOP\\DEVELOPERMSSQL", "-E", "-h", "-1", "-W", "-d", "SanpuErp", "-Q", "SET NOCOUNT ON; SELECT (SELECT COUNT(*) FROM ServiceBookings WHERE Status='Confirmed' AND AmountPaid=0)+(SELECT COUNT(*) FROM Bookings WHERE Status='Confirmed' AND AmountPaid=0)"], { encoding: "utf8" }).trim();
check("database: no confirmed booking without payment", leak === "0", `${leak} found`);
console.log(`\n${pass}/${pass + fail} passed`);
