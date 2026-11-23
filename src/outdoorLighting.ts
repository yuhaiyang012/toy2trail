import * as T from "three";

export const SUN_OFFSET = new T.Vector3(-16, 24, 14);
export const OUTDOOR_FOG = { color: 0xc6d3d4, near: 105, far: 320 };

/** Small generated sky, baked once into environment lighting. No network assets or per-frame PMREM. */
export function createOutdoorEnvironment(renderer: T.WebGLRenderer) {
  const width = 256, height = 128, data = new Uint8Array(width * height * 4);
  const backdrop = new Uint8Array(data.length);
  const sun = SUN_OFFSET.clone().normalize(), direction = new T.Vector3();
  const horizon = new T.Color("#ced7d4"), zenith = new T.Color("#6393ba"), earth = new T.Color("#706f53");
  const color = new T.Color(), haze = new T.Color(OUTDOOR_FOG.color);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = ((x + .5) / width - .5) * Math.PI * 2;
    const e = ((y + .5) / height - .5) * Math.PI;
    direction.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
    color.copy(horizon).lerp(direction.y > 0 ? zenith : earth, Math.pow(Math.abs(direction.y), .55));
    const halo = Math.pow(Math.max(0, direction.dot(sun)), 70) * .22;
    color.r += halo; color.g += halo * .85; color.b += halo * .56;
    color.convertLinearToSRGB();
    const i = (y * width + x) * 4;
    data.set([Math.min(255,color.r*255), Math.min(255,color.g*255), Math.min(255,color.b*255), 255], i);
    // Distant ground ends below the horizon when looking down from the ridge.
    // Match the fog there, while retaining earth colors in vehicle reflections.
    color.copy(haze).lerp(zenith, T.MathUtils.smoothstep(direction.y, .18, .9) * .8);
    color.convertLinearToSRGB();
    backdrop.set([Math.round(color.r*255), Math.round(color.g*255), Math.round(color.b*255), 255], i);
  }
  const sky = new T.DataTexture(data, width, height, T.RGBAFormat);
  sky.colorSpace = T.SRGBColorSpace;
  sky.mapping = T.EquirectangularReflectionMapping;
  sky.magFilter = sky.minFilter = T.LinearFilter;
  sky.needsUpdate = true;
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(sky);
  pmrem.dispose();
  const background = new T.DataTexture(backdrop, width, height, T.RGBAFormat);
  background.colorSpace = T.SRGBColorSpace;
  background.mapping = T.EquirectangularReflectionMapping;
  background.magFilter = background.minFilter = T.LinearFilter;
  background.needsUpdate = true;
  sky.dispose(); // The reflection has already been baked into the PMREM target.
  return {background, environment};
}
