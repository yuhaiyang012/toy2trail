import { build } from "esbuild";
import assert from "node:assert/strict";
// Geometry-only test: real Three.js objects, a minimal canvas for procedural texture construction.
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() {},
      fillRect() {},
      strokeRect() {},
      fillText() {},
    }),
  }),
};
const result = await build({
  entryPoints: ["src/world.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { createWorld } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const world = createWorld();
assert.equal(world.stats.chunks, 49);
assert(!world.root.getObjectByName("driving-boundary"));
// Detail coordinates, wetness and baked contact shade must agree at shared chunk edges.
const west=world.root.getObjectByName("terrain-0-0").getObjectByName("ground");
const east=world.root.getObjectByName("terrain-1-0").getObjectByName("ground");
assert.equal(west.material,east.material,"streamed chunks share material/texture allocations");
for(let row=0;row<65;row++){
  const a=row*65+64,b=row*65;
  for(const name of ["normal","color","surface"]){
    const wa=west.geometry.getAttribute(name),ea=east.geometry.getAttribute(name);
    for(let k=0;k<wa.itemSize;k++)assert(Math.abs(wa.array[a*wa.itemSize+k]-ea.array[b*ea.itemSize+k])<1e-6,`${name} seam`);
  }
  const wuv=west.geometry.getAttribute("uv"),euv=east.geometry.getAttribute("uv");
  assert.equal((wuv.getX(a)-euv.getX(b))%1,0);assert.equal(wuv.getY(a),euv.getY(b));
}
let disposed = 0;
world.root.traverse((n) => {
  if (n.isMesh && n.userData.ownedGeometry)
    n.geometry.addEventListener("dispose", () => disposed++);
});
for (const [x, z] of [
  [129, 0],
  [3000, 4000],
  [-2049, 1408],
  [1000000, -1000000],
  [0, 0],
]) {
  world.update(0, x, z, true);
  assert.equal(world.stats.chunks, 49);
  assert(world.hasGround(x, z));
  assert(
    Math.abs(x - world.origin.x) < 128 && Math.abs(z - world.origin.z) < 128,
  );
  const tiles = world.root.children.filter((n) =>
    n.name.startsWith("terrain-"),
  );
  assert.equal(tiles.length, 49);
  for (const tile of tiles) {
    assert(
      Math.abs(tile.position.x) <= 512 && Math.abs(tile.position.z) <= 512,
    );
    const ground = tile.getObjectByName("ground");
    assert(ground.geometry.getAttribute("position").count === 65 * 65);
    for (const value of ground.geometry.getAttribute("position").array)
      assert(Number.isFinite(value));
  }
}
assert(disposed >= 49, "discarded ground geometry must be disposed");
assert(world.stats.disposedChunks > 49);
assert.deepEqual(world.origin, { x: 0, z: 0 });
// Ordinary movement loads only two new far chunks per frame, then fills the bounded window.
world.update(1, 129, 0);
assert(world.stats.pending > 0 && world.stats.chunks < 49);
for (let i = 0; i < 10; i++) world.update(1 + i / 60, 129, 0);
assert.equal(world.stats.pending, 0);
assert.equal(world.stats.chunks, 49);
console.log(
  "PASS: real terrain geometry, no fence, 49-chunk bound, geometry disposal, queued streaming, million-unit rebase, reset",
);
