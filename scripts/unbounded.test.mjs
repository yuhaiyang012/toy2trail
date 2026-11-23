import { build } from "esbuild";
import assert from "node:assert/strict";
const load = async (file) => {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(r.outputFiles[0].text).toString("base64")
  );
};
const terrain = await load("src/terrain.ts"),
  physics = await load("src/physics.ts");
const stream = await load("src/streaming.ts"),
  collision = await load("src/collision.ts");
const {
  CHUNK_SIZE,
  MAX_ACTIVE_CHUNKS,
  MAX_ROCK_CACHE,
  activeChunks,
  renderOrigin,
} = stream;
const { chunkRocks, rockCacheSize, terrainHeight, nearbyRocks } = terrain;
const {
  moveWithCollisions,
  canOccupy,
  VEHICLE_RADIUS,
  VEHICLE_OFFSETS,
  rockCollisionRadius,
} = collision;
assert(VEHICLE_RADIUS <= 1.5, "side clearance must shrink substantially");
const rock = {
  id: "fixture",
  x: 0,
  z: 0,
  radius: 2,
  height: 2.4,
  yaw: 0,
  base: 0,
  blocking: true,
};
const obstacles = [rock],
  contact = rockCollisionRadius(rock) + VEHICLE_RADIUS;
// This line was blocked by the old 3.45-radius car. It is now a clean pass.
const passX = contact + 0.15;
assert(passX < rock.radius + 3.45);
const pass = moveWithCollisions(passX, -8, 0, 16, 0, obstacles);
assert(!pass.collided && Math.abs(pass.z - 8) < 1e-8);
assert(canOccupy(passX, 0, 0, obstacles));
assert(
  !canOccupy(passX, 0, Math.PI / 2, obstacles),
  "narrow collider must rotate with the car",
);
for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw);
  const hit = moveWithCollisions(
    -fx * 15,
    -fz * 15,
    fx * 30,
    fz * 30,
    yaw,
    obstacles,
  );
  assert(hit.collided);
  assert(canOccupy(hit.x, hit.z, yaw, obstacles));
  assert(hit.x * fx + hit.z * fz < 0, "front / reverse sweep must not tunnel");
}
const diagonal = moveWithCollisions(-6, -7, 7, 8, 0, obstacles);
assert(diagonal.collided && canOccupy(diagonal.x, diagonal.z, 0, obstacles));
const overlap = moveWithCollisions(0, 0, 0, 0, 0, obstacles);
assert(canOccupy(overlap.x, overlap.z, 0, obstacles));
const reverse = moveWithCollisions(
  0,
  -contact - Math.max(...VEHICLE_OFFSETS) - 0.01,
  0,
  -2,
  0,
  obstacles,
);
assert(!reverse.collided, "reverse must escape contact");
for (const [x, z] of [
  [0, 0],
  [289, 0],
  [-2000, 4096],
  [1000000, -1000000],
]) {
  const chunks = activeChunks(x, z);
  assert.equal(chunks.length, MAX_ACTIVE_CHUNKS);
  assert.equal(new Set(chunks.map((c) => c.key)).size, MAX_ACTIVE_CHUNKS);
  const tile = chunks.find(
    (c) =>
      c.x === Math.floor(x / CHUNK_SIZE) && c.z === Math.floor(z / CHUNK_SIZE),
  );
  assert(tile);
  assert(Number.isFinite(terrainHeight(x, z)));
  const origin = renderOrigin(x, z, { x: 0, z: 0 });
  assert(Math.abs(x - origin.x) < 2048 && Math.abs(z - origin.z) < 2048);
}
const remembered = JSON.stringify(chunkRocks(30, -40));
assert(chunkRocks(30, -40).length > 0);
for (let i = 0; i < MAX_ROCK_CACHE * 3; i++) chunkRocks(i + 100, -i - 50);
assert(rockCacheSize() <= MAX_ROCK_CACHE);
assert.equal(
  JSON.stringify(chunkRocks(30, -40)),
  remembered,
  "eviction must not randomize revisited terrain",
);
for (const cx of [-100, -1, 0, 1, 100]) {
  const x = cx * CHUNK_SIZE,
    z = -333;
  assert(
    Math.abs(terrainHeight(x - 1e-5, z) - terrainHeight(x + 1e-5, z)) < 0.001,
  );
  const rocks = chunkRocks(cx, -3);
  assert(
    rocks.every(
      (r) =>
        Math.floor(r.x / CHUNK_SIZE) === cx &&
        Math.floor(r.z / CHUNK_SIZE) === -3,
    ),
  );
}
assert.equal(nearbyRocks(0, 0, 5).length, 0);
for (const [x, z] of [
  [0, 287],
  [0, -287],
  [0, 1200],
  [0, -1600],
]) {
  const s = physics.freshState();
  Object.assign(s, { x, z, yaw: z < 0 ? Math.PI : 0, speed: 12 });
  for (let i = 0; i < 120; i++)
    physics.stepDrive(s, { throttle: 1, steer: 0, brake: false }, 1 / 60);
  assert(
    Math.abs(s.z) > Math.abs(z) + 10,
    "old boundary must not stop the vehicle",
  );
}
console.log(
  "PASS: unbounded travel, bounded chunk/cache counts, deterministic revisit, seams, render rebasing, tight oriented collision, sweep/slide/reverse",
);
