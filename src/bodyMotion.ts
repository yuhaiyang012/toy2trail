/** Damped suspension response for the sprung body. Wheel contact remains authoritative. */
type Axis = { position: number; velocity: number };
export interface BodyTarget { height: number; pitch: number; roll: number; minHeight: number }
function spring(axis: Axis, target: number, dt: number, frequency: number, damping: number) {
  const w = frequency * Math.PI * 2, decay = damping * w, wd = w * Math.sqrt(1 - damping * damping);
  const x = axis.position - target, v = axis.velocity, e = Math.exp(-decay * dt);
  const c = Math.cos(wd * dt), s = Math.sin(wd * dt);
  axis.position = target + e * (x * c + (v + decay * x) / wd * s);
  axis.velocity = e * (v * c - (decay * v + w * w * x) / wd * s);
}
export function createBodyMotion() {
  const height: Axis = {position: 0, velocity: 0}, pitch = {...height}, roll = {...height};
  let initialized = false;
  return {
    height, pitch, roll,
    update(target: BodyTarget, dt: number, reset = false) {
      if (reset || !initialized) {
        height.position = target.height; pitch.position = target.pitch; roll.position = target.roll;
        height.velocity = pitch.velocity = roll.velocity = 0; initialized = true;
      } else if (Number.isFinite(dt) && dt > 0) {
        dt = Math.min(dt, 1 / 30);
        spring(height, target.height, dt, 2.8, .58);
        spring(pitch, target.pitch, dt, 2.5, .62);
        spring(roll, target.roll, dt, 2.8, .65);
      }
      const low = Math.max(target.minHeight, target.height - .18), high = target.height + .24;
      if (height.position < low) {height.position = low; height.velocity = Math.max(0,height.velocity);}
      if (height.position > high) {height.position = high; height.velocity = Math.min(0,height.velocity);}
      // Stops keep body lag within suspension articulation on abrupt rock edges.
      for (const [axis, desired] of [[pitch,target.pitch],[roll,target.roll]] as const) {
        const limited = Math.max(desired - .14, Math.min(desired + .14, axis.position));
        if (axis.position !== limited) {axis.position = limited; axis.velocity = 0;}
      }
      return {height: height.position, pitch: pitch.position, roll: roll.position};
    },
  };
}
