import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import assert from "node:assert/strict";

const html=await readFile("dist/blue-98.html");
const server=createServer((req,res)=>{
  if(req.url==="/?terrain-review=1"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);}
  else{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}/?terrain-review=1`;
let browser;
const report={errors:[],requests:[]};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:1100,height:720}});
  page.setDefaultTimeout(120000);
  page.on("pageerror",e=>report.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")report.errors.push(m.text());});
  page.on("request",r=>report.requests.push(r.url()));
  const state=()=>page.evaluate(()=>({...document.documentElement.dataset}));
  const canvasShot=async(name)=>{
    const data=await page.locator("#scene").evaluate(c=>c.toDataURL());
    await writeFile(`evidence/renders/effects-${name}.png`,Buffer.from(data.split(",")[1],"base64"));
  };
  const brake=async()=>{await page.keyboard.down("Space");await page.waitForFunction(()=>Number(document.documentElement.dataset.speed)===0);await page.keyboard.up("Space");};
  const visit=async name=>{
    await page.locator(`[data-location="${name}"]`).click();
    await page.waitForFunction(n=>document.getElementById("world-tools").dataset.view===n,name);
    await page.locator("#inspect").click();
  };
  console.log("Opening standalone visual driving effects");
  await page.goto(url,{waitUntil:"commit"});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  report.idle=await state();
  assert.equal(report.idle.dustParticles,"0");assert.equal(report.idle.tireTracks,"0");
  await page.keyboard.press("c"); // Existing side-follow view makes wheel contact visible.
  await page.keyboard.down("w");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.z)>10&&Number(document.documentElement.dataset.dustParticles)>5);
  report.dry=await state();await canvasShot("dry-driving");
  await page.keyboard.up("w");await brake();
  assert(Number(report.dry.tireTracks)>10);assert.equal(report.dry.splashParticles,"0");
  report.stopped=await state();
  await page.waitForFunction(()=>document.documentElement.dataset.dustParticles==="0");
  report.settled=await state();
  for(const key of ["dustEmitted","splashesEmitted","tracksEmitted"])assert.equal(report.settled[key],report.stopped[key]);
  await canvasShot("tracks");
  console.log("PASS dry-road dust/tracks and stopped emission");

  await visit("ford");await page.keyboard.down("w");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.splashParticles)>=12&&Number(document.documentElement.dataset.speed)>2.5);
  report.ford=await state();await canvasShot("water-splashes");
  assert.equal(report.ford.dustParticles,"0");assert.equal(report.ford.tireTracks,"0");
  await page.keyboard.up("w");await brake();
  await page.waitForFunction(()=>document.documentElement.dataset.splashParticles==="0");
  console.log("PASS wheel splashes and no underwater tire tracks");

  await visit("mud");await page.keyboard.down("s");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.tireTracks)>12);
  report.mud=await state();await canvasShot("mud-reverse");
  assert(Number(report.mud.speed)<0);assert.equal(report.mud.dustParticles,"0");
  await page.keyboard.up("s");await brake();
  console.log("PASS reverse muddy wheel marks");

  await visit("rebase");await page.keyboard.down("w");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.z)>2055);
  report.rebase=await state();
  assert.equal(report.rebase.originZ,"2048");assert.equal(report.rebase.groundLoaded,"true");
  assert(Number(report.rebase.tracksEmitted)>0);
  await page.keyboard.up("w");await brake();await canvasShot("after-rebase");
  console.log("PASS origin change while effects are active");

  await page.keyboard.press("r");
  await page.waitForFunction(()=>document.documentElement.dataset.z==="0.000"&&document.documentElement.dataset.tireTracks==="0");
  report.reset=await state();
  for(const key of ["dustParticles","splashParticles","tireTracks","dustEmitted","splashesEmitted","tracksEmitted"])assert.equal(report.reset[key],"0");
  await page.locator("#inspect").click();await page.keyboard.press("e");
  await page.waitForFunction(()=>document.documentElement.dataset.exploded==="true");
  assert.equal((await state()).tireTracks,"0");
  await page.keyboard.press("r");
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[url]);report.pass=true;
  console.log("PASS reset, inspection, zero browser errors and one standalone HTML request");
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{
  await writeFile("evidence/effects-browser-qa.json",JSON.stringify(report,null,2));
  if(browser)await browser.close();await new Promise(r=>server.close(r));
}
