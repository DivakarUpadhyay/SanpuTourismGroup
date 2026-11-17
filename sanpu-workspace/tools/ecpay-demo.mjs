// Visible end-to-end payment demo against the ECPay STAGING gateway (sandbox, no real money):
// sign in -> search hotels -> book with a coupon -> pay a 30% deposit on ECPay -> come back verified -> pay the balance.
// Needs the dev stack (APIs 5101/5102, web 3101) and Payments:Provider=ECPay (scripts/dev-secrets.ps1).
// Usage: node tools/ecpay-demo.mjs [--inspect]   (--inspect stops on the ECPay page and prints its form fields)
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3101";
const inspect = process.argv.includes("--inspect");
const pw = fs.readFileSync("tour-operations/LOGINS.local.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("traveler.chen@demo.sanpu.test,"))?.split(",")[1];
const out = "artifacts/ecpay"; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 250 });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
await page.goto(`${BASE}/login?next=${encodeURIComponent(`/hotels?date=${day(30)}&endDate=${day(32)}&travelers=2&units=1`)}`);
await page.getByTestId("login-email").fill("traveler.chen@demo.sanpu.test");
await page.getByTestId("login-password").fill(pw);
await page.getByTestId("login-submit").click();
await page.waitForURL(/\/hotels/);
await page.getByTestId("svc-results").waitFor();
await shot("1-hotels");
await page.locator("[data-testid^=svc-book-H-]").first().click();
await page.getByTestId("svc-name").waitFor();
await page.getByTestId("svc-name").fill("Chen Ya-Ting");
await page.getByTestId("svc-phone").fill("+886912345678");
for (const code of ["WELCOME10", "HOTEL15", ""]) {   // each code is limited per customer; fall back to no coupon
  await page.getByTestId("coupon-code").fill(code);
  await page.getByTestId("coupon-apply").click();
  if (!code) break;
  const res = await Promise.race([page.getByTestId("coupon-ok").waitFor().then(() => "ok"), page.getByTestId("coupon-error").waitFor().then(() => "error")]);
  console.log("coupon", code, res);
  if (res === "ok") break;
}
await page.getByTestId("svc-terms").check();
await shot("2-checkout");
await page.getByTestId("svc-confirm").click();
await page.waitForURL(/\/my\/bookings/);
await page.getByTestId("pay-deposit").waitFor();
await shot("3-booked");
await page.getByTestId("pay-deposit").click();
await page.waitForURL(/ecpay\.com\.tw/, { timeout: 30000 });
await page.waitForLoadState("networkidle").catch(() => {});
await shot("4-ecpay");
if (inspect) {
  const fields = await page.evaluate(() => [...document.querySelectorAll("input,select,button,a")].filter((e) => e.offsetParent).slice(0, 80)
    .map((e) => `${e.tagName} id=${e.id} name=${e.getAttribute("name")} type=${e.getAttribute("type")} text=${(e.textContent || e.value || "").trim().slice(0, 30)}`));
  console.log(page.url()); console.log(fields.join("\n"));
  await browser.close(); process.exit(0);
}

/* ---- pay on ECPay's hosted page with the published sandbox test card ---- */
const closeNotice = async () => { const b = page.getByText("關閉", { exact: true }); if (await b.first().isVisible().catch(() => false)) await b.first().click().catch(() => {}); };   // ECPay "test environment" notice
async function payOnEcpay(tag) {
  await page.waitForTimeout(1200); await closeNotice();
  await page.locator("#CCpart1").fill("4311"); await page.locator("#CCpart2").fill("9522");
  await page.locator("#CCpart3").fill("2222"); await page.locator("#CCpart4").fill("2222");
  await page.locator("#creditMM").fill("12"); await page.locator("#creditYY").fill("30");
  await page.locator("#CreditBackThree").fill("222");
  if (await page.locator("#CCHolderTemp").isVisible()) await page.locator("#CCHolderTemp").fill("CHEN YA TING");
  if (await page.locator("#CellPhoneCheck").isVisible()) await page.locator("#CellPhoneCheck").fill("0912345678");
  if (await page.locator("#EmailTemp").isVisible()) await page.locator("#EmailTemp").fill("traveler.chen@example.com");
  await shot(`${tag}-card`);
  page.on("dialog", (d) => { console.log("dialog:", d.message()); d.accept().catch(() => {}); });
  // ECPay staging offers a sandbox shortcut ("測試付款請點此" = "click here for a test payment") that completes the card payment without a real SMS step
  await closeNotice();
  // ECPay staging: the orange "測試付款請點此" (test payment) button completes a sandbox card payment; fall back to the normal submit
  if (await page.locator("#aCREDIT").isVisible().catch(() => false)) await page.locator("#aCREDIT").click();
  else await page.locator("#CreditPaySubmit").click();
  // 3-D Secure / confirmation steps differ over time: report what appears until we are back on our site
  for (let i = 0; i < 40 && !page.url().startsWith(BASE); i++) {
    await page.waitForTimeout(1500);
    if (page.url().startsWith(BASE)) break;
    const hadNotice = await page.getByText("關閉", { exact: true }).first().isVisible().catch(() => false);
    await closeNotice();
    if (hadNotice && await page.locator("#aCREDIT").isVisible().catch(() => false)) { await page.waitForTimeout(500); await page.locator("#aCREDIT").click().catch(() => {}); }   // submit again after the notice
    if (i % 4 === 0) { await shot(`${tag}-step${i}`); console.log("at", page.url()); }
    const otp = page.locator("input[type=password]:visible, input[id*=OTP i]:visible, input[name*=otp i]:visible, input[id*=SMS i]:visible").first();
    if (await otp.count()) {
      await shot(`${tag}-otp`);
      console.log("OTP page", page.url());
      await otp.fill("1234");
      const btn = page.locator("button:visible, input[type=submit]:visible, a[id*=Submit i]:visible").first();
      if (await btn.count()) await btn.click().catch(() => {});
    }
  }
  await shot(`${tag}-end`);
  console.log("returned to", page.url());
}

page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV", f.url().slice(0, 100)); });
page.context().on("page", async (p) => {
  console.log("NEW PAGE", p.url());
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) console.log("POPUP NAV", f.url().slice(0, 100)); });
  await p.waitForLoadState("load").catch(() => {}); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/5-popup.png`, fullPage: true }).catch(() => {});
  console.log("POPUP TEXT", (await p.locator("body").innerText().catch(() => "")).replace(/s+/g, " ").slice(0, 300));
  const btn = p.locator("button:visible, input[type=submit]:visible, input[type=button]:visible, a:visible").filter({ hasText: /付款|確認|Pay|Submit|送出/ }).first();
  console.log("POPUP BUTTONS", await p.locator("button, input[type=submit], input[type=button], a").evaluateAll((els) => els.map((e) => (e.tagName + ":" + (e.textContent || e.value || "").trim()).slice(0, 40))));
  if (await btn.count()) { await btn.click().catch(() => {}); console.log("clicked simulate button"); }
  else { const any = p.locator("button:visible, input[type=submit]:visible").first(); if (await any.count()) { await any.click().catch(() => {}); console.log("clicked first button"); } }
  await p.waitForTimeout(3000).catch(() => {});
  console.log("POPUP AFTER", (await p.locator("body").innerText().catch(() => "")).replace(/s+/g, " ").slice(0, 200));
});
await payOnEcpay("5-deposit");
await page.getByTestId("payment-result").waitFor({ timeout: 60000 });
console.log("result:", await page.getByTestId("payment-result").innerText());
await shot("6-after-deposit");
