import { nearbyRocks, isClimbableRock, type Rock } from "./terrain";
export const VEHICLE_RADIUS = 1.5;
export const VEHICLE_OFFSETS = [-1.25, 0, 1.25] as const;
export const rockCollisionRadius = (r: Rock) => r.radius * 0.88;
export function vehicleCircles(x: number, z: number, yaw: number) {
  return VEHICLE_OFFSETS.map((offset) => ({
    x: x + Math.sin(yaw) * offset,
    z: z + Math.cos(yaw) * offset,
  }));
}
export function canOccupy(
  x: number,
  z: number,
  yaw: number,
  rocks: readonly Rock[] = nearbyRocks(x, z, 8),
) {
  return rocks.every(
    (r) =>
      isClimbableRock(r) ||
      vehicleCircles(x, z, yaw).every(
        (c) =>
          Math.hypot(c.x - r.x, c.z - r.z) >=
          rockCollisionRadius(r) + VEHICLE_RADIUS - 1e-6,
      ),
  );
}
/** Sweeps every body circle; earliest contact wins, retaining tangential movement. */
export function moveWithCollisions(
  x: number,
  z: number,
  dx: number,
  dz: number,
  yaw = 0,
  obstacles?: readonly Rock[],
) {
  const rocks = (
    obstacles ?? nearbyRocks(x + dx / 2, z + dz / 2, Math.hypot(dx, dz) / 2 + 8)
  ).filter((r) => !isClimbableRock(r));
  let px = x,
    pz = z,
    mx = dx,
    mz = dz,
    collided = false;
  // Recover a loaded / teleported overlapping state. Normal steering checks occupancy first.
  for (let pass = 0; pass < 12; pass++) {
    let depth = 0,
      nx = 0,
      nz = 0;
    for (const c of vehicleCircles(px, pz, yaw))
      for (const r of rocks) {
        const ox = c.x - r.x,
          oz = c.z - r.z,
          len = Math.hypot(ox, oz),
          d = rockCollisionRadius(r) + VEHICLE_RADIUS - len;
        if (d > depth + 1e-6) {
          depth = d;
          nx = len > 1e-9 ? ox / len : Math.cos(yaw);
          nz = len > 1e-9 ? oz / len : -Math.sin(yaw);
        }
      }
    if (depth === 0) break;
    px += nx * (depth + 0.0001);
    pz += nz * (depth + 0.0001);
    collided = true;
  }
  for (let pass = 0; pass < 6; pass++) {
    let first = 1,
      normal: { x: number; z: number } | undefined;
    const a = mx * mx + mz * mz;
    if (a < 1e-14) break;
    for (const c of vehicleCircles(px, pz, yaw))
      for (const r of rocks) {
        const rr = rockCollisionRadius(r) + VEHICLE_RADIUS,
          ox = c.x - r.x,
          oz = c.z - r.z,
          b = ox * mx + oz * mz,
          cc = ox * ox + oz * oz - rr * rr,
          disc = b * b - a * cc;
        if (b >= 0 || disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= -1e-6 && t < first) {
          first = Math.max(0, t);
          const hx = ox + mx * first,
            hz = oz + mz * first,
            len = Math.hypot(hx, hz);
          normal = { x: hx / len, z: hz / len };
        }
      }
    if (!normal) {
      px += mx;
      pz += mz;
      break;
    }
    collided = true;
    const travel = Math.max(0, first - 0.00001);
    px += mx * travel;
    pz += mz * travel;
    mx *= 1 - first;
    mz *= 1 - first;
    const inward = Math.min(0, mx * normal.x + mz * normal.z);
    mx -= normal.x * inward;
    mz -= normal.z * inward;
  }
  return { x: px, z: pz, collided };
}
