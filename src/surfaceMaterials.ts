import * as T from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seededRandom } from "./terrain";

const mix = T.MathUtils.lerp;
const smooth = (t: number) => t * t * (3 - 2 * t);
function hash(x: number, y: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 9841;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
/** Periodic at texture edges; also used in world coordinates for continuous broad color patches. */
export function surfaceNoise(x: number, y: number, period = 256) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const sample = (a: number, b: number) => hash((a % period + period) % period, (b % period + period) % period);
  return mix(mix(sample(ix, iy), sample(ix + 1, iy), smooth(x - ix)),
    mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), smooth(x - ix)), smooth(y - iy));
}
function texture(data: Uint8Array, size: number, name: string, color = false) {
  const t = new T.DataTexture(data, size, size, T.RGBAFormat);
  t.name = name;
  t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
function detailMaps(rock: boolean) {
  const size = 256, albedo = new Uint8Array(size * size * 4), detail = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const broad = surfaceNoise(u * 8, v * 8, 8);
    const medium = surfaceNoise(u * 32, v * 32, 32);
    const fine = surfaceNoise(u * 128, v * 128, 128);
    const grain = hash(x, y);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 6 + v * 9 + broad * .7) * Math.PI * 2)), 18);
    const pebble = Math.pow(Math.max(0, (medium - .53) / .47), 2);
    const h = rock ? .35 * broad + .4 * medium + .25 * fine - vein * .16
      : broad * .16 + fine * .24 + grain * .1 + pebble * .5;
    const brightness = rock ? .67 + broad * .19 + fine * .14 - vein * .16
      : .72 + broad * .1 + fine * .1 + grain * .08 - pebble * .12;
    const i = (y * size + x) * 4;
    albedo.set([brightness * 255, brightness * 251, brightness * 240, 255], i);
    detail.set([T.MathUtils.clamp(h, 0, 1) * 255, (rock ? .78 + fine * .2 : .86 + fine * .14) * 255, 0, 255], i);
  }
  return { map: texture(albedo, size, rock ? "mineral-grain" : "soil-gravel", true),
    detail: texture(detail, size, rock ? "rock-height-roughness" : "soil-height-roughness") };
}

export function createSurfaceMaterials() {
  const soil = detailMaps(false), stone = detailMaps(true);
  const ground = new T.MeshStandardMaterial({
    map: soil.map, bumpMap: soil.detail, bumpScale: .1,
    roughnessMap: soil.detail, roughness: 1, vertexColors: true,
  });
  // One shared material for all chunks. Wetness is sampled in world coordinates on the CPU.
  ground.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nattribute vec2 surface; varying vec2 vSurface;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurface = surface;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\nvarying vec2 vSurface;")
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .34, clamp(vSurface.x, 0., 1.));`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        diffuseColor.rgb *= mix(1., .72, vSurface.x);
        diffuseColor.rgb *= 1. + vSurface.y * (texture2D(map, vMapUv * .37).g - .65) * .2;`);
  };
  ground.customProgramCacheKey = () => "outdoor-ground-v1";
  const rock = new T.MeshStandardMaterial({
    map: stone.map, bumpMap: stone.detail, bumpScale: .09,
    roughnessMap: stone.detail, roughness: 1,
  });
  const rockGeometries = [false, true].map(angular => {
    let g: T.BufferGeometry = new T.IcosahedronGeometry(1, 3);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Stay inside the existing collision silhouette; retain the climbable contact surface.
      const k = angular ? .94 + .06 * Math.sin(x * 5 + z * 3) * Math.cos(y * 7) : 1;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.deleteAttribute("normal");
    const indexed = mergeVertices(g); g.dispose(); g = indexed;
    g.computeVertexNormals();
    return g;
  });
  const positions: number[] = [];
  const random = seededRandom(518);
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2, x = (random() - .5) * .5, z = (random() - .5) * .5;
    const h = .55 + random() * .45, w = .035 + random() * .025;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    const bx = Math.sin(a) * h * .2, bz = Math.cos(a) * h * .2;
    positions.push(x-dx,0,z-dz,x+dx,0,z+dz,x+bx,h*.65,z+bz,
      x+dx,0,z+dz,x+bx+dx*.5,h*.5,z+bz+dz*.5,x+bx*2,h,z+bz*2);
  }
  const grassGeometry = new T.BufferGeometry();
  grassGeometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  grassGeometry.computeVertexNormals();
  const grass = new T.MeshStandardMaterial({color: "#657344", roughness: .96, side: T.DoubleSide});
  return {ground, rock, rockGeometries, grass, grassGeometry};
}
