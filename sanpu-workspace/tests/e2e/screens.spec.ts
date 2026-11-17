import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login, sql } from "./helpers";

/** Captures a real screenshot of every catalogued screen from the running E2E stack (no mock images). */
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs", "gitbook", "catalog.json"), "utf8"));
const out = path.join(__dirname, "..", "..", "docs", "gitbook", "assets");
const base = { erp: "http://localhost:3201", ai: "http://localhost:3202" } as const;

for (const s of catalog.screens) {
  test(`screen ${s.id}`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base[s.app as "erp" | "ai"], viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    if (s.role) await login(page, s.app, s.role);
    let url: string = s.url;
    if (url.includes("{erpOpenDeparture}")) url = url.replace("{erpOpenDeparture}", sql("SanpuErp_E2E", "SELECT TOP 1 d.DepartureId FROM dbo.Departures d JOIN dbo.Tours t ON t.TourId = d.TourId WHERE t.Code = 'TW-ERV-3D' AND d.Capacity - d.SeatsSold - d.SeatsHeld > 5 ORDER BY d.DepartureDate"));
    await page.goto(url);
    await expect(page.getByTestId("brand")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForLoadState("load");
    await page.waitForTimeout(1200);   // let async lists render (CJK web-font subsets keep the network busy, so no networkidle)
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, `${s.id}.png`), fullPage: true });
    await ctx.close();
  });
}
