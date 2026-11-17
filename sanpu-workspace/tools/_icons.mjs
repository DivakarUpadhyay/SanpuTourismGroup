import { chromium } from "playwright";
import fs from "node:fs";
const svg = fs.readFileSync("tour-operations/frontend/app/icon.svg", "utf8");
const b = await chromium.launch({ channel: "chrome", headless: false });
const p = await b.newPage();
for (const [size, name] of [[180, "apple-icon.png"], [512, "icon-512.png"]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  for (const app of ["tour-operations", "ai-travel"]) await p.screenshot({ path: `${app}/frontend/${name === "apple-icon.png" ? "app" : "public"}/${name}`, omitBackground: true });
}
const q = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
await q.goto("http://localhost:3101/forgot-password"); await q.getByTestId("forgot-email").waitFor(); await q.waitForTimeout(800);
await q.getByTestId("forgot-email").fill("abc"); await q.getByTestId("forgot-submit").click(); await q.waitForTimeout(500);
await q.screenshot({ path: "artifacts/visible/forgot-invalid.png" });
console.log("error shown:", await q.locator(".error").first().innerText().catch(() => "none"));
await q.getByTestId("forgot-email").fill("someone@example.com"); await q.getByTestId("forgot-submit").click(); await q.getByTestId("forgot-sent").waitFor();
await q.screenshot({ path: "artifacts/visible/forgot-sent.png" });
await q.goto("http://localhost:3101/"); await q.waitForTimeout(1500); await q.screenshot({ path: "artifacts/visible/logo-header.png", clip: { x: 0, y: 0, width: 700, height: 80 } });
await b.close();
