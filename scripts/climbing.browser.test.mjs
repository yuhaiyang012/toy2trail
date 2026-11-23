import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import assert from "node:assert/strict";

const html=await readFile("dist/blue-98.html");
const server=createServer((req,res)=>{
  if(req.url==="/?terrain-review=1") {res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);}
  else {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}/?terrain-review=1`;
let browser;
const result={errors:[],requests:[]};
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(120000);
  page.on("pageerror",e=>result.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")result.errors.push(m.text());});
  page.on("request",r=>result.requests.push(r.url()));
  const state=()=>page.evaluate(()=>({...document.documentElement.dataset}));
  const shot=name=>page.screenshot({path:`evidence/renders/climbing-${name}.png`,timeout:90000});
  const brake=async()=>{await page.keyboard.down("Space");await page.waitForFunction(()=>Number(document.documentElement.dataset.speed)===0);await page.keyboard.up("Space");};
  console.log("Opening standalone rock-climbing test");
  await page.goto(url,{waitUntil:"commit"});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  await page.locator('[data-location="climb"]').click();
  await page.waitForFunction(()=>document.getElementById("world-tools").dataset.view==="climb");
  result.start=await state();
  await page.locator("#inspect").click();
  await page.keyboard.press("c");
  await page.keyboard.down("w");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.rockLift)>.8);
  await page.keyboard.up("w");
  await brake();
  result.onRock=await state();
  const wheels=result.onRock.wheelY.split(",").map(Number);
  assert(Math.max(...wheels)-Math.min(...wheels)>.6,"independent wheels must visibly articulate");
  assert(Math.abs(Number(result.onRock.bodyRoll))>.03,"body must tilt as one wheel climbs");
  await shot("on-rock");
  console.log("PASS wheels on rock and braking",result.onRock.rockLift,result.onRock.wheelY);
  await page.keyboard.down("w");
  await page.waitForFunction(z=>Number(document.documentElement.dataset.z)>z,Number(result.start.z)+14);
  await page.keyboard.up("w");
  result.crossed=await state();
  assert(Number(result.crossed.speed)>5,"must restart on the rock and drive off");
  assert.equal(result.crossed.groundLoaded,"true");
  await brake();
  await shot("crossed");
  console.log("PASS forward climb, on-rock restart and recovery");
  await page.keyboard.down("s");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.rockLift)>.8);
  result.reverseOnRock=await state();
  await page.waitForFunction(z=>Number(document.documentElement.dataset.z)<z,Number(result.start.z));
  await page.keyboard.up("s");
  await brake();
  result.reversed=await state();
  await shot("reversed");
  assert(Number(result.reverseOnRock.speed)<0);
  assert.equal(result.reversed.speed,"0.000");
  console.log("PASS reverse climb and brake hold");
  await page.keyboard.press("r");
  await page.waitForFunction(()=>document.documentElement.dataset.z==="0.000");
  assert.equal((await state()).rockLift,"0.000");
  const slider=page.locator("#camera-height");
  await slider.focus();await page.keyboard.press("End");
  await page.waitForFunction(()=>document.documentElement.dataset.cameraHeight==="18");
  assert.equal((await state()).speed,"0.000");
  assert.equal(await page.locator("#map-toggle").getAttribute("aria-expanded"),"true");
  await page.locator("#inspect").click();await page.keyboard.press("e");
  await page.waitForFunction(()=>document.documentElement.dataset.exploded==="true");
  assert(await slider.isDisabled());
  await page.keyboard.press("r");
  result.reset=await state();
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.requests,[url],"standalone should only request its HTML");
  result.pass=true;
  console.log("PASS standalone climb, restart, reverse, suspension, map/camera/inspection/reset; zero errors, one HTML request");
} catch(e) {result.pass=false;result.failure=String(e);throw e;}
finally {
  await writeFile("evidence/climbing-browser-qa.json",JSON.stringify(result,null,2));
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
