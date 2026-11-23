import { terrainHeight, contactHeight, nearbyRocks, isClimbableRock, type Rock } from "./terrain";

export const WHEEL_RADIUS = .91;
// Same rear-right, rear-left, front-right, front-left order as the model.
const WHEELS = [[-1.5, -1.9], [1.5, -1.9], [-1.5, 1.9], [1.5, 1.9]];
const TIRE_SAMPLES = Array.from({length:13}, (_, i) => {
  const angle = (i / 12 - .5) * Math.PI;
  return { along: Math.sin(angle) * WHEEL_RADIUS, drop: (1 - Math.cos(angle)) * WHEEL_RADIUS };
});
/** Height of the tire's bottom, supported by its rounded tread rather than one point. */
export function wheelContactHeight(x: number, z: number, yaw: number, rocks: readonly Rock[] = nearbyRocks(x, z, 7)) {
  let height = terrainHeight(x, z);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const r of rocks) {
    if (!isClimbableRock(r) || Math.hypot(x-r.x,z-r.z)>r.radius+WHEEL_RADIUS+.4) continue;
    for (const across of [-.36, 0, .36]) for (const {along,drop} of TIRE_SAMPLES) {
      const px = x + fx * along + fz * across - r.x;
      const pz = z + fz * along - fx * across - r.z;
      const q = (px * px + pz * pz) / (r.radius * r.radius);
      if (q < 1) height = Math.max(height, r.base + r.height * Math.sqrt(1-q) - drop);
    }
  }
  return height;
}
/** Shared wheel support for driving resistance and visible suspension. No rendering coordinates. */
export function sampleSuspension(x: number, z: number, yaw: number, steer = 0) {
  const rocks = nearbyRocks(x, z, 8).filter(isClimbableRock);
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  let rockLift = 0;
  const heights = WHEELS.map(([wx,wz]) => {
    const px = x + cos * wx + sin * wz, pz = z - sin * wx + cos * wz;
    const h = wheelContactHeight(px,pz,yaw+(wz>0?steer:0),rocks);
    rockLift = Math.max(rockLift,h-terrainHeight(px,pz));
    return h;
  });
  let base = heights.reduce((a,b)=>a+b,0)/4;
  if (!rocks.length) return {heights,base,rockLift};
  // Skid-plate support prevents a straddled stone from intersecting the belly.
  for (const along of [-1.65,-.8,0,.8,1.65]) for (const across of [-.6,0,.6]) {
    const px=x+sin*along+cos*across, pz=z+cos*along-sin*across;
    if (!rocks.some(r => (px-r.x)**2+(pz-r.z)**2<r.radius**2)) continue;
    const h=contactHeight(px,pz,rocks);
    const lift=h-terrainHeight(px,pz);
    rockLift=Math.max(rockLift,lift);
    if(lift>.01) base=Math.max(base,h-.7);
  }
  return {heights,base,rockLift};
}
