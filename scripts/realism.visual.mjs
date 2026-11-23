import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const baseline=process.argv.includes('--baseline');
if(baseline&&!process.env.RC_BASELINE_HTML)throw new Error('Set RC_BASELINE_HTML to the previous standalone HTML for baseline screenshots.');
const html=await readFile(baseline?process.env.RC_BASELINE_HTML:'dist/blue-98.html');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={baseline,errors:[],views:{},requests:[]};let browser;
await mkdir('evidence/renders',{recursive:true});
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RC_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.RC_ANGLE==='metal'?['--use-gl=angle','--use-angle=metal']:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:720}});page.setDefaultTimeout(300000);
  page.on('pageerror',e=>{report.errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){report.errors.push(m.text());console.error(m.text());}});
  page.on('request',r=>report.requests.push(r.url()));
  const url=process.env.RC_VISUAL_URL||`http://127.0.0.1:${server.address().port}/?terrain-review=1`;
  report.url=url;
  console.log('Opening standalone visual review');
  await page.goto(url,{waitUntil:'commit'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  report.graphics=await page.locator('#scene').evaluate(c=>{const g=c.getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
  console.log('Renderer:',report.graphics);
  await page.addStyleTag({content:'#world-tools{visibility:hidden}'});
  for(const view of ['spawn','rocks','mud','ridge','ford','distant']){
    // Use the existing review location control, whose toolbar is hidden only for screenshots.
    await page.locator(`[data-location="${view}"]`).evaluate(e=>e.click());
    await page.waitForFunction(()=>document.documentElement.dataset.groundLoaded==='true');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const data=await page.evaluate(()=>({...document.documentElement.dataset}));
    assert.equal(data.mode,'inspect');assert.equal(data.chunks,'49');
    report.views[view]=data;
    await page.screenshot({path:`evidence/renders/realism-${baseline?'before':'after'}-${view}.png`,timeout:120000});
    console.log(`Captured ${baseline?'before':'after'} ${view}`);
  }
  if(!baseline){
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-location="spawn"]').evaluate(e=>e.click());
    await page.screenshot({path:'evidence/renders/realism-mobile.png',timeout:120000});
    await page.locator('#inspect').click();
    await page.keyboard.down('w');
    await page.waitForFunction(()=>Number(document.documentElement.dataset.z)>6);
    await page.keyboard.up('w');await page.keyboard.down('Space');
    await page.waitForFunction(()=>document.documentElement.dataset.speed==='0.000');
    await page.keyboard.up('Space');
    report.driving=await page.evaluate(()=>({...document.documentElement.dataset}));
    // Losing focus on a slope must park the vehicle until driving input resumes.
    await page.locator('[data-location="ridge"]').evaluate(e=>e.click());
    await page.locator('#inspect').click();
    await page.keyboard.press('Space');
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const parked=await page.evaluate(()=>({...document.documentElement.dataset}));
    await page.evaluate(()=>new Promise(resolve=>{let frames=0;function tick(){if(++frames===15)resolve();else requestAnimationFrame(tick);}tick();}));
    report.parked=await page.evaluate(()=>({...document.documentElement.dataset}));
    assert.equal(report.parked.x,parked.x);assert.equal(report.parked.z,parked.z);assert.equal(report.parked.speed,'0.000');
    assert.equal(report.parked.drivingPaused,'true');
    await page.keyboard.press('r');
    await page.waitForFunction(()=>document.documentElement.dataset.x==='0.000'&&document.documentElement.dataset.z==='0.000');
    // Studio mode is still usable independently of outdoor shader changes.
    console.log('Checking retained studio view');
    await page.goto(url.replace('terrain-review','review'),{waitUntil:'commit'});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:300000});
    report.review=await page.evaluate(()=>({...document.documentElement.dataset}));
  }
  assert.deepEqual(report.errors,[]);
  assert(report.requests.every(u=>u.startsWith(new URL(url).origin+'/')));
  report.pass=true;console.log('PASS final visuals, mobile driving, paused hillside, studio view and self-contained assets');
}catch(e){report.pass=false;report.failure=String(e);throw e;}
finally{await writeFile(`evidence/realism-${baseline?'baseline':'visual'}-qa.json`,JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
