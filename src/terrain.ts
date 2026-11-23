/** Shared, deterministic terrain data. No DOM / Three.js dependency. */
import { CHUNK_SIZE, MAX_ROCK_CACHE, chunkSeed } from "./streaming";
import { ridgeElevation, ridgeTrail, intersectsRidgeTrail } from "./ridge";
const START_AREA_RADIUS = 288; // Only the original rock layout, never a driving limit.
export const WATER_LEVEL = -0.06;
export const RIVER_SPACING = 640;
export type SurfaceKind = "sand" | "rock" | "mud" | "water" | "grass";
export interface Rock {
  id: number | string;
  x: number;
  z: number;
  radius: number;
  height: number;
  yaw: number;
  blocking: boolean; // Original angular/smooth rock class; use isClimbableRock for driving.
  base: number;
}
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const hill = (
  x: number,
  z: number,
  cx: number,
  cz: number,
  h: number,
  w: number,
) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (w * w));
export function riverCenter(x: number, band = 0) {
  return (
    42 +
    band * RIVER_SPACING +
    16 * Math.sin(x / 48 + band * 1.713) +
    6 * Math.sin(x / 20 - band * 0.83)
  );
}
export function riverBand(x: number, z: number) {
  return Math.round((z - riverCenter(x)) / RIVER_SPACING);
}
export function riverHalfWidth(x: number) {
  return 5.8 + 1.1 * Math.sin(x / 39);
}
export function riverDepth(x: number) {
  return 0.34 + 0.055 * Math.sin(x / 32);
}
export function riverDistance(x: number, z: number) {
  return Math.abs(z - riverCenter(x, riverBand(x, z)));
}
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    u = smooth(x - ix),
    v = smooth(z - iz);
  const n = (a: number, b: number) => chunkSeed(a, b, 7189) / 4294967295;
  const a = n(ix, iz) * (1 - u) + n(ix + 1, iz) * u,
    b = n(ix, iz + 1) * (1 - u) + n(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}
