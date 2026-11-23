import { build } from "esbuild";
import assert from "node:assert/strict";
const load = async (file) => {
  const b = await build({entryPoints:[file],bundle:true,write:false,format:"esm",platform:"node"});
  return import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const t = await load("src/terrain.ts"), c = await load("src/collision.ts");
const medium = t.ROCKS.find(r => r.id === 39);
assert(c.canOccupy(medium.x-1.5,medium.z-7,0),"climb review must start clear of surrounding boulders");
assert(c.canOccupy(medium.x, medium.z, 0), "a moderate rounded rock should be climbable instead of an invisible wall");
const p = await load("src/physics.ts"), s = await load("src/suspension.ts");
assert(t.isClimbableRock(medium));
assert(!t.isClimbableRock(t.ROCKS[0]), "tall boulders must remain solid");
assert(!t.isClimbableRock({...medium,height:1.4,radius:.6}), "steep narrow obstacles must remain solid");
assert.equal(s.wheelContactHeight(0,0,0,[]),0);
const small = t.ROCKS.find(r => !r.blocking);
const earlyZ=small.z-small.radius-.2;
assert(s.wheelContactHeight(small.x,earlyZ,0,[small])>t.terrainHeight(small.x,earlyZ)+.005,"tire front must start rising before its center reaches the stone");
const records=[];
for (const dt of [1/30,1/120]) for (const direction of [-1,1]) for (const yaw of [0,Math.PI/3]) {
  const state=p.freshState();
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  const center={x:medium.x-rx*1.5,z:medium.z-rz*1.5};
  Object.assign(state,{x:center.x-fx*7*direction,z:center.z-fz*7*direction,yaw});
  let lift=0,spread=0,rockFrames=0,minSpeed=Infinity;
  for(let i=0;i<8/dt;i++) {
    p.stepDrive(state,{throttle:direction,steer:0,brake:false},dt);
    const support=s.sampleSuspension(state.x,state.z,state.yaw,state.steer);
    lift=Math.max(lift,support.rockLift);
    spread=Math.max(spread,Math.max(...support.heights)-Math.min(...support.heights));
    if(support.rockLift>.05) {rockFrames++; minSpeed=Math.min(minSpeed,Math.abs(state.speed));}
    assert(Number.isFinite(support.base));
    if(((state.x-center.x)*fx+(state.z-center.z)*fz)*direction>7)break;
  }
  const travel=((state.x-center.x)*fx+(state.z-center.z)*fz)*direction;
  assert(travel>7,`failed ${direction>0?'forward':'reverse'} climb at yaw ${yaw}, dt ${dt}: ${travel}`);
  assert(lift>.7 && spread>.6 && rockFrames>0,"wheels must rise over the actual rock rather than pass through it");
  assert(minSpeed>.1,"low-speed traction must not stall on the rock");
  records.push({dt,direction,yaw,lift,spread,minSpeed});
}
// A stone between the tires must not cut through the belly of the chassis.
const straddle=s.sampleSuspension(medium.x,medium.z,0,0);
assert(straddle.base+.7>=t.contactHeight(medium.x,medium.z)-1e-8);
const stopped=p.freshState();
Object.assign(stopped,{x:medium.x-1.5,z:medium.z});
const before={...stopped};
for(let i=0;i<120;i++)p.stepDrive(stopped,{throttle:0,steer:0,brake:true},1/60);
assert.equal(stopped.x,before.x);assert.equal(stopped.z,before.z);assert.equal(stopped.speed,0);
for(const direction of [-1,1]) {
  const start=p.freshState();
  Object.assign(start,{x:medium.x-1.5,z:medium.z-1.9*direction});
  const z=start.z;
  for(let i=0;i<180;i++)p.stepDrive(start,{throttle:direction,steer:0,brake:false},1/60);
  assert((start.z-z)*direction>4,"must restart from rest on a rock, without a running start");
}
console.log("PASS: forward/reverse/oblique medium-rock climbing at 30/120 Hz, tire front contact, wheel articulation, belly clearance, crawl traction, brake hold, retained tall/steep obstacles",JSON.stringify(records));
