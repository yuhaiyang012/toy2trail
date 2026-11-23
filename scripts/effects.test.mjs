import {build} from "esbuild";
import assert from "node:assert/strict";
import {Raycaster,Vector3} from "three";
const built = await build({stdin:{contents:`export * from './src/drivingEffects'; export * from './src/terrain'; export * from './src/physics'; export * from './src/suspension'; export * from './src/world';`,resolveDir:process.cwd()},bundle:true,write:false,format:"esm",platform:"node"});
const m = await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
const wheels=[{x:-1.5,z:-1.9},{x:1.5,z:-1.9},{x:-1.5,z:1.9},{x:1.5,z:1.9}];
const effects=m.createDrivingEffects(wheels);
const heights=s=>m.sampleSuspension(s.x,s.z,s.yaw,s.steer).heights;
const tick=(s,enabled=true,origin={x:0,z:0})=>effects.update(1/60,Object.freeze({...s}),origin,Object.freeze(heights(s)),enabled);
const stationary=m.freshState();
for(let i=0;i<120;i++)tick(stationary);
assert.equal(effects.stats.dustEmitted+effects.stats.splashesEmitted+effects.stats.tracksEmitted,0);
const dry=m.wheelEffectSurface(0,0,0);
assert(dry.dust>0&&dry.track>0&&!dry.water);
const ford=m.wheelEffectSurface(0,m.riverCenter(0),m.terrainHeight(0,m.riverCenter(0)));
assert(ford.water&&!ford.dust&&!ford.track);
const mud=m.wheelEffectSurface(-22,24,m.terrainHeight(-22,24));
assert(mud.track>dry.track&&!mud.dust&&!mud.water);
const stone=m.ROCKS[39];
const rock=m.wheelEffectSurface(stone.x,stone.z,stone.base+stone.height);
assert(!rock.dust&&!rock.water&&!rock.track,"raised tires on rocks must not dirty the ground below");

// Real forward driving crosses sand then the ford using unchanged physics.
const drive=m.freshState();let sawDust=false,sawWater=false;
for(let i=0;i<700;i++){
  m.stepDrive(drive,{throttle:1,steer:0,brake:false},1/60);tick(drive);
  sawDust ||= effects.stats.dust>0;sawWater ||= effects.stats.splashes>0;
}
assert(sawDust&&sawWater&&effects.stats.tracksEmitted>0);
assert(effects.stats.dust+effects.stats.splashes<=m.EFFECT_LIMITS.particles);
assert(effects.stats.tracks<=m.EFFECT_LIMITS.tracks);

// Stop generation on actual standstill even if a collision leaves nonzero speed.
const emitted={...effects.stats};
for(let i=0;i<150;i++)tick(drive);
assert.equal(effects.stats.dust,0);assert.equal(effects.stats.splashes,0);
for(const key of ["dustEmitted","splashesEmitted","tracksEmitted"])assert.equal(effects.stats[key],emitted[key]);

effects.reset();const reverse={...m.freshState(),speed:-4};
for(let i=0;i<30;i++){reverse.z-=4/60;tick(reverse);}
assert(effects.stats.dust>0&&effects.stats.tracks>0,"reverse travel leaves effects too");
const particle=effects.root.getObjectByName("dust-and-water");
const ppos=particle.geometry.getAttribute("position"),alpha=particle.geometry.getAttribute("opacity");
let trailing=0;
for(let i=0;i<alpha.count;i++)if(alpha.getX(i)>0){
  // Reverse motion ejects dust forward (+z), behind the wheel's direction of travel.
  assert(ppos.getZ(i)>reverse.z-1.9);trailing++;
}
assert(trailing>0);

// Origin changes move uploaded data, while world-space track locations remain fixed.
const mesh=effects.root.getObjectByName("fading-tire-tracks"),pos=mesh.geometry.getAttribute("position");
const before=Array.from(pos.array);
tick(reverse,false,{x:2048,z:-2048});
for(let i=0;i<effects.stats.tracks*4;i++){
  assert(Math.abs(pos.getX(i)+2048-before[i*3])<.0002);
  assert(Math.abs(pos.getZ(i)-2048-before[i*3+2])<.0002);
}
const count=effects.stats.tracksEmitted;
tick({...reverse,x:100,z:100},true,{x:0,z:0});
assert.equal(effects.stats.tracksEmitted,count,"no track across teleports");

// The hill is sloping; every decal corner follows the visible triangulated terrain.
effects.reset();const slope={...m.freshState(),x:-170,z:-40,yaw:-Math.PI/2,speed:5};
for(let i=0;i<45;i++){slope.x-=5/60;tick(slope);}
assert(effects.stats.tracks>0);
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},strokeRect(){},fillText(){}})})};
const world=m.createWorld();world.update(0,slope.x,slope.z,true);world.root.updateMatrixWorld(true);
const ray=new Raycaster();
for(let i=0;i<Math.min(24,effects.stats.tracks*4);i++){
  const x=pos.getX(i),z=pos.getZ(i);
  const tile=world.root.getObjectByName(`terrain-${Math.floor(x/128)}-${Math.floor(z/128)}`);
  ray.set(new Vector3(x-world.origin.x,1000,z-world.origin.z),new Vector3(0,-1,0));
  const hit=ray.intersectObject(tile.getObjectByName("ground"))[0];
  assert(hit,"decal must have visible ground below it");
  assert(Math.abs(pos.getY(i)-hit.point.y-.028)<.00003,"decal must hug the actual rendered hill triangles");
}

// Fill and wrap the pools in a small dry circle. Counts and GPU buffers stay bounded.
effects.reset();
for(let i=0;i<6000;i++){
  const a=i*.02,s={...m.freshState(),x:5*Math.sin(a),z:5*Math.cos(a),yaw:Math.PI/2-a,speed:6};
  tick(s);
}
assert(effects.stats.tracksEmitted>m.EFFECT_LIMITS.tracks*2);
assert(effects.stats.tracks<=m.EFFECT_LIMITS.tracks);
assert.equal(pos.count,m.EFFECT_LIMITS.tracks*4);
assert(Math.max(...mesh.geometry.getAttribute("uv").array)<260,"long drives must not lose tread UV precision");
assert.equal(ppos.count,m.EFFECT_LIMITS.particles);
assert.equal(effects.root.children.length,2,"two batches regardless of driving duration");
for(const child of effects.root.children)for(const a of Object.values(child.geometry.attributes))assert(Array.from(a.array).every(Number.isFinite));
for(let i=0;i<700;i++)effects.update(.1,stationary,{x:0,z:0},[0,0,0,0],false);
assert.equal(effects.stats.tracks+effects.stats.dust+effects.stats.splashes,0,"all effects expire");
effects.reset();assert(Object.values(effects.stats).every(v=>v===0));
let disposed=0;for(const child of effects.root.children){child.geometry.addEventListener("dispose",()=>disposed++);child.material.addEventListener("dispose",()=>disposed++);}
effects.dispose();assert.equal(disposed,4);
console.log("PASS effects: wheel surface contacts, actual dry/water driving, idle/blocked suppression, reverse ejection, origin continuity, hill decals, fixed pools, fade, reset and disposal");
