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

/* probe: card submit */
const close = async () => { const b = page.getByText("關閉", { exact: true }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); return true; } return false; };
page.on("request", (r) => { if (r.url().includes("ecpay") && r.method() === "POST") console.log("POST", r.url().slice(0, 110)); });
page.on("framenavigated", (f) => console.log("NAV", f === page.mainFrame() ? "main" : "frame", f.url().slice(0, 110)));
await page.waitForTimeout(1500); console.log("notice at load:", await close());
await page.locator("#CCpart1").fill("4311"); await page.locator("#CCpart2").fill("9522"); await page.locator("#CCpart3").fill("2222"); await page.locator("#CCpart4").fill("2222");
await page.locator("#creditMM").fill("12"); await page.locator("#creditYY").fill("30"); await page.locator("#CreditBackThree").fill("222");
await page.locator("#CCHolderTemp").fill("CHEN YA TING"); await page.locator("#CellPhoneCheck").fill("0912345678");
await page.locator("#CreditPaySubmit").click(); await page.waitForTimeout(3000); await shot("p1-after-submit");
console.log("notice after submit:", await close()); await page.waitForTimeout(6000); await shot("p2-after-close");
console.log("url", page.url(), "frames", page.frames().map((f) => f.url().slice(0, 80)));
await browser.close();
