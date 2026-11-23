import {build} from "esbuild";
import assert from "node:assert/strict";
const built=await build({stdin:{contents:`export * from './src/destination';export * from './src/animalCamp';export * from './src/physics';export * from './src/collision';export * from './src/terrain';`,resolveDir:process.cwd()},bundle:true,write:false,format:"esm",platform:"node"});
const m=await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
const q=m.createDestination(storage),goal=m.ANIMAL_CAMP;
assert(!q.completed);assert.equal(q.update(0,0,true),false);
assert.equal(q.update(NaN,goal.z,true),false);
assert.equal(q.update(goal.x,goal.z,false),false,"inspection cannot award prizes");
assert.equal(q.update(goal.x+goal.radius+.01,goal.z,true),false);
assert(q.update(goal.x+goal.radius-.01,goal.z,true));
assert(q.completed&&q.saved);assert.equal(q.unlocks,1);
for(let i=0;i<60;i++)assert(!q.update(goal.x,goal.z,true));
assert(!q.update(0,0,true));assert(q.completed,"returning to spawn preserves the reward");
const restored=m.createDestination(storage);assert(restored.completed);assert.equal(restored.unlocks,0);
restored.restart();assert(!restored.completed&&!m.createDestination(storage).completed);
const unavailable=m.createDestination({getItem(){throw Error("blocked");},setItem(){throw Error("blocked");}});
assert(unavailable.update(goal.x,goal.z,true));assert(unavailable.completed&&!unavailable.saved);
unavailable.restart();assert(!unavailable.completed);

const marker=m.campMapMarker(0,0,192,240);
assert(marker.outside&&marker.x===12&&marker.y<96);
assert.deepEqual(m.campMapMarker(goal.x,goal.z,192,240),{x:96,y:96,outside:false,angle:0});
for(const [x,z] of [[1e6,-1e6],[-2048,2048],[goal.x+5,goal.z-6]]){
  const p=m.campMapMarker(x,z,192,240);
  assert(p.x>=12&&p.x<=180&&p.y>=12&&p.y<=180);
}
assert.equal(m.campGuidance(0,0).progress,0);
assert(m.campGuidance(200,200).offRoute>200);
assert(m.campGuidance(goal.x,goal.z).remaining<.001);

// Every route segment is dry and collision-free with the existing vehicle footprint.
for(let i=1;i<m.CAMP_ROUTE.length;i++){
  const a=m.CAMP_ROUTE[i-1],b=m.CAMP_ROUTE[i],length=Math.hypot(b.x-a.x,b.z-a.z),yaw=Math.atan2(b.x-a.x,b.z-a.z);
  for(let u=0;u<=length;u+=.25){const x=a.x+(b.x-a.x)*u/length,z=a.z+(b.z-a.z)*u/length;
    assert(m.canOccupy(x,z,yaw),`blocked route ${x}, ${z}`);assert.equal(m.waterDepth(x,z),0);
  }
}
const arrivals=[];
// Use only the existing binary keyboard inputs, also used by the browser route test.
for(const dt of [1/30,1/60,1/120]){
  const state=m.freshState(),quest=m.createDestination();let frame=0,maxError=0;
  for(;frame<100/dt;frame++){
    const g=m.campGuidance(state.x,state.z,6),desired=Math.atan2(g.target.x-state.x,g.target.z-state.z);
    const error=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));
    m.stepDrive(state,{throttle:state.speed<7?1:0,steer:error>.035?1:error<-.035?-1:0,brake:false},dt);
    maxError=Math.max(maxError,g.offRoute);
    if(quest.update(state.x,state.z,true))break;
  }
  assert(quest.completed,"must drive from spawn all the way to the campsite");
  assert(maxError<3);assert(m.terrainHeight(state.x,state.z)>50);
  arrivals.push({dt,seconds:frame*dt,maxError});
}

// Rewards are actual scene models and track the same logical origin as terrain.
const camp=m.createAnimalCamp();
camp.update(0,1/60,goal,{x:0,z:0},false,true);
assert(camp.root.visible&&camp.root.getObjectByName("camp-beacon").visible);
for(const a of m.ANIMAL_REWARDS)assert(!camp.root.getObjectByName("reward-"+a.id).visible);
for(let i=0;i<100;i++)camp.update(i/60,1/60,goal,{x:0,z:0},true,true);
assert(!camp.root.getObjectByName("camp-beacon").visible);
const before=camp.root.position.clone();
for(const a of m.ANIMAL_REWARDS){const actor=camp.root.getObjectByName("reward-"+a.id);assert(actor.visible);assert.equal(actor.scale.x,1);assert(actor.children.length>10);}
camp.update(2,1/60,goal,{x:-2048,z:2048},true,true);
assert(Math.abs(camp.root.position.x-2048-before.x)<1e-9);assert(Math.abs(camp.root.position.z+2048-before.z)<1e-9);
camp.update(2,1/60,{x:1e6,z:1e6},{x:1e6,z:1e6},true,true);assert(!camp.root.visible);
camp.update(2,1/60,goal,{x:0,z:0},true,false);assert(!camp.root.visible);
let disposed=0;const geos=new Set(),mats=new Set();camp.root.traverse(n=>{if(n.geometry)geos.add(n.geometry);if(n.material)mats.add(n.material);});
for(const g of geos)g.addEventListener("dispose",()=>disposed++);for(const a of mats)a.addEventListener("dispose",()=>disposed++);
camp.dispose();assert.equal(disposed,geos.size+mats.size);
console.log("PASS destination: one-time arrival, saved rewards, replay, storage fallback, edge navigation, dry collision-free route, full keyboard climb at 30/60/120 Hz, three animated 3D animals and origin/disposal",JSON.stringify(arrivals));
