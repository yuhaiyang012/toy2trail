import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {build} from "esbuild";
import assert from "node:assert/strict";
const b=await build({entryPoints:["src/ridge.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const ridge=await import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
const route=Array.from({length:361},(_,i)=>ridge.ridgePoint(i));
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
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.setDefaultTimeout(240000);
  page.on("pageerror",e=>report.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")report.errors.push(m.text());if(m.text().startsWith("RIDGE"))console.log(m.text());});
  page.on("request",r=>report.requests.push(r.url()));
  const state=()=>page.evaluate(()=>({...document.documentElement.dataset}));
  const shot=name=>page.screenshot({path:`evidence/renders/ridge-${name}.png`,timeout:90000});
  const brake=async()=>{await page.keyboard.down("Space");await page.waitForFunction(()=>Number(document.documentElement.dataset.speed)===0);await page.keyboard.up("Space");};
  console.log("Opening standalone mountain terrain");
  await page.goto(url,{waitUntil:"commit"});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  await page.locator('[data-location="ridge"]').click();
  await page.waitForFunction(()=>document.getElementById("world-tools").dataset.view==="ridge");
  report.foot=await state();
  // Existing inspection controls: orbit to look west and zoom out over the new ridge.
  await page.mouse.move(280,350);await page.mouse.down();await page.mouse.move(600,365,{steps:16});await page.mouse.up();
  await page.mouse.wheel(0,1000);
  await shot("landscape");
  await page.locator("#inspect").click();
  // Reverse a short arc onto the trail using the unchanged controls, then climb west.
  await page.keyboard.down("s");await page.keyboard.down("a");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.yaw)<-1.15);
  await page.keyboard.up("s");await page.keyboard.up("a");await brake();
  report.ascent=await page.evaluate(({route,startX})=>new Promise((resolve,reject)=>{
    const keys=new Set();const samples=[];let marker=0;
    const key=(code,down)=>{if(keys.has(code)===down)return;if(down)keys.add(code);else keys.delete(code);document.dispatchEvent(new KeyboardEvent(down?"keydown":"keyup",{code,key:code.slice(3).toLowerCase(),bubbles:true}));};
    const stop=()=>{for(const code of [...keys])key(code,false);};
    const timer=setTimeout(()=>{stop();reject(new Error("mountain climb timed out"));},230000);
    function frame(){
      const d=document.documentElement.dataset,x=Number(d.x),z=Number(d.z),yaw=Number(d.yaw),u=startX-x;
      if(u>=215){clearTimeout(timer);stop();resolve({samples,arrival:{...d}});return;}
      const target=route[Math.max(0,Math.min(360,Math.floor(u+10)))];
      const desired=Math.atan2(target.x-x,target.z-z),error=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
      key("KeyW",true);key("KeyA",error>.035);key("KeyD",error<-.035);
      if(u>=marker){samples.push({x,z,height:Number(d.groundY),speed:Number(d.speed),ground:d.groundLoaded});console.info(`RIDGE ascent ${Math.round(u)} / 215, elevation ${d.groundY}`);marker+=40;}
      requestAnimationFrame(frame);
    }
    frame();
  }),{route,startX:ridge.RIDGE_START_X});
  await brake();report.summit=await state();
  assert(Number(report.summit.groundY)>50,"must actually reach the mountain summit");
  assert(Number(report.summit.groundY)-Number(report.foot.groundY)>35);
  assert(report.ascent.samples.every(s=>s.ground==="true"));
  assert(Number(report.summit.cameraClearance)>=1.199);
  assert.equal(report.summit.chunks,"49");
  await shot("summit-driving");
  await page.locator("#inspect").click();
  await page.mouse.wheel(0,400);
  await shot("summit-valley");
  await page.keyboard.press("r");
  await page.waitForFunction(()=>document.documentElement.dataset.x==="0.000"&&document.documentElement.dataset.groundY==="0.000");
  report.reset=await state();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[url]);report.pass=true;
  console.log("PASS: standalone ridge landscape, actual ascent with existing controls, summit above 50, loaded terrain, camera clearance, reset; no errors or external assets");
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{await writeFile("evidence/ridge-browser-qa.json",JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
