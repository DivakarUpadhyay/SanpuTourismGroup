import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login, sql } from "./helpers";

/** Responsive audit of every catalogued screen (both apps) at phone, tablet, laptop and desktop widths.
 *  Fails on: sideways page scroll, any visible element sticking out of the window (scroll containers excepted),
 *  a wrapped title bar, and a navigation drawer that does not open/fit on narrow screens. Screenshots go to artifacts/screens/<width>/. */
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs", "gitbook", "catalog.json"), "utf8"));
const base = { erp: "http://localhost:3201", ai: "http://localhost:3202" } as const;
const viewports = [{ width: 360, height: 740 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const out = path.join(__dirname, "..", "..", "artifacts", "screens");

for (const s of catalog.screens) {
  test(`responsive ${s.id}`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base[s.app as "erp" | "ai"], viewport: viewports[3] });
    const page = await ctx.newPage();
    if (s.role) await login(page, s.app, s.role);
    let url: string = s.url;
    if (url.includes("{erpOpenDeparture}")) url = url.replace("{erpOpenDeparture}", sql("SanpuErp_E2E", "SELECT TOP 1 d.DepartureId FROM dbo.Departures d JOIN dbo.Tours t ON t.TourId = d.TourId WHERE t.Code = 'TW-ERV-3D' AND d.Capacity - d.SeatsSold - d.SeatsHeld > 5 ORDER BY d.DepartureDate"));
    await page.goto(url);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(800);
    const problems: string[] = [];
    const cjk = await page.evaluate(() => (document.body.innerText.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g) ?? []).slice(0, 3));
    if (cjk.length) problems.push(`not English-only: ${cjk.join(" ")}`);   // the apps are English-only
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const scroll = document.documentElement.scrollWidth - vw;
        const inScroller = (el: Element) => !!el.closest(".table-wrap, pre, .tabs, .dt-tabs, .chip-pick, .overlay, .skip, .sidebar:not(.open), .topnav:not(.open)");   // .skip is off-screen until focused, by design
        const offenders = [...document.querySelectorAll("body *")].filter((el) => {
          const he = el as HTMLElement;
          if (inScroller(el) || he.offsetParent === null) return false;
          const b = he.getBoundingClientRect();
          return b.width > 0 && (b.right > vw + 1 || b.left < -1);
        }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString().split(" ")[0] ?? ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
        const bar = document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0;
        return { scroll, offenders, bar };
      });
      if (r.scroll > 1) problems.push(`${vp.width}px: page scrolls sideways by ${r.scroll}px`);
      if (r.offenders.length) problems.push(`${vp.width}px: outside the window: ${r.offenders.join("; ")}`);
      if (r.bar > 60) problems.push(`${vp.width}px: title bar wrapped (${Math.round(r.bar)}px high)`);
      if (vp.width < 900) {
        const toggle = page.locator(".menu-toggle:visible, .nav-toggle:visible").first();
        if (await toggle.count()) {
          await toggle.click();
          await page.waitForTimeout(350);   // let the slide-in finish
          const drawer = page.locator(".sidebar.open, .topnav.open").first();
          if (!(await drawer.isVisible())) problems.push(`${vp.width}px: menu button does not open the navigation`);
          else {
            const box = (await drawer.boundingBox())!;
            if (box.x < -1 || box.x + box.width > vp.width + 1) problems.push(`${vp.width}px: navigation drawer does not fit`);
            if (vp.width === 360) await page.screenshot({ path: path.join(out, "360-menu", `${s.id}.png`) });
          }
          await toggle.click();
          await page.waitForTimeout(350);
        }
      }
      fs.mkdirSync(path.join(out, String(vp.width)), { recursive: true });
      await page.screenshot({ path: path.join(out, String(vp.width), `${s.id}.png`), fullPage: true });
    }
    await ctx.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