export function baseHeight(x: number, z: number) {
  const fade = smooth((Math.hypot(x, z) - 9) / 10);
  const ripples =
    0.18 * Math.sin(x * 0.16) * Math.cos(z * 0.12) +
    0.09 * Math.sin(z * 0.35 + x * 0.12);
  return (
    fade *
    (ripples +
      smooth((Math.hypot(x, z) - 200) / 160) *
        (12 * valueNoise(x / 170, z / 170) + 3 * valueNoise(x / 63, z / 63)) +
      hill(x, z, 17, 25, 1.7, 10) +
      hill(x, z, -2, -28, 2.1, 13) +
      hill(x, z, -65, 6, 9, 30) +
      hill(x, z, 95, 105, 13, 44) +
      hill(x, z, -100, -126, 16, 50) +
      hill(x, z, 162, -85, 11, 40) +
      hill(x, z, -185, 145, 9, 46)) + ridgeElevation(x, z)
  );
}
/** Exactly the surface used to build the terrain mesh, excluding small stones. */
export function terrainHeight(x: number, z: number) {
  const d = riverDistance(x, z),
    w = riverHalfWidth(x),
    base = baseHeight(x, z);
  if (d <= w) return WATER_LEVEL - riverDepth(x) * (1 - (d / w) ** 4);
  if (d < w + 6)
    return WATER_LEVEL + (base - WATER_LEVEL) * smooth((d - w) / 6);
  return base;
}
export function waterDepth(x: number, z: number) {
  return riverDistance(x, z) < riverHalfWidth(x)
    ? Math.max(0, WATER_LEVEL - terrainHeight(x, z))
    : 0;
}
export function mudAmount(x: number, z: number) {
  const d = riverDistance(x, z),
    w = riverHalfWidth(x);
  const bank = (1 - smooth((d - w - 1) / 5)) * smooth((d - w + 0.4) / 1.2);
  const patch = Math.exp(-((x + 22) ** 2 / 70 + (z - 24) ** 2 / 100));
  return clamp(Math.max(bank * 0.9, patch));
}
export function grassAmount(x: number, z: number) {
  const edge = smooth((Math.hypot(x, z) - 13) / 24);
  const trail = 1 - 0.78 * Math.exp(-((x - 9 * Math.sin(z / 31)) ** 2) / 32);
  return (
    edge * (1 - ridgeTrail(x, z) * .96) *
    trail *
    clamp(
      0.32 +
        0.36 * Math.sin(x * 0.026 + 1.1) * Math.cos(z * 0.019) +
        0.32 * smooth((baseHeight(x, z) - 1) / 5),
    )
  );
}
export function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function generateRocks(seed = 98): Rock[] {
  const rand = seededRandom(seed),
    out: Rock[] = [];
  function add(
    x: number,
    z: number,
    radius: number,
    height: number,
    blocking: boolean,
  ) {
    if (
      Math.hypot(x, z) < 13 ||
      Math.hypot(x, z) > START_AREA_RADIUS - 12 ||
      riverDistance(x, z) < riverHalfWidth(x) + 3
    )
      return;
    if (
      out.some(
        (r) =>
          Math.hypot(r.x - x, r.z - z) < r.radius + radius + (blocking ? 3 : 1),
      )
    )
      return;
    out.push({
      id: out.length,
      x,
      z,
      radius,
      height,
      blocking,
      yaw: rand() * Math.PI * 2,
      base: terrainHeight(x, z) - 0.04,
    });
  }
  // Curated nearby features; the central departure lane and river crossing stay clear.
  for (const [x, z, r, h] of [
    [-11, -9, 2, 2.4],
    [12, -7, 2.3, 2.8],
    [-14, 15, 2.7, 3.3],
    [11, 23, 2.1, 2.3],
    [-23, 10, 3.5, 4.2],
    [25, -16, 3.3, 3.8],
  ])
    add(x, z, r, h, true);
  for (const [x, z, r] of [
    [-1.5, 20, 0.85],
    [1.5, 23, 0.9],
    [-4, 25, 1.1],
    [4, 28, 0.8],
    [-5, -16, 1],
    [8, -13, 0.9],
  ])
    add(x, z, r, 0.23 + rand() * 0.15, false);
  for (let i = 0; i < 370; i++) {
    const a = rand() * Math.PI * 2,
      r = 22 + Math.sqrt(rand()) * 246,
      x = Math.sin(a) * r,
      z = Math.cos(a) * r;
    // Keep a meandering crossing path navigable, even where it meets the banks.
    if (Math.abs(x - 9 * Math.sin(z / 31)) < 5) continue;
    const blocking = rand() > 0.39,
      radius = blocking ? 1.05 + rand() * 3.8 : 0.6 + rand() * 0.7;
    add(
      x,
      z,
      radius,
      blocking ? radius * (0.65 + rand() * 0.7) : 0.18 + rand() * 0.22,
      blocking,
    );
  }
  return out;
}
export const ROCKS = generateRocks();
const rockCache = new Map<string, Rock[]>();
export const rockCacheSize = () => rockCache.size;
/** Stable cell seeds, with a bounded LRU cache. Original nearby stones are unchanged. */
export function chunkRocks(cx: number, cz: number): Rock[] {
  const key = `${cx},${cz}`,
    cached = rockCache.get(key);
  if (cached) {
    rockCache.delete(key);
    rockCache.set(key, cached);
    return cached;
  }
  const minX = cx * CHUNK_SIZE,
    minZ = cz * CHUNK_SIZE;
  const result = ROCKS.filter(
    (r) =>
      r.x >= minX &&
      r.x < minX + CHUNK_SIZE &&
      r.z >= minZ &&
      r.z < minZ + CHUNK_SIZE,
  );
  for (let ix = cx * 4; ix < cx * 4 + 4; ix++)
    for (let iz = cz * 4; iz < cz * 4 + 4; iz++) {
      const rand = seededRandom(chunkSeed(ix, iz));
      if (rand() < 0.2) continue;
      const x = ix * 32 + 7 + rand() * 18,
        z = iz * 32 + 7 + rand() * 18;
      if (
        Math.hypot(x, z) < 300 ||
        riverDistance(x, z) < riverHalfWidth(x) + 4 ||
        Math.abs(x - 9 * Math.sin(z / 31)) < 6
      )
        continue;
      const blocking = rand() > 0.39,
        radius = blocking ? 1.05 + rand() * 3.8 : 0.6 + rand() * 0.7;
      result.push({
        id: `cell-${ix}-${iz}`,
        x,
        z,
        radius,
        height: blocking
          ? radius * (0.65 + rand() * 0.7)
          : 0.18 + rand() * 0.22,
        yaw: rand() * Math.PI * 2,
        blocking,
        base: terrainHeight(x, z) - 0.04,
      });
    }
  const accessible = result.filter(r => !intersectsRidgeTrail(r.x, r.z, r.radius + 2));
  rockCache.set(key, accessible);
  if (rockCache.size > MAX_ROCK_CACHE)
    rockCache.delete(rockCache.keys().next().value!);
  return accessible;
}
export function nearbyRocks(x: number, z: number, range = 8): Rock[] {
  const result: Rock[] = [];
  for (
    let cx = Math.floor((x - range) / CHUNK_SIZE);
    cx <= Math.floor((x + range) / CHUNK_SIZE);
    cx++
  )
    for (
      let cz = Math.floor((z - range) / CHUNK_SIZE);
      cz <= Math.floor((z + range) / CHUNK_SIZE);
      cz++
    )
      for (const r of chunkRocks(cx, cz))
        if (Math.abs(r.x - x) <= range && Math.abs(r.z - z) <= range)
          result.push(r);
  return result;
}
export const MAX_CLIMB_HEIGHT = 1.5;
export function isClimbableRock(r: Rock) {
  return !r.blocking || (r.height <= MAX_CLIMB_HEIGHT && r.height / r.radius <= 1.25);
}
export function contactHeight(x: number, z: number, rocks: readonly Rock[] = nearbyRocks(x, z, 6)) {
  let height = terrainHeight(x, z);
  for (const r of rocks) {
    if (!isClimbableRock(r)) continue;
    const q = ((x - r.x) ** 2 + (z - r.z) ** 2) / (r.radius * r.radius);
    if (q < 1) height = Math.max(height, r.base + r.height * Math.sqrt(1 - q));
  }
  return height;
}
export function sampleSurface(x: number, z: number) {
  const depth = waterDepth(x, z),
    wet = smooth(depth / 0.16),
    mud = mudAmount(x, z) * (1 - wet),
    grass = grassAmount(x, z) * (1 - wet) * (1 - mud);
  const stone = contactHeight(x, z) - terrainHeight(x, z) > 0.025;
  const kind: SurfaceKind =
    wet > 0.12
      ? "water"
      : stone
        ? "rock"
        : mud > 0.32
          ? "mud"
          : grass > 0.48
            ? "grass"
            : "sand";
  return {
    kind,
    depth,
    mud,
    wet,
    grass,
    drag: wet * 1.15 + mud * 0.63 + grass * 0.06,
  };
}
