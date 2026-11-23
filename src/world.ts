import * as T from "three";
import { createSurfaceMaterials, surfaceNoise } from "./surfaceMaterials";
import { ridgeElevation, ridgeTrail, RIDGE_HEIGHT } from "./ridge";
import {
  WATER_LEVEL,
  RIVER_SPACING,
  chunkRocks,
  nearbyRocks,
  isClimbableRock,
  terrainHeight,
  baseHeight,
  riverCenter,
  riverHalfWidth,
  riverDistance,
  mudAmount,
  grassAmount,
  seededRandom,
  smooth,
} from "./terrain";
import {
  CHUNK_SIZE,
  MAX_ACTIVE_CHUNKS,
  activeChunks,
  chunkSeed,
  renderOrigin,
  type Point,
} from "./streaming";

/** Fixed-size streaming window; geometry coordinates stay local to each chunk. */
export function createWorld() {
  const root = new T.Group();
  root.name = "unbounded-offroad";
  const landmarks = new T.Group();
  landmarks.name = "starting-landmarks";
  root.add(landmarks);
  const dummy = new T.Object3D();
  let origin: Point = { x: 0, z: 0 },
    anchor = "",
    lastCX = Infinity,
    lastCZ = Infinity;
  const materials = createSurfaceMaterials();
  const groundMaterial = materials.ground;
  const sand = new T.Color("#bca782"),
    grass = new T.Color("#6d7950"),
    mud = new T.Color("#705846"),
    highland = new T.Color("#8b9170"),
    ridgeRock = new T.Color("#828575"),
    ridgeDirt = new T.Color("#bea27a"),
    color = new T.Color();
  const rockMaterial = materials.rock,
    rockGeometries = materials.rockGeometries,
    grassGeometry = materials.grassGeometry,
    grassMaterial = materials.grass;
  const pebbleGeometry = new T.IcosahedronGeometry(1, 0),
    pebbleMaterial = new T.MeshStandardMaterial({
      color: "#91938a",
      roughness: 1,
    });
  const waterMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    fog: true,
    uniforms: T.UniformsUtils.merge([
      T.UniformsLib.fog,
      { time: { value: 0 }, waterColor: { value: new T.Color("#477d78") } },
    ]),
    vertexShader: [
      "#include <fog_pars_vertex>",
      "varying vec2 vUv; varying vec3 vWaterWorld; uniform float time;",
      "void main(){ vUv=uv; vec3 p=position; p.y+=sin(uv.x*16.+time*1.7)*sin(uv.y*7.-time)*.008;",
      "vWaterWorld=(modelMatrix*vec4(p,1.)).xyz; vec4 mvPosition=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mvPosition;",
      "#include <fog_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "#include <fog_pars_fragment>",
      "varying vec2 vUv; varying vec3 vWaterWorld; uniform float time; uniform vec3 waterColor;",
      `void main(){
        float bank=pow(abs(vUv.y*2.-1.),6.);
        float a=sin(vUv.x*42.-time*1.5+sin(vUv.y*31.));
        float b=cos(vUv.x*27.-time*.9+vUv.y*47.);
        vec3 normal=normalize(vec3(a*.07,1.,b*.09));
        vec3 view=normalize(cameraPosition-vWaterWorld);
        float fresnel=.04+.96*pow(1.-max(0.,dot(normal,view)),5.);
        vec3 reflected=mix(waterColor,vec3(.39,.52,.58),fresnel*.75);
        float highlight=pow(max(0.,dot(reflect(-normalize(vec3(-16.,24.,14.)),normal),view)),90.);
        gl_FragColor=vec4(reflected+(a*b)*.009+highlight*.19,.63+fresnel*.24-bank*.28);`,
      "#include <tonemapping_fragment>",
      "#include <colorspace_fragment>",
      "#include <fog_fragment>",
      "}",
    ].join("\n"),
  });
  type Tile = {
    group: T.Group;
    cx: number;
    cz: number;
    rocks: number;
    blocking: number;
    grass: number;
  };
  const tiles = new Map<string, Tile>();
  let pending: ReturnType<typeof activeChunks> = [];
  const stats = {
    chunks: 0,
    maxChunks: MAX_ACTIVE_CHUNKS,
    pending: 0,
    disposedChunks: 0,
    rocks: 0,
    blockingRocks: 0,
    grass: 0,
    terrainTriangles: 0,
  };
  function owned(geometry: T.BufferGeometry, material: T.Material) {
    const mesh = new T.Mesh(geometry, material);
    mesh.userData.ownedGeometry = true;
    return mesh;
  }
  function createTile(cx: number, cz: number): Tile {
    const minX = cx * CHUNK_SIZE,
      minZ = cz * CHUNK_SIZE,
      random = seededRandom(chunkSeed(cx, cz, 9817));
    const list = chunkRocks(cx, cz);
    const shadeRocks = nearbyRocks(minX + CHUNK_SIZE / 2, minZ + CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 8);
    const group = new T.Group();
    group.name = "terrain-" + cx + "-" + cz;
    const geo = new T.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 64, 64);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
    const p = geo.getAttribute("position"),
      normals = geo.getAttribute("normal"),
      colors = new Float32Array(p.count * 3),
      surfaces = new Float32Array(p.count * 2),
      uv = geo.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + minX,
        z = p.getZ(i) + minZ,
        y = terrainHeight(x, z);
      p.setY(i, y);
      // Analytic shared-edge normals prevent tile lighting seams.
      const nx =
          (terrainHeight(x - 0.25, z) - terrainHeight(x + 0.25, z)) / 0.5,
        nz = (terrainHeight(x, z - 0.25) - terrainHeight(x, z + 0.25)) / 0.5,
        len = Math.hypot(nx, 1, nz);
      normals.setXYZ(i, nx / len, 1 / len, nz / len);
      color
        .copy(sand)
        .lerp(grass, grassAmount(x, z) * 0.92)
        .lerp(highland, smooth((baseHeight(x, z) - 6) / 13) * 0.38)
        .lerp(mud, mudAmount(x, z) * 0.85);
      color
        .lerp(ridgeRock, ridgeElevation(x, z) / RIDGE_HEIGHT * .72)
        .lerp(ridgeDirt, ridgeTrail(x, z) * .88);
      if (riverDistance(x, z) < riverHalfWidth(x)) color.lerp(mud, 0.7);
      const variation = .87 + surfaceNoise(x / 7, z / 7) * .22 + surfaceNoise(x / 27, z / 27) * .08;
      // Cheap ambient contact darkening, including neighboring chunk rocks to avoid seams.
      let contactShade = 0;
      for (const rock of shadeRocks) {
        const dx = x - rock.x, dz = z - rock.z, reach = rock.radius * 1.6;
        if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
        const q = (dx * dx + dz * dz) / (rock.radius * rock.radius * 1.25);
        contactShade = Math.max(contactShade, .28 * Math.exp(-q * q));
      }
      color.multiplyScalar(variation * (1 - contactShade));
      colors.set([color.r, color.g, color.b], i * 3);
      surfaces.set([Math.max(mudAmount(x, z), riverDistance(x, z) < riverHalfWidth(x) ? 1 : 0), grassAmount(x, z)], i * 2);
      // 128-unit chunks contain exactly 32 repeats, so edges and rebase positions match.
      uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
    }
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    geo.setAttribute("surface", new T.BufferAttribute(surfaces, 2));
    const ground = owned(geo, groundMaterial);
    ground.name = "ground";
    ground.receiveShadow = true;
    group.add(ground);
    for (const blocking of [false, true]) {
      const rocks = list.filter((r) => r.blocking === blocking);
      if (!rocks.length) continue;
      const mesh = new T.InstancedMesh(
        rockGeometries[blocking ? 1 : 0],
        rockMaterial,
        rocks.length,
      );
      mesh.name = blocking ? "blocking-boulders" : "driveable-rocks";
      rocks.forEach((r, i) => {
        dummy.position.set(r.x - minX, r.base, r.z - minZ);
        dummy.scale.set(r.radius, r.height, r.radius);
        dummy.rotation.set(0, r.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const tint = seededRandom(
          chunkSeed(Math.floor(r.x * 10), Math.floor(r.z * 10), 7),
        );
        mesh.setColorAt(
          i,
          new T.Color().setHSL(
            0.12 + tint() * 0.04,
            0.07 + tint() * 0.07,
            0.28 + tint() * 0.15,
          ),
        );
      });
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (
      let band = Math.floor((minZ - 80) / RIVER_SPACING);
      band <= Math.ceil((minZ + CHUNK_SIZE + 80) / RIVER_SPACING);
      band++
    ) {
      let intersects = false;
      for (let i = 0; i <= CHUNK_SIZE; i += 4) {
        const center = riverCenter(minX + i, band),
          w = riverHalfWidth(minX + i);
        if (center + w >= minZ && center - w <= minZ + CHUNK_SIZE) {
          intersects = true;
          break;
        }
      }
      if (!intersects) continue;
      const positions: number[] = [],
        uv: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= CHUNK_SIZE; i++) {
        const x = minX + i,
          center = riverCenter(x, band),
          w = riverHalfWidth(x);
        for (let j = 0; j <= 8; j++) {
          const z = Math.max(
            minZ,
            Math.min(minZ + CHUNK_SIZE, center + (j / 4 - 1) * w),
          );
          positions.push(i, WATER_LEVEL + 0.014, z - minZ);
          uv.push(x / 20, Math.max(0, Math.min(1, (z - center + w) / (2 * w))));
        }
      }
      for (let i = 0; i < CHUNK_SIZE; i++)
        for (let j = 0; j < 8; j++) {
          const a = i * 9 + j,
            b = a + 9;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      const water = owned(geometry, waterMaterial);
      water.name = "shallow-river";
      water.renderOrder = 2;
      group.add(water);
    }
    const tufts: { x: number; z: number; s: number }[] = [],
      pebbles: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 300; i++) {
      const x = minX + random() * CHUNK_SIZE,
        z = minZ + random() * CHUNK_SIZE;
      if (
        grassAmount(x, z) > 0.4 &&
        mudAmount(x, z) < 0.3 &&
        riverDistance(x, z) > riverHalfWidth(x) + 3
      )
        tufts.push({ x, z, s: 0.3 + random() * 0.55 });
      if (Math.abs(riverDistance(x, z) - riverHalfWidth(x) - 1.1) < 1.5)
        pebbles.push({ x, z, s: 0.08 + random() * 0.17 });
    }
    function instances(
      points: typeof tufts,
      geometry: T.BufferGeometry,
      material: T.Material,
      isGrass: boolean,
    ) {
      if (!points.length) return;
      const mesh = new T.InstancedMesh(geometry, material, points.length);
      mesh.name = isGrass ? "grass-tufts" : "bank-gravel";
      points.forEach((p, i) => {
        dummy.position.set(
          p.x - minX,
          terrainHeight(p.x, p.z),
          p.z - minZ,
        );
        dummy.scale.set(
          p.s,
          isGrass ? p.s * 0.5 : 0.035,
          isGrass ? p.s : p.s * 0.8,
        );
        dummy.rotation.set(isGrass ? 0.1 : 0, random() * 6, isGrass ? 0.12 : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    instances(tufts, grassGeometry, grassMaterial, true);
    instances(pebbles, pebbleGeometry, pebbleMaterial, false);
    group.position.set(minX - origin.x, 0, minZ - origin.z);
    root.add(group);
    return {
      group,
      cx,
      cz,
      rocks: list.length,
      blocking: list.filter((r) => !isClimbableRock(r)).length,
      grass: tufts.length,
    };
  }
  function removeTile(tile: Tile) {
    root.remove(tile.group);
    tile.group.traverse((n) => {
      if (n instanceof T.Mesh && n.userData.ownedGeometry) n.geometry.dispose();
      if (n instanceof T.InstancedMesh) n.dispose();
    });
    stats.disposedChunks++;
  }
  function update(time: number, x = 0, z = 0, force = false) {
    waterMaterial.uniforms.time.value = time;
    origin = force
      ? {
          x: Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE,
          z: Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE,
        }
      : renderOrigin(x, z, origin);
    const cx = Math.floor(x / CHUNK_SIZE),
      cz = Math.floor(z / CHUNK_SIZE),
      key = cx + "," + cz;
    if (anchor !== key) {
      const wanted = activeChunks(x, z),
        keep = new Set(wanted.map((c) => c.key));
      force =
        force || Math.max(Math.abs(cx - lastCX), Math.abs(cz - lastCZ)) > 1;
      for (const [key, tile] of tiles)
        if (!keep.has(key)) {
          removeTile(tile);
          tiles.delete(key);
        }
      pending = wanted.filter((c) => !tiles.has(c.key));
      anchor = key;
      lastCX = cx;
      lastCZ = cz;
    }
    const budget = force ? pending.length : 2;
    for (let i = 0; i < budget && pending.length; i++) {
      const c = pending.shift()!;
      tiles.set(c.key, createTile(c.x, c.z));
    }
    for (const tile of tiles.values())
      tile.group.position.set(
        tile.cx * CHUNK_SIZE - origin.x,
        0,
        tile.cz * CHUNK_SIZE - origin.z,
      );
    landmarks.position.set(-origin.x, 0, -origin.z);
    landmarks.visible = Math.hypot(x, z) < 500;
    stats.chunks = tiles.size;
    stats.pending = pending.length;
    stats.rocks = 0;
    stats.blockingRocks = 0;
    stats.grass = 0;
    for (const tile of tiles.values()) {
      stats.rocks += tile.rocks;
      stats.blockingRocks += tile.blocking;
      stats.grass += tile.grass;
    }
    stats.terrainTriangles = tiles.size * 64 * 64 * 2;
  }
  const markerMaterial = new T.MeshStandardMaterial({
      color: "#c3733d",
      roughness: 0.8,
    }),
    baseMaterial = new T.MeshStandardMaterial({ color: "#333c30" });
  for (const [x, z] of [
    [-4, 0],
    [4, 0],
    [-4, 12],
    [4, 12],
    [-6, 33],
    [6, 33],
    [-6, 53],
    [6, 53],
  ]) {
    const g = new T.Group();
    g.position.set(x, terrainHeight(x, z), z);
    const cone = new T.Mesh(new T.ConeGeometry(0.23, 0.75, 12), markerMaterial);
    cone.position.y = 0.43;
    cone.castShadow = true;
    const base = new T.Mesh(new T.BoxGeometry(0.56, 0.07, 0.56), baseMaterial);
    base.position.y = 0.035;
    g.add(base, cone);
    landmarks.add(g);
  }
  function sign(x: number, z: number, title: string, subtitle: string) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const c2 = c.getContext("2d")!;
    c2.fillStyle = "#344437";
    c2.fillRect(0, 0, 512, 256);
    c2.strokeStyle = "#c2bd9b";
    c2.lineWidth = 7;
    c2.strokeRect(12, 12, 488, 232);
    c2.fillStyle = "#eeead9";
    c2.textAlign = "center";
    c2.font = "bold 52px sans-serif";
    c2.fillText(title, 256, 112);
    c2.font = "27px sans-serif";
    c2.fillText(subtitle, 256, 179);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const g = new T.Group();
    g.position.set(x, terrainHeight(x, z), z);
    const board = new T.Mesh(
      new T.BoxGeometry(3.4, 1.7, 0.12),
      new T.MeshStandardMaterial({ color: "#354638" }),
    );
    board.position.y = 2.1;
    const face = new T.Mesh(
      new T.PlaneGeometry(3.3, 1.65),
      new T.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    );
    face.position.set(0, 2.1, -0.067);
    face.rotation.y = Math.PI;
    const back = face.clone();
    back.position.z = 0.067;
    back.rotation.y = 0;
    const post = new T.Mesh(
      new T.CylinderGeometry(0.075, 0.075, 2.4, 8),
      baseMaterial,
    );
    post.position.y = 1.2;
    g.add(board, face, back, post);
    landmarks.add(g);
  }
  sign(-8, 16, "ROCK GARDEN", "慢行 / 石径");
  sign(9, 32, "SHALLOW FORD", "浅滩 / 涉水减速");
  sign(-35, -12, "RIDGE TRAIL", "山坡 / 自由探索");

  update(0, 0, 0, true);
  return {
    root,
    update,
    stats,
    get origin() {
      return origin;
    },
    hasGround(x: number, z: number) {
      return tiles.has(
        Math.floor(x / CHUNK_SIZE) + "," + Math.floor(z / CHUNK_SIZE),
      );
    },
  };
}
