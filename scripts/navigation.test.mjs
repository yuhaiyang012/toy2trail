import { build } from "esbuild";
import assert from "node:assert/strict";
const bundle = await build({ entryPoints: ["src/navigation.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const n = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
for (const center of [{x:0,z:0}, {x:-2048,z:2048}, {x:1e6,z:-1e6}]) {
  assert.deepEqual(n.projectMap(center.x,center.z,center.x,center.z), {x:96,y:96});
  assert.deepEqual(n.projectMap(center.x+120,center.z-120,center.x,center.z), {x:192,y:0});
  assert.deepEqual(n.projectMap(center.x-120,center.z+120,center.x,center.z), {x:0,y:192});
}
// A north-pointing arrow rotated clockwise in canvas coordinates follows world +Z / +X / -Z.
assert.equal(n.mapHeading(0), Math.PI);
assert.equal(n.mapHeading(Math.PI/2), Math.PI/2);
assert.equal(n.mapHeading(Math.PI), 0);
for (let mode=0;mode<3;mode++) {
  for (const height of [2,4,14,18]) {
    const p=n.cameraOffset(mode,height,1);
    assert.equal(p.y,height);
    assert(Math.hypot(p.x,p.y,p.z)>=9.5-1e-8, "low top view must stay outside car");
    const mobile=n.cameraOffset(mode,height,2);
    assert.equal(mobile.y,height*2);
  }
}
assert.deepEqual(n.CAMERA_HEIGHTS,[4,4.8,14]);
assert.equal(n.clampHeight(-3),2);
assert.equal(n.clampHeight(90),18);
assert.equal(n.clampHeight(NaN),4);
assert.equal(n.safeCameraY(2,7),8.2);
assert.equal(n.safeCameraY(18,7),18);
assert(n.mapExpanded(false,false,null));
assert(!n.mapExpanded(true,false,null));
assert(n.mapExpanded(true,true,null));
assert(!n.mapExpanded(true,true,false));
assert(n.mapExpanded(true,false,true));
for (const key of ["ArrowLeft","ArrowUp","Space","Home","End"]) assert(n.controlNavigationKey(key));
for (const key of ["KeyW","KeyC","KeyR"]) assert(!n.controlNavigationKey(key));
console.log("PASS: north-up projection, heading, far coordinates, camera height/radial clearance, terrain clamp, folding and key ownership");
