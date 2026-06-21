import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.route(/elevation3d\.arcgis\.com/, r=>r.abort());
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto("http://localhost:5173"); await page.waitForTimeout(1500);
const b = page.locator("button", { hasText: "3D" }).first();
if (await b.count()) { await b.click(); await page.waitForTimeout(8000); }
// top-down centered on tree centroid, zoomed out to see nearby roundabout
await page.evaluate(()=>{
  const v=window.__viewer,C=window.Cesium;
  v.camera.setView({destination:C.Cartesian3.fromDegrees(106.5606, 11.5272, 1600),
    orientation:{heading:0,pitch:C.Math.toRadians(-90)}});
});
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/viz_overview.png" });
await browser.close();
console.log("done");
