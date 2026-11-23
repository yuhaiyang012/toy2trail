import {build} from "esbuild";
import assert from "node:assert/strict";
const load=async file=>{
  const b=await build({entryPoints:[file],bundle:true,write:false,format:"esm",platform:"node"});
  return import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const t=await load("src/terrain.ts"),r=await load("src/ridge.ts"),c=await load("src/collision.ts"),p=await load("src/physics.ts"),s=await load("src/suspension.ts");
const slope=(x,z)=>Math.hypot((t.terrainHeight(x+.2,z)-t.terrainHeight(x-.2,z))/.4,(t.terrainHeight(x,z+.2)-t.terrainHeight(x,z-.2))/.4);
let maxSlope=0;
for(let u=0;u<=r.RIDGE_LENGTH;u+=.5){
  const a=r.ridgePoint(u),b=r.ridgePoint(u+.1);
  const yaw=Math.atan2(b.x-a.x,b.z-a.z);
  for(const side of [-5,0,5]){
    const x=a.x+Math.cos(yaw)*side,z=a.z-Math.sin(yaw)*side;
    assert(c.canOccupy(x,z,yaw),`blocked mountain route at ${u}, ${side}`);
    assert.equal(t.waterDepth(x,z),0);
    const grade=slope(x,z);maxSlope=Math.max(maxSlope,grade);
    assert(grade<.85,`abrupt route slope at ${u}: ${grade}`);
  }
}
const summit=r.ridgePoint(222),base=r.ridgePoint(0);
assert(t.terrainHeight(summit.x,summit.z)-t.terrainHeight(base.x,base.z)>40);
for(const [x,z] of [[0,0],[0,42],[29.47,33.32],[95,105],[1000,-1000],[-450,-90]]) assert.equal(r.ridgeElevation(x,z),0);
for(const edge of [0,r.RIDGE_LENGTH]){
  const a=r.ridgePoint(edge-.001),b=r.ridgePoint(edge+.001);
  assert(Math.abs(t.terrainHeight(a.x,a.z)-t.terrainHeight(b.x,b.z))<.01,"mountain ends must join the existing terrain smoothly");
}
for(const x of [-128,-256,-384])for(let z=-180;z<50;z+=2){
  assert(Math.abs(t.terrainHeight(x-1e-5,z)-t.terrainHeight(x+1e-5,z))<.001,"chunk seam in mountain");
}
// Follow the dirt crest using the current driving model; descend the other side.
const state=p.freshState();Object.assign(state,{...base,yaw:Math.atan2(-1,-.3+Math.PI/12)});
let peak=0,maxError=0;
for(let frame=0;frame<60*100;frame++){
  const u=r.RIDGE_START_X-state.x;
  const target=r.ridgePoint(Math.min(r.RIDGE_LENGTH+8,u+8));
  const desired=Math.atan2(target.x-state.x,target.z-state.z);
  const delta=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));
  p.stepDrive(state,{throttle:1,steer:Math.max(-1,Math.min(1,delta*2.5)),brake:false},1/60);
  peak=Math.max(peak,s.sampleSuspension(state.x,state.z,state.yaw,state.steer).base);
  maxError=Math.max(maxError,Math.abs(state.z-r.ridgeCenterZ(r.RIDGE_START_X-state.x)));
  if(u>r.RIDGE_LENGTH)break;
}
assert(r.RIDGE_START_X-state.x>r.RIDGE_LENGTH,"vehicle must climb and descend the full ridge");
assert(peak>48 && maxError<5);
console.log("PASS ridge: continuous mountain/mesh seams, dry 10-unit drivable corridor, clear rocks, ascent/summit/descent with current vehicle",JSON.stringify({maxSlope,peak,maxError,end:{x:state.x,z:state.z}}));
