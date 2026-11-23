import { build } from "esbuild";
import assert from "node:assert/strict";
const load = async (file) => {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
};
const terrain = await load("src/terrain.ts"),
  physics = await load("src/physics.ts");
const {
  WATER_LEVEL,
  ROCKS,
  generateRocks,
  terrainHeight,
  contactHeight,
  sampleSurface,
  riverCenter,
  riverHalfWidth,
  waterDepth,
} = terrain;
const {
  VEHICLE_RADIUS,
  VEHICLE_OFFSETS,
  rockCollisionRadius,
  moveWithCollisions,
  canOccupy,
} = await load("src/collision.ts");
const { freshState, stepDrive } = physics;
assert.equal(terrainHeight(0, 0), 0);
assert.equal(sampleSurface(0, 0).kind, "sand");
assert.deepEqual(generateRocks(), ROCKS);
assert(ROCKS.length > 150);
for (let z = 0; z <= 60; z += 0.5)
  assert(
    !ROCKS.some(
      (r) => r.blocking && Math.hypot(r.x, r.z - z) < r.radius + VEHICLE_RADIUS,
    ),
    `departure-to-ford route obstructed at ${z}`,
  );
assert(ROCKS.every((r) => Math.hypot(r.x, r.z) > r.radius + VEHICLE_RADIUS));
for (let x = -288; x <= 288; x += 2) {
  const z = riverCenter(x),
    w = riverHalfWidth(x);
  assert(waterDepth(x, z) > 0.15 && waterDepth(x, z) < 0.45);
  assert(terrainHeight(x, z) < WATER_LEVEL);
  assert(Math.abs(terrainHeight(x, z + w) - WATER_LEVEL) < 1e-8);
  assert(
    Math.abs(
      terrainHeight(x, z + w + 0.001) - terrainHeight(x, z + w - 0.001),
    ) < 0.01,
  );
}
for (let x = -288; x <= 288; x += 8)
  for (let z = -288; z <= 288; z += 8)
    assert(Number.isFinite(contactHeight(x, z)));
const small = ROCKS.find((r) => !r.blocking);
assert(
  contactHeight(small.x, small.z) - terrainHeight(small.x, small.z) > 0.12,
);
const run = (
  s,
  seconds,
  input = { throttle: 1, steer: 0, brake: false },
  dt = 1 / 120,
) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepDrive(s, input, dt);
  return s;
};
for (const direction of [-1, 1]) {
  const sand = freshState(),
    mud = freshState(),
    water = freshState();
  mud.x = -22;
  mud.z = 24;
  water.x = 0;
  water.z = riverCenter(0);
  water.yaw = Math.PI / 2;
  run(sand, 1, { throttle: direction, steer: 0, brake: false });
  run(mud, 1, { throttle: direction, steer: 0, brake: false });
  run(water, 1, { throttle: direction, steer: 0, brake: false });
  assert(mud.distance < sand.distance * 0.96, "mud must slow travel");
  assert(water.distance < sand.distance * 0.9, "water must slow travel");
  for (const s of [mud, water]) {
    s.x = 0;
    s.z = 0;
    s.yaw = 0;
    s.speed = direction * 2;
    run(s, 1, { throttle: direction, steer: 0, brake: false });
    assert(Math.abs(s.speed) > 4.9);
    run(s, 1, { throttle: 0, steer: 0, brake: true });
    assert.equal(s.speed, 0);
  }
}
const rock = ROCKS.find((r) => r.blocking),
  R = rockCollisionRadius(rock) + VEHICLE_RADIUS + Math.max(...VEHICLE_OFFSETS);
for (const reverse of [false, true]) {
  const s = freshState();
  s.x = rock.x;
  s.z = rock.z - R - 3;
  s.yaw = reverse ? Math.PI : 0;
  s.speed = reverse ? -5 : 12;
  run(s, 3, { throttle: reverse ? -1 : 1, steer: 0, brake: false }, 1 / 30);
  assert(Math.hypot(s.x - rock.x, s.z - rock.z) >= R - 1e-4);
  assert(s.z < rock.z);
  assert(Math.abs(s.speed) < 0.1);
}
const sweep = moveWithCollisions(rock.x, rock.z - R - 10, 0, 30);
assert(
  sweep.collided && sweep.z < rock.z - R + 0.01,
  "continuous sweep prevents tunneling",
);
const diagonal = moveWithCollisions(rock.x - R * 0.7, rock.z - R - 3, 3, 7);
assert(diagonal.collided);
assert(canOccupy(diagonal.x, diagonal.z, 0));
assert(diagonal.x !== rock.x - R * 0.7, "oblique contact retains sliding");
const overlap = moveWithCollisions(rock.x, rock.z, 0, 0);
assert(Number.isFinite(overlap.x) && canOccupy(overlap.x, overlap.z, 0));
const edge = freshState();
edge.z = 287;
edge.speed = 12;
run(edge, 2);
assert(edge.z > 300);
assert(edge.distance > 10, "old perimeter must no longer block travel");
const idle = freshState();
stepDrive(idle, { throttle: 1, steer: 0, brake: false }, NaN);
assert.deepEqual(idle, freshState());
console.log(
  `PASS: safe spawn, ${ROCKS.length} original rocks, river continuity, rock contact, water/mud drag both directions, recovery, swept collision, sliding, removed boundary`,
);
