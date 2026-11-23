import { chromium } from "playwright-core";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import assert from "node:assert/strict";

// Serve only the deliverable: no Vite, asset directory or CDN is available.
const html = await readFile("dist/blue-98.html");
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const result = { requests: [], errors: [] };
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.RC_CHROME ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });
  page.on("request", (req) => result.requests.push(req.url()));
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") result.errors.push(message.text());
  });
  await page.goto(url, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
    {},
    { timeout: 120000 },
  );
  await page.keyboard.down("w");
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.z) > 1,
  );
  await page.keyboard.up("w");
  result.driving = await page.evaluate(() => ({
    ...document.documentElement.dataset,
  }));
  await page.keyboard.press("r");
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.z) === 0,
  );
  result.reset = await page.evaluate(() => ({
    ...document.documentElement.dataset,
  }));
  await page.locator("#camera-height").focus();
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.documentElement.dataset.cameraHeight === "18" && Number(document.documentElement.dataset.cameraY) > 18.7);
  assert.equal(await page.locator("#map-toggle").getAttribute("aria-expanded"),"true");
  result.navigation = await page.evaluate(() => ({
    ...document.documentElement.dataset,
    map: {...document.getElementById("minimap").dataset},
  }));
  assert.equal(result.navigation.speed,"0.000");
  assert.equal(result.navigation.map.centerZ,"0.000");
  await page.screenshot({
    path: "evidence/renders/navigation-standalone.png",
    timeout: 90000,
  });
  await page.setViewportSize({width:390,height:844});
  await page.locator("#reset").click();
  const slider=page.locator("#camera-height");
  await slider.focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(()=>document.documentElement.dataset.cameraHeight === "2");
  assert.equal(await page.locator(".intro").isVisible(),false,"portrait intro must disappear immediately when driving starts");
  await page.screenshot({path:"evidence/renders/navigation-mobile-transition.png",timeout:90000});
  await page.waitForFunction(()=>Math.abs(Number(document.documentElement.dataset.cameraY)-(1.05+2*1.3/(390/844)))<.3);
  await page.screenshot({path:"evidence/renders/navigation-mobile-low.png",timeout:90000});
  result.mobileLow = await page.evaluate(()=>({...document.documentElement.dataset}));
  await page.keyboard.press("End");
  await page.waitForFunction(()=>Math.abs(Number(document.documentElement.dataset.cameraY)-(1.05+18*1.3/(390/844)))<.3);
  await page.screenshot({path:"evidence/renders/navigation-mobile-high.png",timeout:90000});
  result.mobileHigh = await page.evaluate(()=>({...document.documentElement.dataset}));
  assert.equal(result.mobileLow.speed,"0.000");
  assert.equal(result.mobileHigh.speed,"0.000");
  const bounds=await slider.boundingBox();
  await page.touchscreen.tap(bounds.x+bounds.width*.35,bounds.y+bounds.height/2);
  await page.waitForFunction(()=>Number(document.documentElement.dataset.cameraHeight)<10);
  result.mobileTouch = await page.evaluate(()=>({...document.documentElement.dataset}));
  assert.equal(result.mobileTouch.speed,"0.000");
  assert.deepEqual(result.errors, []);
  assert.equal(result.driving.world, "unbounded");
  assert.equal(result.driving.groundLoaded, "true");
  assert.equal(result.reset.chunks, "49");
  assert.deepEqual(
    result.requests,
    [url],
    "Standalone requested an additional resource",
  );
  result.pass = true;
  console.log(
    "PASS: standalone rendering/driving/reset/map/height, portrait low/high/transition and touch input; only the HTML requested; zero browser errors",
  );
} catch (error) {
  result.pass = false;
  result.failure = String(error);
  throw error;
} finally {
  await writeFile(
    "evidence/navigation-standalone-qa.json",
    JSON.stringify(result, null, 2),
  );
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
