import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import assert from "node:assert/strict";
// Focused scene/layout review. The separate destination.browser test drives the full route.
const html=await readFile("dist/blue-98.html");
const server=createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const report={errors:[]};let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:960,height:720}});page.setDefaultTimeout(120000);
  page.on("pageerror",e=>report.errors.push(e.message));page.on("console",m=>{if(m.type()==="error")report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?terrain-review=1`,{waitUntil:"commit"});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  await page.locator('[data-location="camp"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.collectedAnimals),"0","inspection does not award rewards");
  await page.locator("#inspect").click();
  await page.waitForFunction(()=>document.documentElement.dataset.collectedAnimals==="3");
  await page.locator("#camera-height").evaluate(e=>{e.value="8";e.dispatchEvent(new Event("input",{bubbles:true}));});
  await page.waitForFunction(()=>Number(document.documentElement.dataset.cameraY)>Number(document.documentElement.dataset.groundY)+8.9);
  // The review toolbar is not present during normal gameplay; hide it for scene evidence.
  await page.addStyleTag({content:"#world-tools { visibility: hidden; }"});
  await page.screenshot({path:"evidence/renders/destination-visible-animals.png",timeout:90000});
  report.arrival=await page.evaluate(()=>({...document.documentElement.dataset}));
  await page.locator("#reward-close").click();
  const canvas=await page.locator("#scene").evaluate(c=>c.toDataURL());
  await writeFile("evidence/renders/destination-animals-scene.png",Buffer.from(canvas.split(",")[1],"base64"));
  await page.setViewportSize({width:640,height:390});
  await page.screenshot({path:"evidence/renders/destination-landscape.png",timeout:90000});
  report.landscape=await page.evaluate(()=>Object.fromEntries(["#minimap","#touch",".telemetry","footer"].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{left:r.left,right:r.right,top:r.top,bottom:r.bottom}];})));
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  for(const [a,b] of [["#minimap",".telemetry"],["#minimap","#touch"],["#minimap","footer"],["#touch",".telemetry"],["#touch","footer"]])assert(!overlap(report.landscape[a],report.landscape[b]),`${a} overlaps ${b}`);
  await page.locator("#quest-replay").click();await page.waitForFunction(()=>document.documentElement.dataset.collectedAnimals==="0");
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.x),"0.000");
  assert.deepEqual(report.errors,[]);report.pass=true;
  console.log("PASS focused campsite models, inspection gating, reward/replay, landscape controls and no browser errors");
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{await writeFile("evidence/destination-visual-qa.json",JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
