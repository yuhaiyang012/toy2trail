import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {build} from "esbuild";
import assert from "node:assert/strict";
const built=await build({entryPoints:["src/destination.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const quest=await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
const html=await readFile("dist/blue-98.html");
const server=createServer((req,res)=>{
  if(req.url==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);}
  else{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}/`;
let browser;const report={errors:[],requests:[]};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  page.setDefaultTimeout(240000);
  page.on("pageerror",e=>report.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")report.errors.push(m.text());if(m.text().startsWith("CAMP"))console.log(m.text());});
  page.on("request",r=>report.requests.push(r.url()));
  const state=()=>page.evaluate(()=>({...document.documentElement.dataset,map:{...document.getElementById("minimap").dataset}}));
  const shot=name=>page.screenshot({path:`evidence/renders/destination-${name}.png`,timeout:90000});
  const brake=async()=>{await page.keyboard.down("Space");await page.waitForFunction(()=>Number(document.documentElement.dataset.speed)===0);await page.keyboard.up("Space");};
  console.log("Opening standalone destination quest");
  await page.goto(url,{waitUntil:"commit"});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true"&&document.getElementById("minimap").dataset.targetKind);
  report.start=await state();assert.equal(report.start.collectedAnimals,"0");
  assert(await page.locator("#destination-card").isVisible());
  await shot("departure-map");
  // Keep software WebGL's fill cost down during the continuous driving leg.
  await page.setViewportSize({width:640,height:480});
  // Real keyboard navigation along the reference route; no teleports or application state writes.
  report.journey=await page.evaluate(route=>new Promise((resolve,reject)=>{
    const keys=new Set(),samples=[];let marker=0;
    const cumulative=[0];for(let i=1;i<route.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z));
    const key=(code,down)=>{if(keys.has(code)===down)return;if(down)keys.add(code);else keys.delete(code);document.dispatchEvent(new KeyboardEvent(down?"keydown":"keyup",{code,bubbles:true}));};
    const stop=()=>{for(const code of [...keys])key(code,false);};
    const timer=setTimeout(()=>{stop();reject(new Error("journey timed out"));},720000);
    function frame(){
      const d=document.documentElement.dataset,x=Number(d.x),z=Number(d.z),yaw=Number(d.yaw);
      if(d.destinationComplete==="true"){clearTimeout(timer);stop();resolve({samples,arrival:{...d}});return;}
      let off=Infinity,progress=0;
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len*len))),dist=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
        if(dist<off){off=dist;progress=cumulative[i-1]+len*t;}
      }
      const look=Math.min(cumulative.at(-1),progress+6);let target=route.at(-1);
      for(let i=1;i<route.length;i++)if(cumulative[i]>=look){const t=(look-cumulative[i-1])/(cumulative[i]-cumulative[i-1]);target={x:route[i-1].x+(route[i].x-route[i-1].x)*t,z:route[i-1].z+(route[i].z-route[i-1].z)*t};break;}
      const wanted=Math.atan2(target.x-x,target.z-z),error=Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw));
      key("KeyW",Number(d.speed)<7);key("KeyA",error>.035);key("KeyD",error<-.035);
      if(progress>=marker){samples.push({progress,off,x,z,height:Number(d.groundY),loaded:d.groundLoaded});console.info(`CAMP ${Math.round(progress)} / 281, elevation ${d.groundY}`);marker+=40;}
      requestAnimationFrame(frame);
    }frame();
  }),quest.CAMP_ROUTE);
  await brake();await page.waitForFunction(()=>document.getElementById("destination-card").dataset.completed==="true");
  await page.setViewportSize({width:1100,height:760});
  report.arrival=await state();
  assert.equal(report.arrival.collectedAnimals,"3");assert.equal(report.arrival.destinationUnlocks,"1");
  assert(Number(report.arrival.groundY)>50);
  assert(report.journey.samples.every(p=>p.off<4&&p.loaded==="true"));
  assert(await page.locator("#animal-reward").isVisible());
  assert.equal(await page.locator(".animal-sticker").count(),3);
  await page.locator("#camera-height").focus();await page.keyboard.press("End");
  await page.waitForFunction(()=>Number(document.documentElement.dataset.cameraY)>Number(document.documentElement.dataset.groundY)+18);
  await shot("arrival-reward");
  console.log("PASS full drive from spawn, mountain arrival and three rewards");
  await page.locator("#reward-close").click();assert(!await page.locator("#animal-reward").isVisible());
  await shot("animal-camp");
  assert.equal((await state()).destinationUnlocks,"1");
  await page.keyboard.press("r");await page.waitForFunction(()=>document.documentElement.dataset.x==="0.000");
  assert.equal((await state()).collectedAnimals,"3");
  await page.reload({waitUntil:"commit"});await page.waitForFunction(()=>document.documentElement.dataset.collectedAnimals==="3");
  report.restored=await state();assert.equal(report.restored.destinationUnlocks,"0");
  assert(!await page.locator("#animal-reward").isVisible(),"refresh must not repeat the reward popup");
  console.log("PASS vehicle reset and reload preserve collected animals");

  await page.setViewportSize({width:390,height:844});
  // Expand the map deliberately; keep collection and controls usable in portrait.
  if(await page.locator("#map-toggle").getAttribute("aria-expanded")!=="true")await page.locator("#map-toggle").click();
  await shot("mobile-collection");
  report.mobile=await page.evaluate(()=>Object.fromEntries(["#minimap","#help","#touch",".telemetry","footer"].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{left:r.left,right:r.right,top:r.top,bottom:r.bottom}];})));
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  for(const [a,b] of [["#minimap","#help"],["#minimap","#touch"],["#minimap",".telemetry"],["#touch","footer"]])assert(!overlaps(report.mobile[a],report.mobile[b]),`${a} overlaps ${b}`);
  await page.locator("#quest-replay").focus();await page.keyboard.press("Enter");
  await page.waitForFunction(()=>document.documentElement.dataset.collectedAnimals==="0");
  assert.equal((await state()).speed,"0.000");assert.equal((await state()).x,"0.000");
  assert(!await page.locator("#quest-replay").isVisible());
  await page.reload({waitUntil:"commit"});await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  report.restarted=await state();assert.equal(report.restarted.collectedAnimals,"0");
  await shot("mobile-new-adventure");
  assert.deepEqual(report.errors,[]);assert(report.requests.every(r=>r===url));report.pass=true;
  console.log("PASS mobile layout, accessible replay, fresh saved progress; zero browser errors and no external assets");
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{await writeFile("evidence/destination-browser-qa.json",JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
