import { ANIMAL_CAMP, ROUTE_LENGTH, campGuidance, routePoint, type RewardStorage } from "./destination";
import { canOccupy } from "./collision";
import { terrainHeight, waterDepth } from "./terrain";
import type { Point } from "./streaming";

export const DELIVERY_KEY = "blue98.food-delivery.v1";
export const PICKUP_RADIUS = 4.5;
export const LOAD_SECONDS = 1.6;
export const UNLOAD_SECONDS = 1.8;
export const FOOD_QUALITIES = [
  { name: "普通", color: "#8b9c6b", hearts: 10 },
  { name: "优质", color: "#389b86", hearts: 20 },
  { name: "珍品", color: "#d9a231", hearts: 35 },
] as const;
export type DeliveryPhase = "pickup" | "carrying" | "delivered";
export interface FoodOrder { id: number; along: number; offset: number; quality: number }
export interface DeliveryState { version: 1; phase: DeliveryPhase; order: FoodOrder; meals: number; hearts: number; lastQuality: number }
const unit = (random: () => number) => Math.max(0, Math.min(.999999999, random()));

export function foodLocation(order: Pick<FoodOrder, "along" | "offset">) {
  const p = routePoint(order.along), next = routePoint(order.along + .1);
  const yaw = Math.atan2(next.x - p.x, next.z - p.z);
  return { x: p.x + Math.cos(yaw) * order.offset, z: p.z - Math.sin(yaw) * order.offset, yaw };
}
export function safeFoodLocation(point: Point) {
  if (waterDepth(point.x, point.z) > .001) return false;
  const slope = Math.hypot(
    (terrainHeight(point.x + .3, point.z) - terrainHeight(point.x - .3, point.z)) / .6,
    (terrainHeight(point.x, point.z + .3) - terrainHeight(point.x, point.z - .3)) / .6,
  );
  return slope < .72 && Array.from({ length: 8 }, (_, i) => i * Math.PI / 4).every(yaw => canOccupy(point.x, point.z, yaw));
}
export function randomFoodOrder(random: () => number, id: number, previous?: FoodOrder): FoodOrder {
  const qualityRoll = unit(random), quality = qualityRoll < .55 ? 0 : qualityRoll < .87 ? 1 : 2;
  for (let i = 0; i < 40; i++) {
    const candidate = { id, along: 58 + unit(random) * 132, offset: (unit(random) - .5) * 2.2, quality };
    if (previous && Math.abs(candidate.along - previous.along) < 28) continue;
    if (safeFoodLocation(foodLocation(candidate))) return candidate;
  }
  // Both fallbacks are inside the validated, wide ridge corridor.
  return { id, along: previous && previous.along < 120 ? 170 : 80, offset: 0, quality };
}

export function deliveryGuidance(x: number, z: number, state: Readonly<DeliveryState>, lookAhead = 12) {
  const here = campGuidance(x, z), pickup = state.phase === "pickup";
  const along = pickup ? state.order.along : ROUTE_LENGTH;
  const target = pickup ? foodLocation(state.order) : ANIMAL_CAMP;
  const direction = Math.sign(along - here.progress);
  const nextAlong = here.progress + direction * Math.min(lookAhead, Math.abs(along - here.progress));
  const from = routePoint(here.progress), path: Point[] = [from];
  for (let d = here.progress + direction * 4; direction && direction * (along - d) > 0; d += direction * 4) path.push(routePoint(d));
  path.push(target);
  return {
    target, path, next: Math.abs(along - here.progress) < lookAhead ? target : routePoint(nextAlong),
    distance: Math.hypot(target.x - x, target.z - z),
    remaining: here.offRoute + Math.abs(along - here.progress) + (pickup ? Math.abs(state.order.offset) : 0),
    offRoute: here.offRoute,
    color: pickup ? "#389b86" : state.phase === "delivered" ? "#3b8057" : "#c18b23",
    active: state.phase !== "delivered",
  };
}

function validSave(value: unknown): value is DeliveryState {
  const s = value as DeliveryState | null;
  return !!s && s.version === 1 && ["pickup", "carrying", "delivered"].includes(s.phase)
    && [s.meals, s.hearts, s.order?.id].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1e9)
    && Number.isFinite(s.order?.along) && s.order.along >= 58 && s.order.along <= 190
    && Number.isFinite(s.order?.offset) && Math.abs(s.order.offset) <= 1.1
    && [0, 1, 2].includes(s.order.quality) && [0, 1, 2].includes(s.lastQuality)
    && safeFoodLocation(foodLocation(s.order));
}
export function createDelivery(storage?: RewardStorage, random: () => number = Math.random) {
  let state: DeliveryState | undefined, saved = false, dwell = 0;
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(DELIVERY_KEY) || "null");
    if (validSave(parsed)) { state = parsed; saved = true; }
  } catch { /* Invalid or unavailable storage starts a safe session. */ }
  const persist = () => {
    saved = false;
    try { if (storage) { storage.setItem(DELIVERY_KEY, JSON.stringify(state)); saved = true; } } catch { /* Session-only progress. */ }
  };
  if (!state) {
    state = { version: 1, phase: "pickup", order: randomFoodOrder(random, 1), meals: 0, hearts: 0, lastQuality: 0 };
    persist();
  }
  const current = state;
  return {
    get state(): Readonly<DeliveryState> { return current; },
    get saved() { return saved; },
    get progress() { return Math.min(1, dwell / (current.phase === "pickup" ? LOAD_SECONDS : UNLOAD_SECONDS)); },
    update(dt: number, x: number, z: number, speed: number, enabled: boolean): "loaded" | "fed" | undefined {
      if (!enabled || ![dt, x, z, speed].every(Number.isFinite) || dt <= 0 || current.phase === "delivered") { dwell = 0; return; }
      const pickup = current.phase === "pickup", target = pickup ? foodLocation(current.order) : ANIMAL_CAMP;
      if (Math.abs(speed) > .35 || Math.hypot(x - target.x, z - target.z) > (pickup ? PICKUP_RADIUS : ANIMAL_CAMP.radius)) { dwell = 0; return; }
      dwell += Math.min(dt, .1);
      if (dwell + 1e-9 < (pickup ? LOAD_SECONDS : UNLOAD_SECONDS)) return;
      dwell = 0;
      if (pickup) { current.phase = "carrying"; persist(); return "loaded"; }
      current.phase = "delivered";
      current.meals++;
      current.hearts += FOOD_QUALITIES[current.order.quality].hearts;
      current.lastQuality = current.order.quality;
      persist();
      return "fed";
    },
    nextOrder() {
      if (current.phase !== "delivered") return false;
      current.order = randomFoodOrder(random, current.order.id + 1, current.order);
      current.phase = "pickup"; dwell = 0; persist(); return true;
    },
    interrupt() { dwell = 0; },
  };
}
