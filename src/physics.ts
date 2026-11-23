import { sampleSurface, terrainHeight } from "./terrain";
import { moveWithCollisions, canOccupy } from "./collision";
import { sampleSuspension, WHEEL_RADIUS } from "./suspension";
export { terrainHeight } from "./terrain";

export interface DriveInput {
  throttle: number;
  steer: number;
  brake: boolean;
}
export interface DriveState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  roll: number;
  distance: number;
  acceleration: number;
}
export const freshState = (): DriveState => ({
  x: 0,
  z: 0,
  yaw: 0,
  speed: 0,
  steer: 0,
  roll: 0,
  distance: 0,
  acceleration: 0,
});
/** Grade in the forward direction, independent of whether the car is reversing. */
export function roadGrade(x: number, z: number, yaw: number) {
  const dx = Math.sin(yaw) * .75, dz = Math.cos(yaw) * .75;
  return (terrainHeight(x + dx, z + dz) - terrainHeight(x - dx, z - dz)) / 1.5;
}
export function stepDrive(s: DriveState, input: DriveInput, dt: number) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  dt = Math.min(dt, 1 / 30);
  const previous = s.speed;
  const throttle = Math.max(-1, Math.min(1, input.throttle));
  const surface = sampleSurface(s.x, s.z);
  const support = sampleSuspension(s.x,s.z,s.yaw,s.steer);
  const crawling = support.rockLift > .45;
  let climbingResistance = 0;
  if (crawling && (s.speed !== 0 || throttle !== 0)) {
    const direction = Math.sign(s.speed || throttle);
    const ahead = sampleSuspension(s.x+Math.sin(s.yaw)*.3*direction,s.z+Math.cos(s.yaw)*.3*direction,s.yaw,s.steer);
    climbingResistance = Math.max(0,Math.min(2,(ahead.base-support.base)/.3))*2.4;
  }
  const rolling = 0.65 + Math.abs(s.speed) * (0.11 + surface.drag) + climbingResistance;
  const grade = roadGrade(s.x, s.z, s.yaw);
  const gravity = -7.5 * grade / Math.hypot(1, grade);
  const force = throttle * (crawling ? 8.6 : 6.4) * (1 - surface.mud * .22);
  if (input.brake)
    s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - dt * 16);
  else {
    // Static rolling resistance holds gentle ground; gravity can roll an unbraked car on a hill.
    const velocity = s.speed + (force + gravity) * dt;
    s.speed = Math.sign(velocity) * Math.max(0, Math.abs(velocity) - rolling * dt);
  }
  s.speed = Math.max(crawling ? -4 : -5, Math.min(crawling ? 6 : 12, s.speed));
  const maxSteer = 0.48 / (1 + Math.abs(s.speed) * 0.035);
  s.steer +=
    (Math.max(-1, Math.min(1, input.steer)) * maxSteer - s.steer) *
    (1 - Math.exp(-dt * 10));
  const nextYaw = s.yaw + (s.speed / 3.8) * Math.tan(s.steer) * dt;
  if (canOccupy(s.x, s.z, nextYaw)) s.yaw = nextYaw;
  const oldX = s.x,
    oldZ = s.z,
    dx = Math.sin(s.yaw) * s.speed * dt,
    dz = Math.cos(s.yaw) * s.speed * dt;
  const moved = moveWithCollisions(s.x, s.z, dx, dz, s.yaw);
  s.x = moved.x;
  s.z = moved.z;
  if (moved.collided) {
    const ratio = Math.min(
      1,
      Math.hypot(s.x - oldX, s.z - oldZ) / (Math.hypot(dx, dz) || 1),
    );
    s.speed *= ratio;
  }
  if (Math.abs(s.speed) < 1e-9) s.speed = 0;
  const distance = Math.hypot(s.x - oldX, s.z - oldZ);
  s.roll += Math.sign(previous || s.speed) * (distance / WHEEL_RADIUS);
  s.distance += distance;
  s.acceleration = (s.speed - previous) / dt;
}
