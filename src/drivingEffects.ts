import * as T from "three";
import { sampleSurface, terrainHeight, WATER_LEVEL, seededRandom } from "./terrain";
import type { DriveState } from "./physics";
import type { Point } from "./streaming";

export const EFFECT_LIMITS = { particles: 256, tracks: 1536 } as const;
type Wheel = { x: number; z: number };
type Contact = Point & { phase: number };
type Particle = Point & {
  y: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; opacity: number; water: boolean;
};
type Track = { corners: number[]; age: number; life: number; opacity: number };

/** The world's 2-unit grid uses triangles (00,01,10) and (01,11,10).
 * Match the visible mesh instead of letting decals sink into curved analytic hills. */
export function trackGroundHeight(x: number, z: number) {
  const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
  const u = (x - gx) / 2, v = (z - gz) / 2;
  const h10 = terrainHeight(gx + 2, gz), h01 = terrainHeight(gx, gz + 2);
  return u + v <= 1
    ? terrainHeight(gx, gz) * (1 - u - v) + h10 * u + h01 * v
    : terrainHeight(gx + 2, gz + 2) * (u + v - 1) + h10 * (1 - v) + h01 * (1 - u);
}

export function wheelEffectSurface(x: number, z: number, contactY: number) {
  const surface = sampleSurface(x, z);
  const grounded = contactY - terrainHeight(x, z) < .14;
  const water = surface.depth > .035 && contactY < WATER_LEVEL + .025;
  return {
    water,
    dust: grounded && !water && surface.kind === "sand"
      ? (1 - surface.mud) * (1 - surface.grass * .85) : 0,
    track: grounded && !water && surface.kind === "sand" ? .16
      : grounded && !water && surface.kind === "mud" ? .29 : 0,
    mud: surface.kind === "mud",
  };
}

/** Visual-only, fixed-capacity pools. World coordinates stay in JS doubles;
 * only uploaded buffers are relative to the current rendering origin. */
