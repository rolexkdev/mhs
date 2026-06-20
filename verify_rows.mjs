import { chromium } from "playwright";
const PORT = process.argv[2] || "5173";
const b = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle"] });
const page = await b.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
const errs = [];
page.on("console", m => { if (m.type() === "error" && !/openstreetmap|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
await page.goto(`http://localhost:${PORT}`);
await page.waitForTimeout(1500);
await page.locator("button", { hasText: "3D" }).first().click();
await page.waitForTimeout(26000);
const names = await page.locator("#tree-panel .tp-name").allTextContents().catch(()=>[]);
const total = (await page.locator("#tree-panel .tp-total").textContent().catch(()=>"")||"").trim();
console.log("panel:", total, "| species:", names);
await page.screenshot({ path: "cad/_rows_over.png" });
// zoom toward north (trees) — cursor upper-center, wheel in
await page.mouse.move(700, 280);
for (let i=0;i<7;i++){ await page.mouse.wheel(0,-300); await page.waitForTimeout(250); }
await page.waitForTimeout(3000);
await page.screenshot({ path: "cad/_rows_near.png" });
console.log("ERRORS:", errs.length ? errs.slice(0,6) : "none");
await b.close();
