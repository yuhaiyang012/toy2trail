import {chromium} from "playwright-core";
import {readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {build} from "esbuild";
import assert from "node:assert/strict";
const b=await build({stdin:{contents:`export * from './src/delivery';export * from './src/destination';`,resolveDir:process.cwd()},bundle:true,write:false,format:"esm",platform:"node"});
const m=await import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
const html=await readFile("dist/blue-98.html");
const server=createServer((req,res)=>{if(req.url==="/?terrain-review=1"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}/?terrain-review=1`;
let browser;const report={errors:[],requests:[]};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:process.env.RC_ANGLE==="metal"?["--use-gl=angle","--use-angle=metal"]:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:960,height:720}});page.setDefaultTimeout(300000);
  // A valid persisted order makes quality/scene assertions reproducible. Later orders use real randomness.
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:m.DELIVERY_KEY,value:{version:1,phase:"pickup",order:{id:1,along:170,offset:.4,quality:2},meals:0,hearts:0,lastQuality:0}});
  page.on("pageerror",e=>report.errors.push(e.message));page.on("console",v=>{if(v.type()==="error")report.errors.push(v.text());if(v.text().startsWith("FOOD"))console.log(v.text());});page.on("request",r=>report.requests.push(r.url()));
  const state=()=>page.evaluate(()=>({...document.documentElement.dataset,map:{...document.getElementById("minimap").dataset}}));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.ready==="true"&&document.documentElement.dataset.deliveryPhase);
  const shot=name=>page.screenshot({path:`evidence/renders/delivery-${name}.png`,timeout:90000});
  async function driveUntil(phase){
    await page.setViewportSize({width:640,height:480});
    return page.evaluate(({route,phase,camp})=>new Promise((resolve,reject)=>{
      const cumulative=[0];for(let i=1;i<route.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z));
      const keys=new Set(),samples=[];let milestone=-Infinity;
      const key=(code,on)=>{if(keys.has(code)===on)return;if(on)keys.add(code);else keys.delete(code);document.dispatchEvent(new KeyboardEvent(on?"keydown":"keyup",{code,bubbles:true}));};
      const stop=()=>{for(const k of [...keys])key(k,false);};
      const timer=setTimeout(()=>{stop();reject(new Error("delivery drive timed out"));},600000);
      function frame(){
        const d=document.documentElement.dataset,x=Number(d.x),z=Number(d.z),yaw=Number(d.yaw),speed=Number(d.speed);
        if(d.deliveryPhase===phase){clearTimeout(timer);stop();resolve({samples,arrival:{...d}});return;}
        const pickup=d.deliveryPhase==="pickup",goal=pickup?{x:Number(d.foodX),z:Number(d.foodZ)}:camp,goalAlong=pickup?Number(d.foodAlong):cumulative.at(-1);
        let off=Infinity,progress=0;
        for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len*len))),dist=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(dist<off){off=dist;progress=cumulative[i-1]+len*t;}}
        const dir=Math.sign(goalAlong-progress),look=progress+dir*Math.min(6,Math.abs(goalAlong-progress));let target=goal;
        if(Math.abs(goalAlong-progress)>=6)for(let i=1;i<route.length;i++)if(cumulative[i]>=look){const t=(look-cumulative[i-1])/(cumulative[i]-cumulative[i-1]);target={x:route[i-1].x+(route[i].x-route[i-1].x)*t,z:route[i-1].z+(route[i].z-route[i-1].z)*t};break;}
        const wanted=Math.atan2(target.x-x,target.z-z),error=Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw));
        const park=Math.hypot(goal.x-x,goal.z-z)<(pickup?4:5.5);
        key("KeyW",!park&&speed<7);key("Space",park);key("KeyA",!park&&error>.035);key("KeyD",!park&&error<-.035);
        if(progress>milestone+30){samples.push({x,z,progress,phase:d.deliveryPhase,loaded:d.groundLoaded});console.info(`FOOD ${d.deliveryPhase}, route ${Math.round(progress)}, cargo ${d.cargoVisible}`);milestone=progress;}
        requestAnimationFrame(frame);
      }frame();
    }),{route:m.CAMP_ROUTE,phase,camp:m.ANIMAL_CAMP});
  }
  console.log("Opening standalone delivery test");await page.goto(url,{waitUntil:"commit"});await ready();
  report.graphics=await page.locator("#scene").evaluate(c=>{const g=c.getContext("webgl2"),e=g.getExtension("WEBGL_debug_renderer_info");return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
  report.initial=await state();assert.equal(report.initial.deliveryPhase,"pickup");assert.equal(report.initial.map.targetKind,"food");
  await page.locator('[data-location="food"]').click();
  await page.addStyleTag({content:"#world-tools{visibility:hidden}"});
  assert.equal((await state()).deliveryProgress,"0.000");await shot("pickup-site");
  await page.locator("#inspect").click();report.loading=await driveUntil("carrying");
  assert.equal(report.loading.arrival.cargoVisible,"true");assert.equal(report.loading.arrival.foodQuality,"2");assert.equal(report.loading.arrival.deliveryHearts,"0");
  await page.setViewportSize({width:960,height:720});await page.locator("#inspect").click();
  await shot("loaded-cargo");assert.match(await page.locator("#delivery-cargo").innerText(),/珍品/);
  await page.keyboard.press("e");await page.waitForFunction(()=>document.documentElement.dataset.cargoVisible==="false");
  await page.keyboard.press("e");await page.waitForFunction(()=>document.documentElement.dataset.cargoVisible==="true");
  await page.locator("#inspect").click();report.transport=await driveUntil("delivered");
  report.delivered=await state();assert.equal(report.delivered.deliveredMeals,"1");assert.equal(report.delivered.deliveryHearts,"35");assert.equal(report.delivered.cargoVisible,"false");assert.equal(report.delivered.collectedAnimals,"3");
  assert(report.transport.samples.length>2&&report.transport.samples.every(s=>s.loaded==="true"));
  await page.setViewportSize({width:960,height:720});
  await page.locator("#camera-height").evaluate(e=>{e.value="8";e.dispatchEvent(new Event("input",{bubbles:true}));});
  await page.waitForFunction(()=>Number(document.documentElement.dataset.cameraY)>Number(document.documentElement.dataset.groundY)+8.8);
  assert.match(await page.locator("#animal-reward h2").innerText(),/谢谢/);await shot("feeding-reward");
  console.log("PASS real loading, visible roof cargo, road transport, unloading, 35 hearts and animal feeding");
  await page.locator("#reward-close").click();await page.reload({waitUntil:"commit"});await ready();
  report.restored=await state();assert.equal(report.restored.deliveredMeals,"1");assert.equal(report.restored.deliveryHearts,"35");assert.equal(report.restored.deliveryPhase,"delivered");
  await page.locator("#delivery-next").focus();await page.keyboard.press("Enter");await page.waitForFunction(()=>document.documentElement.dataset.deliveryOrder==="2");
  report.next=await state();assert.equal(report.next.deliveryPhase,"pickup");assert(Math.abs(Number(report.next.foodAlong)-170)>=28);assert.equal(report.next.deliveryHearts,"35");
  await page.locator('[data-location="food"]').click();await page.locator("#inspect").click();await driveUntil("carrying");
  const carried=await state();await page.keyboard.press("r");await page.waitForFunction(()=>document.documentElement.dataset.x==="0.000"&&document.documentElement.dataset.cargoVisible==="true");
  await page.reload({waitUntil:"commit"});await ready();report.cargoRestored=await state();
  for(const key of ["deliveryOrder","foodQuality","foodX","foodZ","deliveredMeals","deliveryHearts"])assert.equal(report.cargoRestored[key],carried[key]);
  assert.equal(report.cargoRestored.deliveryPhase,"carrying");assert.equal(report.cargoRestored.cargoVisible,"true");
  await page.addStyleTag({content:"#world-tools{visibility:hidden}"});
  for(const size of [{width:390,height:844},{width:640,height:390}]){
    await page.setViewportSize(size);if(await page.locator("#map-toggle").getAttribute("aria-expanded")!=="true")await page.locator("#map-toggle").click();
    const boxes=await page.evaluate(()=>Object.fromEntries(["#minimap","#touch",".telemetry","footer"].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{left:r.left,right:r.right,top:r.top,bottom:r.bottom}];})));
    const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    for(const [a,b] of [["#minimap","#touch"],["#minimap",".telemetry"],["#minimap","footer"],["#touch","footer"]])assert(!overlaps(boxes[a],boxes[b]),`${size.width}: ${a} overlaps ${b}`);
    report[`layout${size.width}`]=boxes;await shot(size.width===390?"mobile-cargo":"landscape-cargo");
  }
  assert.deepEqual(report.errors,[]);assert(report.requests.every(r=>r===url));report.pass=true;
  console.log("PASS saved totals, new random pickup, second loading, R/reload cargo retention, portrait/landscape controls and no errors/external assets");
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{await writeFile("evidence/delivery-browser-qa.json",JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
