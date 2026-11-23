import { chromium } from "playwright-core";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const url = process.env.RC_URL || "http://127.0.0.1:5198";
const browser = process.argv[2]
  ? await chromium.connectOverCDP(process.argv[2], { timeout: 15000 })
  : await chromium.launch({
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
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  errors = [],
  results = {};
page.setDefaultNavigationTimeout(120000);
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE ERROR", e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log("CONSOLE ERROR", m.text());
  }
});
page.on("response", (r) => {
  if (r.status() >= 400) console.log("HTTP ERROR", r.status(), r.url());
});
await mkdir("evidence/renders", { recursive: true });
const ready = () =>
  page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
    {},
    { timeout: 120000 },
  );
const state = () =>
  page.evaluate(() => ({ ...document.documentElement.dataset, map: {...document.getElementById("minimap").dataset} }));
const shot = (name) =>
  page.screenshot({
    path: `evidence/renders/navigation-${name}.png`,
    timeout: 90000,
  });
try {
  console.log("Opening", url);
  await page.goto(url, { waitUntil: "networkidle" });
  console.log("Page navigated");
  await ready();
  console.log("WebGL ready");
  await shot("desktop");
  results.loaded = await state();
  assert.equal(results.loaded.world, "unbounded");
  assert.equal(results.loaded.chunks, "49");
  console.log("Loaded desktop WebGL page");
  const slider = page.locator("#camera-height"), mapToggle = page.locator("#map-toggle");
  assert.equal(await mapToggle.getAttribute("aria-expanded"), "true");
  const mapBounds = await page.locator("#minimap").boundingBox();
  assert(mapBounds.x > 1000 && mapBounds.y < 100 && mapBounds.width < 230);
  await page.waitForFunction(() => Number(document.getElementById("minimap").dataset.terrainPaints) > 0);
  results.mapPixels = await page.locator("#minimap-canvas").evaluate(canvas => {
    const data = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
    let water=0,rock=0;
    for(let i=0;i<data.length;i+=4) {
      if(data[i+1]-data[i]>40 && data[i+2]>150) water++;
      if(Math.abs(data[i]-104)<3 && Math.abs(data[i+1]-107)<3) rock++;
    }
    return {water,rock};
  });
  assert(results.mapPixels.water>100 && results.mapPixels.rock>20, "Map must contain shared river and rocks");
  await slider.focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(() => document.documentElement.dataset.cameraHeight === "2" && Number(document.documentElement.dataset.cameraY) < 3.3);
  results.cameraLow = await state();
  assert.equal(results.cameraLow.mode,"driving");
  assert.equal(results.cameraLow.speed,"0.000");
  await shot("camera-low");
  await page.keyboard.press("End");
  await page.waitForFunction(() => Number(document.documentElement.dataset.cameraY) > 18.7);
  results.cameraHigh = await state();
  assert(Number(results.cameraHigh.cameraY)-Number(results.cameraLow.cameraY)>15);
  await shot("camera-high");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.documentElement.dataset.cameraHeight === "17.8");
  results.focusedSlider = await state();
  assert.equal(results.focusedSlider.keyEvents,results.cameraLow.keyEvents);
  assert.equal(results.focusedSlider.speed,"0.000");
  assert.equal(results.focusedSlider.steer,"0.000");
  for(const [mode,height] of [[1,"4.8"],[2,"14"],[0,"4"]]) {
    await page.keyboard.press("c");
    await page.waitForFunction(h=>document.documentElement.dataset.cameraHeight===h,height);
    assert.equal((await state()).cameraMode,String(mode));
    assert.equal(await slider.inputValue(),height);
    await page.keyboard.press("End");
    await page.keyboard.press("r");
    await page.waitForFunction(h=>document.documentElement.dataset.cameraHeight===h,height);
    assert.equal((await state()).cameraMode,String(mode));
  }
  await page.locator("#inspect").click();
  assert(await slider.isDisabled());
  await page.locator("#inspect").click();
  assert(await slider.isEnabled());
  await mapToggle.focus();
  await page.keyboard.press("Space");
  assert.equal(await mapToggle.getAttribute("aria-expanded"),"false");
  const paints=(await state()).map.terrainPaints;
  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await page.waitForFunction(()=>Math.abs(Number(document.documentElement.dataset.yaw))>.2);
  await page.keyboard.up("a");
  await page.keyboard.up("w");
  results.turned=await state();
  assert.equal(results.turned.map.terrainPaints,paints,"folded map must not repaint terrain");
  await mapToggle.click();
  await page.locator("#scene").click({position:{x:640,y:400}});
  await page.keyboard.down("Space");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.speed)===0);
  await page.keyboard.up("Space");
  results.mapTurn=await state();
  assert.equal(results.mapTurn.map.centerX,results.mapTurn.x);
  assert.equal(results.mapTurn.map.centerZ,results.mapTurn.z);
  assert(Math.abs(Number(results.mapTurn.map.heading)-(Math.PI-Number(results.mapTurn.yaw)))<.00002);
  await page.keyboard.press("r");
  await page.waitForFunction(()=>document.documentElement.dataset.z==="0.000");
  console.log("PASS map rendering/folding/heading; actual camera elevation, presets, R and focus isolation");
  await page.keyboard.down("w");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.surface === "water" &&
      Number(document.documentElement.dataset.speed) < 9,
    {},
    { timeout: 180000 },
  );
  await page.keyboard.up("w");
  results.crossing = await state();
  await shot("crossing");
  assert.equal(results.crossing.surface, "water");
  console.log(
    "Drove from spawn into river",
    results.crossing.z,
    results.crossing.speed,
  );
  await page.keyboard.down("w");
  await page.waitForFunction(
    () =>
      Number(document.documentElement.dataset.z) > 61 &&
      Number(document.documentElement.dataset.speed) > 9,
    {},
    { timeout: 120000 },
  );
  await page.keyboard.up("w");
  results.recovery = await state();
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.speed) === 0,
  );
  await page.keyboard.up("Space");
  results.brake = await state();
  await page.keyboard.press("r");
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.z) === 0,
  );
  results.reset = await state();
  await page.goto(url + "/?terrain-review=1", { waitUntil: "networkidle" });
  await ready();
  for (const name of ["rocks", "ford", "mud", "ridge", "overview"]) {
    await page.locator(`[data-location="${name}"]`).click();
    await page.waitForFunction(
      (n) => document.getElementById("world-tools").dataset.view === n,
      name,
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await shot(name);
    results[name] = await state();
    console.log("Rendered", name);
  }
  for (const [name, target] of [
    ["boundary", 315],
    ["distant", 4110],
    ["rebase", 2068],
    ["closepass", 0],
  ]) {
    await page.locator(`[data-location="${name}"]`).click();
    await page.waitForFunction(
      (n) => document.getElementById("world-tools").dataset.view === n,
      name,
    );
    results[name + "Start"] = await state();
    await shot(name + "-start");
    await page.locator("#inspect").click();
    await page.keyboard.down("w");
    await page.waitForFunction(
      (z) => Number(document.documentElement.dataset.z) > z,
      target,
      { timeout: 180000 },
    );
    await page.keyboard.up("w");
    results[name + "Drive"] = await state();
    assert.equal(results[name + "Drive"].map.centerZ, results[name + "Drive"].z);
    assert.equal(results[name + "Drive"].map.centerX, results[name + "Drive"].x);
    assert(Number(results[name + "Drive"].cameraClearance)>=1.199);
    assert.equal(results[name + "Drive"].groundLoaded, "true");
    assert(
      Number(results[name + "Drive"].speed) > 5,
      "vehicle should pass through the route without an invisible wall",
    );
    if (name === "rebase") {
      assert.equal(results[name + "Start"].originZ, "0");
      assert.equal(results[name + "Drive"].originZ, "2048");
      assert(Math.abs(Number(results[name + "Drive"].renderZ)) < 128);
    }
    await page.keyboard.down("Space");
    await page.waitForFunction(
      () => Number(document.documentElement.dataset.speed) === 0,
    );
    await page.keyboard.up("Space");
    await page.waitForFunction(
      () => document.documentElement.dataset.pendingChunks === "0",
    );
    assert.equal((await state()).chunks, "49");
    await shot(name + "-drive");
    await page.keyboard.press("r");
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.z === "0.000" &&
        document.documentElement.dataset.originZ === "0",
    );
    console.log("PASS driving scenario", name, results[name + "Drive"].z);
  }
  await page.goto(url + "/?review=1", { waitUntil: "networkidle" });
  await ready();
  assert.equal(await page.locator("#minimap").isVisible(),false);
  await page.locator("#qa").click();
  await page.waitForFunction(
    () =>
      document.getElementById("capture-status").textContent.includes("测试"),
    {},
    { timeout: 20000 },
  );
  results.integration = await page.locator("#capture-status").textContent();
  assert.equal(results.integration, "驾驶测试全部通过");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await ready();
  await shot("mobile");
  assert.equal(await mapToggle.getAttribute("aria-expanded"),"false");
  const forward = page.locator('[data-key="KeyW"]');
  await forward.scrollIntoViewIfNeeded();
  const bounds = await forward.boundingBox();
  assert(bounds);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.speed) > 1,
  );
  await page.mouse.up();
  results.mobile = await state();
  assert.equal(await mapToggle.getAttribute("aria-expanded"),"true");
  await shot("mobile-driving");
  await mapToggle.click();
  await page.locator("#reset").click();
  assert.equal(await mapToggle.getAttribute("aria-expanded"),"false");
  await mapToggle.click();
  const sliderBounds=await slider.boundingBox();
  assert(sliderBounds && sliderBounds.x>=0 && sliderBounds.x+sliderBounds.width<=390);
  await page.mouse.move(sliderBounds.x+sliderBounds.width*.25,sliderBounds.y+sliderBounds.height/2);
  await page.mouse.down();
  await page.mouse.move(sliderBounds.x+sliderBounds.width*.85,sliderBounds.y+sliderBounds.height/2,{steps:5});
  await page.mouse.up();
  await page.waitForFunction(()=>Number(document.documentElement.dataset.cameraHeight)>14);
  results.mobileHeight=await state();
  assert.equal(results.mobileHeight.speed,"0.000");
  assert.equal(results.mobileHeight.z,"0.000");
  await shot("mobile-height");
  const boxes=await page.evaluate(()=>Object.fromEntries(["#minimap","#help","#touch",".telemetry","footer"].map(s=>{
    const r=document.querySelector(s).getBoundingClientRect(); return[s,{left:r.left,right:r.right,top:r.top,bottom:r.bottom}];
  })));
  const intersects=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
  for(const [a,b] of [["#minimap","#help"],["#minimap","#touch"],["#minimap",".telemetry"],["#touch","footer"],[".telemetry","footer"]]) assert(!intersects(boxes[a],boxes[b]),`${a} overlaps ${b}`);
  results.mobileLayout=boxes;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  await ready();
  await page.locator("#inspect").click();
  await page.keyboard.press("e");
  await page.waitForFunction(
    () => document.documentElement.dataset.exploded === "true",
  );
  results.inspection = await state();
  await page.keyboard.press("r");
  results.errors = errors;
  assert.deepEqual(errors, []);
  console.log(
    "PASS: river, recovery, former boundary, 4 km terrain, seamless origin shift, close rock pass, reset, integration QA, mobile, inspection; zero browser errors",
  );
} catch (e) {
  results.failure = String(e);
  try {
    results.failureState = await state();
    results.body = await page.locator("body").innerText({ timeout: 3000 });
    await page.screenshot({
      path: "evidence/renders/navigation-failure.png",
      timeout: 3000,
    });
  } catch {}
  throw e;
} finally {
  results.errors = errors;
  await writeFile(
    "evidence/navigation-browser-qa.json",
    JSON.stringify(results, null, 2),
  );
  await context.close();
  if (!process.argv[2]) await browser.close();
}
process.exit(0);
