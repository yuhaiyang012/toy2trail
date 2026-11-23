import { ridgePoint } from "./ridge";
import type { Point } from "./streaming";

export const ANIMAL_CAMP = { ...ridgePoint(222), radius: 7, name: "山顶动物营地" } as const;
export const REWARD_KEY = "blue98.animal-camp.v1";
export const ANIMAL_REWARDS = [
  { id: "rabbit", name: "绒绒", kind: "小兔", icon: "🐰" },
  { id: "fox", name: "栗栗", kind: "狐狸", icon: "🦊" },
  { id: "panda", name: "团团", kind: "熊猫", icon: "🐼" },
] as const;

// A gentle westward departure arc, then the clear approach to the existing ridge.
const approach: Point[] = [];
for (let i = 0; i <= 8; i++) {
  const a = i / 8 * Math.PI / 2;
  approach.push({ x: -8 + 8 * Math.cos(a), z: 8 * Math.sin(a) });
}
for (let x = -10; x >= -30; x -= 2) {
  const t = (-x - 8) / 22;
  approach.push({ x, z: 8 * (1 - t * t * (3 - 2 * t)) });
}
approach.push({ x: -34, z: -1 });
export const CAMP_ROUTE: readonly Point[] = [
  ...approach,
  ...Array.from({ length: 38 }, (_, i) => ridgePoint(i * 6)),
];
const cumulative = [0];
for (let i = 1; i < CAMP_ROUTE.length; i++) {
  cumulative.push(cumulative[i - 1] + Math.hypot(CAMP_ROUTE[i].x - CAMP_ROUTE[i - 1].x, CAMP_ROUTE[i].z - CAMP_ROUTE[i - 1].z));
}
export const ROUTE_LENGTH = cumulative[cumulative.length - 1];

export function routePoint(distance: number): Point {
  const d = Math.max(0, Math.min(ROUTE_LENGTH, distance));
  for (let i = 1; i < cumulative.length; i++) if (cumulative[i] >= d) {
    const t = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
    const a = CAMP_ROUTE[i - 1], b = CAMP_ROUTE[i];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  return { x: ANIMAL_CAMP.x, z: ANIMAL_CAMP.z };
}

export function campGuidance(x: number, z: number, lookAhead = 10) {
  let offRoute = Infinity, progress = 0;
  for (let i = 1; i < CAMP_ROUTE.length; i++) {
    const a = CAMP_ROUTE[i - 1], b = CAMP_ROUTE[i], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (distance < offRoute) { offRoute = distance; progress = cumulative[i - 1] + length * t; }
  }
  return {
    target: routePoint(progress + lookAhead), offRoute, progress,
    remaining: offRoute + ROUTE_LENGTH - progress,
    distance: Math.hypot(x - ANIMAL_CAMP.x, z - ANIMAL_CAMP.z),
  };
}

export function campMapMarker(x: number, z: number, size: number, span: number) {
  const dx = (ANIMAL_CAMP.x - x) * size / span, dz = (ANIMAL_CAMP.z - z) * size / span;
  const limit = size / 2 - 12;
  const scale = Math.min(1, limit / Math.max(Math.abs(dx), Math.abs(dz), .001));
  return { x: size / 2 + dx * scale, y: size / 2 + dz * scale, outside: scale < 1, angle: Math.atan2(dz, dx) };
}

export interface RewardStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createDestination(storage?: RewardStorage) {
  let completed = false, saved = false, unlocks = 0;
  try { completed = storage?.getItem(REWARD_KEY) === "complete"; saved = completed; } catch { /* Session-only play remains available. */ }
  function persist(value: string) {
    saved = false;
    try { if (storage) { storage.setItem(REWARD_KEY, value); saved = value === "complete"; } } catch { /* Private / file browsing may reject storage. */ }
  }
  return {
    get completed() { return completed; },
    get saved() { return saved; },
    get unlocks() { return unlocks; },
    update(x: number, z: number, driving: boolean) {
      if (completed || !driving || !Number.isFinite(x) || !Number.isFinite(z)) return false;
      if (Math.hypot(x - ANIMAL_CAMP.x, z - ANIMAL_CAMP.z) > ANIMAL_CAMP.radius) return false;
      completed = true; unlocks++; persist("complete");
      return true;
    },
    restart() { completed = false; unlocks = 0; persist("pending"); },
  };
}
