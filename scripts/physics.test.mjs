import { build } from "esbuild";
import assert from "node:assert/strict";
const result = await build({
  entryPoints: ["src/physics.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { freshState, stepDrive, terrainHeight } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const run = (s, input, seconds) => {
  for (let i = 0; i < seconds * 120; i++) stepDrive(s, input, 1 / 120);
};
const a = freshState();
run(a, { throttle: 1, steer: 0, brake: false }, 3);
assert(a.z > 10 && a.speed > 8 && a.x === 0);
const speed = a.speed;
run(a, { throttle: 0, steer: 0, brake: true }, 2);
assert(a.speed === 0 && speed > 0);
const l = freshState();
run(l, { throttle: 1, steer: 1, brake: false }, 2);
assert(l.x > 0 && l.yaw > 0 && l.steer > 0);
const back = freshState();
run(back, { throttle: -1, steer: 1, brake: false }, 2);
assert(back.z < 0 && back.yaw < 0 && back.speed >= -5);
const idle = freshState();
run(idle, { throttle: 0, steer: 0, brake: false }, 2);
assert.deepEqual(idle, freshState());
const edge = freshState();
edge.z = 287;
run(edge, { throttle: 1, steer: 0, brake: false }, 3);
assert(edge.z > 300 && edge.speed > 9);
assert.equal(terrainHeight(0, 0), 0);
assert(terrainHeight(17, 25) > 1);
for (let z = -288; z < 288; z++)
  assert(Number.isFinite(terrainHeight(z / 2, z)));
console.log(
  "PASS: acceleration, brake-to-stop, forward/reverse steering, idle, unrestricted travel and terrain",
);
