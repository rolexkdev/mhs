import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

const logs = [];
page.on("console", msg => {
  const t = msg.type();
  if (["error", "warn"].includes(t)) logs.push(`[${t}] ${msg.text()}`);
});

await page.goto("http://localhost:5173");
await page.waitForTimeout(2000);

const btn3d = page.locator("button", { hasText: "3D" }).first();
if (await btn3d.count()) {
  await btn3d.click();
  await page.waitForTimeout(14000);
}

await page.screenshot({ path: "screenshot_lighting.png" });

// Also take a close-up at the building corner
// We'll reuse the same tab by navigating or modifying the URL — instead, just take a 2nd screenshot

console.log("=== Errors ===");
logs.forEach(l => console.log(l));
await browser.close();