export function createDrivingEffects(wheels: readonly Wheel[]) {
  const root = new T.Group();
  root.name = "wheel-surface-effects";
  const random = seededRandom(98531);
  const particles: (Particle | undefined)[] = new Array(EFFECT_LIMITS.particles);
  const tracks: (Track | undefined)[] = new Array(EFFECT_LIMITS.tracks);
  const wheelHistory: (Contact | undefined)[] = wheels.map(() => undefined);
  const dustDebt = wheels.map(() => 0), waterDebt = wheels.map(() => 0);
  let particleCursor = 0, trackCursor = 0, previous: Point | undefined;
  let uploadedOrigin: Point = { x: NaN, z: NaN };
  const stats = { dust: 0, splashes: 0, tracks: 0, dustEmitted: 0, splashesEmitted: 0, tracksEmitted: 0 };

  const particleGeometry = new T.BufferGeometry();
  const particlePosition = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.particles * 3), 3).setUsage(T.DynamicDrawUsage);
  const particleSize = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.particles), 1).setUsage(T.DynamicDrawUsage);
  const particleAlpha = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.particles), 1).setUsage(T.DynamicDrawUsage);
  const particleKind = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.particles), 1).setUsage(T.DynamicDrawUsage);
  particleGeometry.setAttribute("position", particlePosition);
  particleGeometry.setAttribute("size", particleSize);
  particleGeometry.setAttribute("opacity", particleAlpha);
  particleGeometry.setAttribute("water", particleKind);
  const particleMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { pixelScale: { value: 900 } }]),
    vertexShader: `
      #include <fog_pars_vertex>
      attribute float size, opacity, water;
      uniform float pixelScale;
      varying float vAlpha, vWater;
      void main() {
        vAlpha = opacity; vWater = water;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(size * pixelScale / max(.1, -mvPosition.z), 1., 80.);
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying float vAlpha, vWater;
      void main() {
        if (vAlpha < .002) discard;
        vec2 p = gl_PointCoord * 2. - 1.;
        p.x *= mix(1., 1.45, vWater);
        float r = length(p);
        float softness = 1. - smoothstep(mix(.08, .32, vWater), 1., r);
        float grain = .86 + .14 * sin(p.x * 12. + sin(p.y * 9.));
        vec3 tint = mix(vec3(.57, .48, .33), vec3(.62, .83, .88), vWater);
        gl_FragColor = vec4(tint, vAlpha * softness * grain);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const spray = new T.Points(particleGeometry, particleMaterial);
  spray.name = "dust-and-water";
  spray.frustumCulled = false;
  spray.renderOrder = 3;
  root.add(spray);

  const trackGeometry = new T.BufferGeometry();
  const trackPosition = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.tracks * 12), 3).setUsage(T.DynamicDrawUsage);
  const trackUV = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.tracks * 8), 2).setUsage(T.DynamicDrawUsage);
  const trackAlpha = new T.BufferAttribute(new Float32Array(EFFECT_LIMITS.tracks * 4), 1).setUsage(T.DynamicDrawUsage);
  const indices: number[] = [];
  for (let i = 0; i < EFFECT_LIMITS.tracks; i++) {
    const v = i * 4;
    indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  trackGeometry.setIndex(indices);
  trackGeometry.setAttribute("position", trackPosition);
  trackGeometry.setAttribute("uv", trackUV);
  trackGeometry.setAttribute("opacity", trackAlpha);
  const trackMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, fog: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog]),
    vertexShader: `
      #include <fog_pars_vertex>
      attribute float opacity;
      varying float vAlpha; varying vec2 vUv;
      void main() {
        vAlpha = opacity; vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying float vAlpha; varying vec2 vUv;
      void main() {
        if (vAlpha < .002) discard;
        float edge = smoothstep(0., .12, vUv.x) * (1. - smoothstep(.88, 1., vUv.x));
        float chevron = fract(vUv.y + abs(vUv.x * 2. - 1.) * .42);
        float tread = smoothstep(.08, .18, chevron) * (1. - smoothstep(.55, .70, chevron));
        gl_FragColor = vec4(.16, .125, .075, vAlpha * edge * (.24 + .76 * tread));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const tread = new T.Mesh(trackGeometry, trackMaterial);
  tread.name = "fading-tire-tracks";
  tread.frustumCulled = false;
  tread.renderOrder = 1;
  root.add(tread);

  function emitParticle(x: number, y: number, z: number, yaw: number, speed: number, side: number, water: boolean, strength: number) {
    const sign = Math.sign(speed), fx = Math.sin(yaw) * sign, fz = Math.cos(yaw) * sign;
    const outward = side * (water ? .7 + Math.abs(speed) * .12 : .18 + random() * .28);
    const back = water ? .35 + Math.abs(speed) * .17 : .2 + Math.abs(speed) * .1;
    const life = water ? .38 + random() * .32 : .9 + random() * .65;
    // Eject at the outer tread shoulder, where droplets clear the opaque tire.
    const shoulder = side * (water ? .52 : .32);
    particles[particleCursor] = {
      x: x - fx * .36 + Math.cos(yaw) * shoulder + (random() - .5) * .18,
      y: y + .07, z: z - fz * .36 - Math.sin(yaw) * shoulder + (random() - .5) * .18,
      vx: Math.cos(yaw) * outward - fx * back,
      vy: water ? 1.1 + random() * .7 + Math.abs(speed) * .06 : .22 + random() * .2,
      vz: -Math.sin(yaw) * outward - fz * back,
      age: 0, life, water,
      size: water ? .10 + random() * .07 : .3 + random() * .22,
      opacity: water ? .68 : .17 * strength,
    };
    particleCursor = (particleCursor + 1) % EFFECT_LIMITS.particles;
    if (water) stats.splashesEmitted++; else stats.dustEmitted++;
  }

  function emitTrack(from: Contact, to: Point, opacity: number, mud: boolean) {
    const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
    const nx = dz / length * .34, nz = -dx / length * .34;
    const corners: number[] = [];
    for (const p of [from, to]) for (const side of [-1, 1]) {
      const x = p.x + nx * side, z = p.z + nz * side;
      corners.push(x, trackGroundHeight(x, z) + .028, z);
    }
    tracks[trackCursor] = { corners, age: 0, life: mud ? 65 : 42, opacity };
    const endPhase = from.phase + length / .3;
    for (let j = 0; j < 4; j++) trackUV.setXY(trackCursor * 4 + j, j % 2, j < 2 ? from.phase : endPhase);
    trackUV.needsUpdate = true;
    trackCursor = (trackCursor + 1) % EFFECT_LIMITS.tracks;
    stats.tracksEmitted++;
    // Integer wrapping preserves the tread pattern during arbitrarily long drives.
    return endPhase % 256;
  }

  function update(dt: number, state: Readonly<DriveState>, origin: Point, heights: readonly number[], enabled: boolean) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    dt = Math.min(dt, .1);
    const distance = previous ? Math.hypot(state.x - previous.x, state.z - previous.z) : 0;
    const moving = enabled && Math.abs(state.speed) > .15 && distance > .0001 && distance < 2;
    previous = { x: state.x, z: state.z };
    let trackPositionsDirty = origin.x !== uploadedOrigin.x || origin.z !== uploadedOrigin.z;
    if (moving) {
      const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
      wheels.forEach((wheel, i) => {
        const x = state.x + cos * wheel.x + sin * wheel.z;
        const z = state.z - sin * wheel.x + cos * wheel.z;
        const effect = wheelEffectSurface(x, z, heights[i]);
        const yaw = state.yaw + (wheel.z > 0 ? state.steer : 0);
        if (effect.water) {
          waterDebt[i] += distance / .24;
          while (waterDebt[i] >= 1) {
            emitParticle(x, WATER_LEVEL + .025, z, yaw, state.speed, Math.sign(wheel.x), true, 1);
            waterDebt[i]--;
          }
        } else waterDebt[i] = 0;
        if (effect.dust > .1 && Math.abs(state.speed) > 1.2 && wheel.z < 0) {
          dustDebt[i] += distance * effect.dust / .55;
          while (dustDebt[i] >= 1) {
            emitParticle(x, heights[i], z, yaw, state.speed, Math.sign(wheel.x), false, effect.dust);
            dustDebt[i]--;
          }
        } else dustDebt[i] = 0;
        const from = wheelHistory[i];
        if (!effect.track) wheelHistory[i] = undefined;
        else if (!from || Math.hypot(x - from.x, z - from.z) > 1.2) wheelHistory[i] = { x, z, phase: 0 };
        else if (Math.hypot(x - from.x, z - from.z) >= .28) {
          const phase = emitTrack(from, { x, z }, effect.track, effect.mud);
          wheelHistory[i] = { x, z, phase };
          trackPositionsDirty = true;
        }
      });
    } else {
      wheelHistory.fill(undefined);
      dustDebt.fill(0); waterDebt.fill(0);
    }
    stats.dust = stats.splashes = stats.tracks = 0;
    particles.forEach((p, i) => {
      if (!p) return;
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy += (p.water ? -5.5 : .06) * dt;
      if (p.age >= p.life || (p.water && p.y < WATER_LEVEL)) {
        particles[i] = undefined;
        particleAlpha.setX(i, 0);
        return;
      }
      const t = p.age / p.life;
      particlePosition.setXYZ(i, p.x - origin.x, p.y, p.z - origin.z);
      particleSize.setX(i, p.size * (1 + t * (p.water ? .3 : 2.2)));
      particleAlpha.setX(i, p.opacity * Math.min(1, p.age / .08) * (1 - t) ** 1.3);
      particleKind.setX(i, Number(p.water));
      if (p.water) stats.splashes++; else stats.dust++;
    });
    tracks.forEach((track, i) => {
      if (!track) return;
      track.age += dt;
      const far = Math.hypot(track.corners[0] - state.x, track.corners[2] - state.z) > 260;
      if (track.age >= track.life || far) {
        tracks[i] = undefined;
        for (let j = 0; j < 4; j++) trackAlpha.setX(i * 4 + j, 0);
        return;
      }
      stats.tracks++;
      const fade = Math.min(1, (1 - track.age / track.life) * 2);
      for (let j = 0; j < 4; j++) {
        trackAlpha.setX(i * 4 + j, track.opacity * fade);
        if (trackPositionsDirty) trackPosition.setXYZ(i * 4 + j, track.corners[j * 3] - origin.x, track.corners[j * 3 + 1], track.corners[j * 3 + 2] - origin.z);
      }
    });
    if (trackPositionsDirty) trackPosition.needsUpdate = true;
    uploadedOrigin = { ...origin };
    particlePosition.needsUpdate = particleSize.needsUpdate = particleAlpha.needsUpdate = particleKind.needsUpdate = trackAlpha.needsUpdate = true;
    spray.visible = stats.dust + stats.splashes > 0;
    tread.visible = stats.tracks > 0;
  }

  function reset() {
    particles.fill(undefined); tracks.fill(undefined); wheelHistory.fill(undefined);
    dustDebt.fill(0); waterDebt.fill(0);
    particleCursor = trackCursor = 0; previous = undefined;
    particleAlpha.array.fill(0); trackAlpha.array.fill(0);
    particleAlpha.needsUpdate = trackAlpha.needsUpdate = true;
    for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] = 0;
    spray.visible = tread.visible = false;
  }
  reset();
  return {
    root, stats, update, reset,
    setViewport(pixelHeight: number, verticalFov: number) {
      particleMaterial.uniforms.pixelScale.value = pixelHeight / (2 * Math.tan(T.MathUtils.degToRad(verticalFov) / 2));
    },
    dispose() {
      reset(); root.removeFromParent();
      particleGeometry.dispose(); particleMaterial.dispose();
      trackGeometry.dispose(); trackMaterial.dispose();
    },
  };
}
