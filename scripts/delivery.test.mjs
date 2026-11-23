import {build} from "esbuild";
import assert from "node:assert/strict";
const b=await build({stdin:{contents:`export * from './src/delivery';export * from './src/deliveryScene';export * from './src/destination';export * from './src/animalCamp';export * from './src/terrain';export * from './src/physics';`,resolveDir:process.cwd()},bundle:true,write:false,format:"esm",platform:"node"});
const m=await import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const random=m.seededRandom(110198),qualities=[0,0,0],positions=new Set();let previous;
for(let i=0;i<500;i++){
  const order=m.randomFoodOrder(random,i+1,previous),p=m.foodLocation(order);
  qualities[order.quality]++;positions.add(`${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  assert(m.safeFoodLocation(p));if(previous)assert(Math.abs(order.along-previous.along)>=28);
  previous=order;
}
assert(positions.size>490&&qualities.every(n=>n>35));
let d=m.createDelivery(storage,m.seededRandom(7));const original=JSON.stringify(d.state.order),p=m.foodLocation(d.state.order);
assert.equal(d.state.phase,"pickup");
for(let i=0;i<100;i++)d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true);
assert.equal(d.state.meals,0,"cannot deliver without cargo");
for(let i=0;i<50;i++)d.update(.1,p.x,p.z,1,true);
assert.equal(d.progress,0,"driving through cannot load");
for(let i=0;i<10;i++)d.update(.1,p.x,p.z,0,true);
assert(d.progress>.5);d.update(.1,p.x+20,p.z,0,true);assert.equal(d.progress,0);
for(let i=0;i<15;i++)d.update(.1,p.x,p.z,0,true);
assert.equal(d.state.phase,"pickup");
assert.equal(d.update(.1,p.x,p.z,0,true),"loaded");
assert.equal(d.state.phase,"carrying");assert.equal(JSON.stringify(d.state.order),original);
d.interrupt();assert.equal(d.state.phase,"carrying","R must retain cargo");
d=m.createDelivery(storage,()=>{throw Error("must not reroll an existing order");});
assert.equal(d.state.phase,"carrying");assert.equal(JSON.stringify(d.state.order),original);
for(let i=0;i<10;i++)d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true);
d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,false);assert.equal(d.progress,0);
for(let i=0;i<17;i++)d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true);
assert.equal(d.state.phase,"carrying");
assert.equal(d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true),"fed");
const hearts=m.FOOD_QUALITIES[d.state.order.quality].hearts;
for(let i=0;i<200;i++)assert.equal(d.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true),undefined);
assert.equal(d.state.meals,1);assert.equal(d.state.hearts,hearts);
d=m.createDelivery(storage,m.seededRandom(9));assert.equal(d.state.phase,"delivered");
const old=d.state.order.along;assert(d.nextOrder());assert(!d.nextOrder());
assert.equal(d.state.order.id,2);assert(Math.abs(old-d.state.order.along)>=28);assert.equal(d.state.hearts,hearts);
const back=m.deliveryGuidance(m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,d.state);
assert(back.next.x>m.ANIMAL_CAMP.x&&back.remaining>80,"next pickup guides back down the ridge");
memory.set(m.DELIVERY_KEY,'{"version":1,"phase":"carrying","order":null}');
assert.equal(m.createDelivery(storage).state.phase,"pickup");
const blocked=m.createDelivery({getItem(){throw Error("blocked");},setItem(){throw Error("blocked");}},m.seededRandom(4));
const bp=m.foodLocation(blocked.state.order);for(let i=0;i<16;i++)blocked.update(.1,bp.x,bp.z,0,true);
assert.equal(blocked.state.phase,"carrying");assert(!blocked.saved);
for(const [roll,quality] of [[.2,0],[.7,1],[.95,2]]){
  const tier=m.createDelivery(undefined,()=>roll),tp=m.foodLocation(tier.state.order);
  assert.equal(tier.state.order.quality,quality);
  for(let i=0;i<16;i++)tier.update(.1,tp.x,tp.z,0,true);
  for(let i=0;i<18;i++)tier.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true);
  assert.equal(tier.state.hearts,m.FOOD_QUALITIES[quality].hearts);
}

// Full real-physics runs, stopping to load and unload (not teleporting between states).
const runs=[];
for(const dt of [1/30,1/60])for(const seed of [2,42,96]){
  const delivery=m.createDelivery(undefined,m.seededRandom(seed)),car=m.freshState();let loaded=false,maxError=0;
  for(let f=0;f<120/dt;f++){
    const g=m.deliveryGuidance(car.x,car.z,delivery.state,6),desired=Math.atan2(g.next.x-car.x,g.next.z-car.z),error=Math.atan2(Math.sin(desired-car.yaw),Math.cos(desired-car.yaw));
    const stopping=g.distance<(delivery.state.phase==="pickup"?4:5.5);
    m.stepDrive(car,{throttle:!stopping&&car.speed<7?1:0,steer:error>.035?1:error<-.035?-1:0,brake:stopping},dt);
    const event=delivery.update(dt,car.x,car.z,car.speed,true);loaded ||= event==="loaded";maxError=Math.max(maxError,g.offRoute);
    if(event==="fed"){runs.push({dt,seed,seconds:f*dt,quality:delivery.state.order.quality,maxError});break;}
  }
  assert(loaded&&delivery.state.phase==="delivered","entire pickup/drive/feed route must work");
  assert(maxError<3);assert.equal(delivery.state.meals,1);
  // Backwards travel is also navigable when returning from camp for the next box.
  delivery.nextOrder();let gotNext=false;
  for(let f=0;f<120/dt;f++){
    const g=m.deliveryGuidance(car.x,car.z,delivery.state,6),desired=Math.atan2(g.next.x-car.x,g.next.z-car.z)+Math.PI,error=Math.atan2(Math.sin(desired-car.yaw),Math.cos(desired-car.yaw));
    const stopping=g.distance<3.5;
    m.stepDrive(car,{throttle:!stopping&&car.speed>-4?-1:0,steer:error>.035?-1:error<-.035?1:0,brake:stopping},dt);
    if(delivery.update(dt,car.x,car.z,car.speed,true)==="loaded"){gotNext=true;break;}
  }
  assert(gotNext,"must be possible to return downhill for the next random order");
}

const scene=m.createDeliveryScene(),q=m.createDelivery(undefined,m.seededRandom(5)),fp=m.foodLocation(q.state.order);
scene.update(0,.1,q.state,{x:0,z:0},fp,true,true);assert(scene.pickup.visible&&!scene.cargo.visible);
for(let i=0;i<16;i++)q.update(.1,fp.x,fp.z,0,true);
scene.update(1,.1,q.state,{x:0,z:0},fp,true,true);assert(!scene.pickup.visible&&scene.cargo.visible);
assert(scene.cargo.children.length>=4);assert.equal(scene.cargo.position.y,2.78);
scene.update(2,.1,q.state,{x:2048,z:-2048},fp,true,false);assert(!scene.cargo.visible);
assert(Math.abs(scene.pickup.position.x+2048-fp.x)<1e-9);
const camp=m.createAnimalCamp();camp.update(0,.1,m.ANIMAL_CAMP,{x:0,z:0},true,true,0,0);
for(let i=0;i<18;i++)q.update(.1,m.ANIMAL_CAMP.x,m.ANIMAL_CAMP.z,0,true);
scene.update(3,.1,q.state,{x:0,z:0},m.ANIMAL_CAMP,true,true);assert(!scene.cargo.visible);
camp.update(1,.1,m.ANIMAL_CAMP,{x:0,z:0},true,true,q.state.meals,q.state.lastQuality);
assert(camp.root.getObjectByName("animal-food-bowls").visible);
assert(camp.root.getObjectByName("feeding-heart-0").visible);
for(let i=0;i<60;i++)camp.update(i/10,.1,m.ANIMAL_CAMP,{x:0,z:0},true,true,1,0);
assert(!camp.root.getObjectByName("feeding-heart-0").visible);
scene.dispose();camp.dispose();
console.log("PASS delivery: 500 safe random locations, quality variety, stopped loading/interruption, no empty/duplicate feeding, saved cargo, next order/downhill guidance, storage fallback, mounted cargo/bowls/hearts and full physical trips",JSON.stringify({qualities,runs}));
