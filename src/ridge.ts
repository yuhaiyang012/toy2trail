/** Local mountain terrain west of the start. All coordinates are logical world units. */
export const RIDGE_START_X = -38;
export const RIDGE_LENGTH = 360;
export const RIDGE_HEIGHT = 50;
const ease = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};
export function ridgeCenterZ(along: number) {
  return -2 - .3 * along + 10 * Math.sin(along * Math.PI / 120);
}
export function ridgePoint(along: number) {
  return {x: RIDGE_START_X - along, z: ridgeCenterZ(along)};
}
function crestHeight(along: number) {
  if (along < 0 || along > RIDGE_LENGTH) return 0;
  if (along < 205) return RIDGE_HEIGHT * ease(along / 205);
  if (along <= 240) return RIDGE_HEIGHT;
  return RIDGE_HEIGHT * (1 - ease((along - 240) / 120));
}
export function ridgeElevation(x: number, z: number) {
  const along = RIDGE_START_X - x;
  const crest = crestHeight(along);
  if (!crest) return 0;
  const distance = Math.abs(z - ridgeCenterZ(along));
  // An 18-unit-wide crest with gradual mountain flanks, never a separate floating mesh.
  return crest * (1 - ease((distance - 9) / 58));
}
export function ridgeTrail(x: number, z: number) {
  const along = RIDGE_START_X - x;
  if (along < 0 || along > RIDGE_LENGTH) return 0;
  const ends = ease(along / 12) * ease((RIDGE_LENGTH - along) / 12);
  return ends * (1 - ease((Math.abs(z - ridgeCenterZ(along)) - 5) / 4));
}
export function intersectsRidgeTrail(x: number, z: number, radius: number) {
  const along = RIDGE_START_X - x;
  if (along < -radius || along > RIDGE_LENGTH + radius) return false;
  const nearest = Math.max(0, Math.min(RIDGE_LENGTH, along));
  const p = ridgePoint(nearest);
  // Allow room for the car and the full visible rock, including near the route ends.
  return Math.hypot(x - p.x, z - p.z) < 9 + radius;
}
