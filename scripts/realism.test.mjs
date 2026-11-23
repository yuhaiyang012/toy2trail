import {build} from 'esbuild';
import assert from 'node:assert/strict';
const b=await build({stdin:{contents:`export * from './src/bodyMotion';export * from './src/physics';export * from './src/ridge';export * from './src/surfaceMaterials';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

const a=m.ridgePoint(90),next=m.ridgePoint(91),yaw=Math.atan2(next.x-a.x,next.z-a.z);
const grade=m.roadGrade(a.x,a.z,yaw);
assert(grade>.2,'select an uphill segment');
const traces=[];
for(const dt of [1/30,1/60,1/120]){
  const uphill={...m.freshState(),...a,yaw},downhill={...m.freshState(),...a,yaw:yaw+Math.PI};
  for(let i=0;i<1.5/dt;i++){
    m.stepDrive(uphill,{throttle:1,steer:0,brake:false},dt);
    m.stepDrive(downhill,{throttle:1,steer:0,brake:false},dt);
  }
  assert(downhill.speed>uphill.speed+1,'gravity must affect ascent and descent');
  const coast={...m.freshState(),...a,yaw};
  for(let i=0;i<1/dt;i++)m.stepDrive(coast,{throttle:0,steer:0,brake:false},dt);
  assert(coast.speed<-.25,'unbraked car should roll back on this incline');
  for(let i=0;i<1/dt;i++)m.stepDrive(coast,{throttle:0,steer:0,brake:true},dt);
  const position={x:coast.x,z:coast.z};
  for(let i=0;i<3/dt;i++)m.stepDrive(coast,{throttle:0,steer:0,brake:true},dt);
  assert.equal(coast.speed,0);assert.equal(coast.x,position.x);assert.equal(coast.z,position.z);
  traces.push({dt,uphill:uphill.speed,downhill:downhill.speed});
}
assert(Math.abs(traces[0].uphill-traces[2].uphill)<.15,'stable uphill motion across frame rates');

const springTraces=[];
for(const dt of [1/30,1/60,1/120]){
  const body=m.createBodyMotion();body.update({height:0,pitch:0,roll:0,minHeight:-.18},dt,true);
  let max=0;
  for(let i=0;i<2/dt;i++){
    const pose=body.update({height:.15,pitch:.08,roll:-.06,minHeight:-.03},dt);
    max=Math.max(max,pose.height);
    assert(Number.isFinite(pose.height)&&pose.height>=-.03&&pose.height<=.39);
  }
  assert(max>.15&&max<.19,'small physical rebound, not an exponential height snap');
  assert(Math.abs(body.height.position-.15)<.0001&&Math.abs(body.height.velocity)<.001,'settles without perpetual bouncing');
  const reset=body.update({height:48,pitch:.2,roll:-.1,minHeight:48},dt,true);
  assert.equal(reset.height,48);assert.equal(body.height.velocity,0,'teleport clears momentum');
  body.update({height:49,pitch:.2,roll:-.1,minHeight:49},dt);
  assert(body.height.position>=49,'rock support is never penetrated by spring lag');
  springTraces.push({dt,max});
}
assert(Math.abs(springTraces[0].max-springTraces[2].max)<.003);

for(let v=-3;v<20;v+=.17){
  assert(Math.abs(m.surfaceNoise(v,0,8)-m.surfaceNoise(v,8,8))<1e-12);
  assert(Math.abs(m.surfaceNoise(0,v,8)-m.surfaceNoise(8,v,8))<1e-12);
}
const mats=m.createSurfaceMaterials();
assert(mats.ground.map.generateMipmaps&&mats.ground.map.anisotropy>1,'distant terrain detail should be filtered');
for(const geom of mats.rockGeometries){
  const p=geom.getAttribute('position');
  for(let i=0;i<p.count;i++)assert(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))<=1.00001,'new rock detail stays inside existing bounds');
}
for(const mat of [mats.ground,mats.rock]){mat.map.dispose();mat.bumpMap.dispose();mat.dispose();}
mats.rockGeometries.forEach(g=>g.dispose());mats.grass.dispose();mats.grassGeometry.dispose();
console.log('PASS realism: uphill/downhill forces, rollback, brake hold, 30/60/120 Hz suspension rebound/settle/reset, seamless texture noise and rock bounds',JSON.stringify({traces,springTraces}));
