import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import vehicleSpec from "./vehicle-spec.json";

export const dimensions = vehicleSpec;
export type Vec = [number, number, number];
export const v = (p: Vec) => new T.Vector3(...p);
export function createCrawlerModel() {
  const root = new T.Group();
  root.name = "root";
  const body = new T.Group();
  body.name = "sprung-body";
  root.add(body);
  const nodes: Record<string, T.Object3D> = { root };
  const parts: T.Group[] = [];
  const materials = {
    black: new T.MeshPhysicalMaterial({
      color: 0x14171b,
      roughness: 0.43,
      metalness: 0,
      clearcoat: 0.15,
    }),
    rubber: new T.MeshStandardMaterial({ color: 0x17181b, roughness: 0.82 }),
    blue: new T.MeshPhysicalMaterial({
      color: 0x123cca,
      roughness: 0.33,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.3,
    }),
    silver: new T.MeshStandardMaterial({
      color: 0x9da8b2,
      roughness: 0.32,
      metalness: 1,
    }),
    lens: new T.MeshStandardMaterial({
      color: 0x9eabb8,
      roughness: 0.2,
      metalness: 0.3,
    }),
  };
  type Mat = keyof typeof materials;
  function group(id: string, parent: T.Object3D = body, pos: Vec = [0, 0, 0]) {
    const g = new T.Group();
    g.name = id;
    g.position.set(...pos);
    parent.add(g);
    nodes[id] = g;
    g.userData.rest = pos.slice();
    g.userData.partId = id;
    parts.push(g);
    return g;
  }
  function mesh(
    g: T.Object3D,
    geo: T.BufferGeometry,
    mat: Mat,
    pos: Vec = [0, 0, 0],
    rot: Vec = [0, 0, 0],
  ) {
    const m = new T.Mesh(geo, materials[mat]);
    m.name = `${g.name}-mesh-${g.children.length}`;
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    m.userData.explodeWithParent = true;
    g.add(m);
    return m;
  }
  function box(g: T.Object3D, size: Vec, pos: Vec, mat: Mat = "black") {
    return mesh(g, new T.BoxGeometry(...size), mat, pos);
  }
  function rod(g: T.Object3D, a: Vec, b: Vec, r = 0.045, mat: Mat = "black") {
    const av = v(a),
      bv = v(b),
      d = bv.clone().sub(av);
    const m = mesh(g, new T.CylinderGeometry(r, r, d.length(), 10), mat);
    m.position.copy(av.add(bv).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return m;
  }
  function panel(
    g: T.Object3D,
    points: number[][],
    thickness: number,
    mat: Mat = "blue",
    rot: Vec = [0, 0, 0],
  ) {
    const shape = new T.Shape(points.map((p) => new T.Vector2(p[0], p[1])));
    const geo = new T.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.023,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 6,
    });
    geo.translate(0, 0, -thickness / 2);
    return mesh(g, geo, mat, [0, 0, 0], rot);
  }
  function instances(
    g: T.Object3D,
    id: string,
    geo: T.BufferGeometry,
    mat: Mat,
    poses: { p: Vec; r?: Vec }[],
  ) {
    const im = new T.InstancedMesh(geo, materials[mat], poses.length),
      d = new T.Object3D();
    im.name = id;
    for (let i = 0; i < poses.length; i++) {
      d.position.set(...poses[i].p);
      d.rotation.set(...(poses[i].r ?? [0, 0, 0]));
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.castShadow = im.receiveShadow = true;
    g.add(im);
    return im;
  }
  function ink(draw: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return new T.MeshStandardMaterial({
      map: t,
      transparent: true,
      roughness: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  }
  const roofInk = ink((c) => {
    c.strokeStyle = c.fillStyle = "#adb6c3";
    c.lineWidth = 6;
    c.strokeRect(71, 98, 370, 306);
    c.textAlign = "center";
    c.font = "bold 230px Arial";
    c.fillText("98", 256, 338);
    c.font = "bold 21px Arial";
    c.fillText("ALL TERRAIN / RC", 256, 382);
  });
  const sideInk = ink((c) => {
    c.fillStyle = c.strokeStyle = "#a5b0bf";
    c.textAlign = "center";
    c.font = "italic 900 100px Arial";
    c.fillText("LION", 292, 273);
    c.font = "bold 24px Arial";
    c.fillText("4WD  /  ALL TERRAIN", 285, 326);
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(74, 148);
    c.lineTo(151, 177);
    c.lineTo(167, 229);
    c.lineTo(135, 256);
    c.lineTo(154, 296);
    c.lineTo(102, 340);
    c.lineTo(115, 277);
    c.lineTo(84, 251);
    c.lineTo(67, 302);
    c.lineTo(47, 223);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(74, 149);
    c.lineTo(31, 180);
    c.lineTo(47, 223);
    c.stroke();
  });
  const tireInk = ink((c) => {
    c.strokeStyle = c.fillStyle = "#777a80";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(256, 256, 187, 0, Math.PI * 2);
    c.stroke();
    const words = "  AMPHIBIOUS  OFF-ROAD  •  4WD  •  ";
    c.font = "bold 18px Arial";
    c.textAlign = "center";
    for (let i = 0; i < words.length; i++) {
      const a = (i / words.length) * Math.PI * 2;
      c.save();
      c.translate(256 + Math.sin(a) * 213, 256 - Math.cos(a) * 213);
      c.rotate(a);
      c.fillText(words[i], 0, 0);
      c.restore();
    }
  });
  function decal(
    g: T.Object3D,
    id: string,
    mat: T.Material,
    w: number,
    h: number,
    pos: Vec,
    rot: Vec,
  ) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.name = id;
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  }
  const chassis = group("chassis");
  box(chassis, [1.55, 0.27, 3.5], [0, 1.08, 0]);
  box(chassis, [1.65, 0.22, 1.1], [0, 0.83, 0]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++)
      box(chassis, [0.035, 0.045, 0.52], [s * 0.84, 0.84 + i * 0.1, 0]);
  }
  for (const s of [-1, 1]) {
    rod(chassis, [s * 0.72, 1.2, -2], [s * 0.72, 1.2, 2], 0.065);
  }
  const cage = group("cage");
  for (const s of [-1, 1]) {
    const x = s * 0.91;
    rod(cage, [x, 1.35, 1.13], [s * 0.78, 2.62, 0.35]);
    rod(cage, [s * 0.78, 2.62, 0.35], [s * 0.82, 2.57, -1.17]);
    rod(cage, [s * 0.82, 2.57, -1.17], [x, 1.35, -1.68]);
    rod(cage, [x, 1.38, -1.66], [x, 1.4, 1.13], 0.055);
    rod(cage, [s * 0.82, 2.56, -1.17], [x, 1.4, 0.0]);
    rod(cage, [x, 1.43, -0.78], [s * 0.8, 2.6, -0.82]);
    rod(cage, [x, 1.38, -1.65], [s * 0.7, 1.17, -2.1]);
  }
  for (const [y, z] of [
    [2.62, 0.35],
    [2.57, -1.17],
    [1.4, 1.13],
    [1.36, -1.66],
  ])
    rod(cage, [-0.85, y, z], [0.85, y, z], 0.05);
  rod(cage, [0, 1.63, 1.18], [0, 2.62, 0.35], 0.038);
  const hood = group("hood", body, [0, 1.72, 1.48]);
  const hoodMesh = panel(
    hood,
    [
      [-0.88, -0.82],
      [0.88, -0.82],
      [0.98, 0.32],
      [0.78, 0.84],
      [-0.78, 0.84],
      [-0.98, 0.32],
    ],
    0.065,
    "blue",
    [-Math.PI / 2, 0, 0],
  );
  const hp = hoodMesh.geometry.getAttribute("position");
  for (let i = 0; i < hp.count; i++)
    hp.setZ(
      i,
      hp.getZ(i) +
        Math.max(0, 1 - Math.abs(hp.getX(i)) / 0.98) * 0.13 -
        0.06 * hp.getY(i),
    );
  hoodMesh.geometry.computeVertexNormals();
  const roof = group("roof", body, [0, 2.65, -0.39]);
  panel(
    roof,
    [
      [-0.84, -0.83],
      [0.84, -0.83],
      [0.87, 0.67],
      [0.72, 0.84],
      [-0.72, 0.84],
      [-0.87, 0.67],
    ],
    0.045,
    "blue",
    [-Math.PI / 2, 0, 0],
  );
  decal(
    roof,
    "roof-number-98",
    roofInk,
    1.5,
    1.5,
    [0, 0.042, -0.05],
    [-Math.PI / 2, 0, 0],
  );
  instances(
    roof,
    "roof-fasteners",
    new T.CylinderGeometry(0.034, 0.034, 0.024, 10),
    "silver",
    [-1, 1].flatMap((s) =>
      [-1, 1].map((e) => ({ p: [s * 0.72, 0.045, e * 0.68] as Vec })),
    ),
  );
  instances(
    hood,
    "hood-fasteners",
    new T.CylinderGeometry(0.032, 0.032, 0.025, 10),
    "silver",
    [-1, 1].flatMap((s) =>
      [-1, 1].map((e) => ({ p: [s * 0.7, 0.1 + e * 0.042, e * 0.59] as Vec })),
    ),
  );
  for (const s of [-1, 1]) {
    const side = group("side-panel-" + s, body, [s * 0.94, 1.47, -0.26]);
    // XY profile becomes a longitudinal side panel; its thickness follows lateral X.
    panel(
      side,
      [
        [-1.08, 0.36],
        [1.03, 0.26],
        [1.03, -0.36],
        [-0.75, -0.25],
      ],
      0.04,
      "blue",
      [0, Math.PI / 2, 0],
    );
    decal(
      side,
      "side-lion-" + s,
      sideInk,
      1.85,
      0.77,
      [s * 0.043, 0, 0],
      [0, (s * Math.PI) / 2, 0],
    );
    instances(
      side,
      "side-fasteners-" + s,
      new T.CylinderGeometry(0.032, 0.032, 0.025, 10),
      "silver",
      [
        { p: [s * 0.043, 0.22, -0.93], r: [0, 0, Math.PI / 2] },
        { p: [s * 0.043, -0.28, -0.93], r: [0, 0, Math.PI / 2] },
        { p: [s * 0.043, 0.29, 0.94], r: [0, 0, Math.PI / 2] },
        { p: [s * 0.043, -0.19, 0.63], r: [0, 0, Math.PI / 2] },
      ],
    );
  }
  const tireProfile = [
    [0.43, -0.435],
    [0.61, -0.435],
    [0.72, -0.405],
    [0.79, -0.32],
    [0.82, -0.23],
    [0.83, 0],
    [0.82, 0.23],
    [0.79, 0.32],
    [0.72, 0.405],
    [0.61, 0.435],
    [0.43, 0.435],
    [0.43, -0.435],
  ];
  function wheel(id: string, parent: T.Object3D, pos: Vec, scale = 1) {
    const steer = group(id, parent, pos),
      roll = new T.Group();
    roll.name = id + "-roll";
    steer.add(roll);
    const geo = new T.LatheGeometry(
      tireProfile.map((p) => new T.Vector2(...(p as [number, number]))),
      48,
    );
    geo.rotateZ(Math.PI / 2);
    mesh(roll, geo, "rubber");
    const treads: { p: Vec; r: Vec }[] = [];
    for (let i = 0; i < 28; i++)
      for (const s of [-1, 1]) {
        const a = (i * Math.PI * 2) / 28 + (s > 0 ? 0.015 : -0.015);
        treads.push({
          p: [s * 0.228, Math.cos(a) * 0.848, Math.sin(a) * 0.848],
          r: [a, s * 0.47, 0],
        });
      }
    instances(
      roll,
      id + "-chevron-treads",
      new T.BoxGeometry(0.49, 0.125, 0.125),
      "rubber",
      treads,
    );
    const rim = group(id + "-rim", roll);
    for (const s of [-1, 1]) {
      if (id === "spare") {
        mesh(
          rim,
          new T.TorusGeometry(0.445, 0.024, 8, 40),
          "silver",
          [s * 0.424, 0, 0],
          [0, Math.PI / 2, 0],
        );
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          const spoke = box(
            rim,
            [0.055, 0.35, 0.085],
            [s * 0.38, Math.cos(a) * 0.245, Math.sin(a) * 0.245],
          );
          spoke.rotation.x = a;
        }
        mesh(
          rim,
          new T.CylinderGeometry(0.14, 0.14, 0.045, 16),
          "silver",
          [s * 0.4, 0, 0],
          [0, 0, Math.PI / 2],
        );
        continue;
      }
      const profile = [
        [0.08, 0.21],
        [0.17, 0.21],
        [0.34, 0.35],
        [0.425, 0.435],
        [0.47, 0.435],
        [0.47, 0.38],
        [0.355, 0.3],
        [0.17, 0.16],
        [0.08, 0.16],
        [0.08, 0.21],
      ];
      const rg = new T.LatheGeometry(
        profile.map((p) => new T.Vector2(p[0], p[1] * s)),
        40,
      );
      rg.rotateZ(Math.PI / 2);
      mesh(rim, rg, "blue");
    }
    mesh(
      rim,
      new T.CylinderGeometry(0.12, 0.12, 0.48, 12),
      "black",
      [0, 0, 0],
      [0, 0, Math.PI / 2],
    );
    const bolts: { p: Vec; r: Vec }[] = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        bolts.push({
          p: [s * 0.445, Math.sin(a) * 0.429, Math.cos(a) * 0.429],
          r: [0, 0, Math.PI / 2],
        });
      }
      decal(
        roll,
        id + "-sidewall-" + s,
        tireInk,
        1.51,
        1.51,
        [s * 0.443, 0, 0],
        [0, (s * Math.PI) / 2, 0],
      );
    }
    instances(
      rim,
      id + "-rim-bolts",
      new T.CylinderGeometry(0.019, 0.019, 0.015, 6),
      "black",
      bolts,
    );
    steer.scale.setScalar(scale);
    return { steer, roll, id, x: pos[0], z: pos[2] };
  }
  const wheels: ReturnType<typeof wheel>[] = [];
  for (const end of [-1, 1])
    for (const s of [-1, 1])
      wheels.push(
        wheel(
          `${end > 0 ? "front" : "rear"}-${s > 0 ? "left" : "right"}`,
          root,
          [s * 1.5, 0.91, end * 1.9],
        ),
      );
  const spare = wheel("spare", body, [0, 2.08, -2.03], 0.77);
  spare.steer.rotation.set(0.45, Math.PI / 2, 0);
  for (const s of [-1, 1]) {
    const seat = group("seat-" + s, body, [s * 0.43, 1.34, -0.45]);
    const back = box(seat, [0.58, 0.72, 0.16], [0, 0.45, -0.23]);
    back.rotation.x = -0.18;
    box(seat, [0.59, 0.13, 0.68], [0, 0.05, 0.02]);
    for (const side of [-1, 1]) {
      box(seat, [0.08, 0.55, 0.21], [side * 0.29, 0.37, -0.2]);
      box(seat, [0.08, 0.2, 0.52], [side * 0.29, 0.13, 0.01]);
    }
    for (let k = 0; k < 5; k++)
      box(seat, [0.47, 0.034, 0.027], [0, 0.22 + k * 0.09, -0.118 - k * 0.012]);
  }
  const dash = group("dashboard");
  box(dash, [1.42, 0.24, 0.26], [0, 1.73, 0.81]);
  const steering = mesh(
    dash,
    new T.TorusGeometry(0.2, 0.025, 8, 24),
    "black",
    [-0.43, 1.78, 0.55],
    [-0.45, 0, 0],
  );
  rod(dash, [-0.43, 1.7, 0.56], [-0.43, 1.5, 0.94], 0.025);
  rod(dash, [-0.62, 1.78, 0.55], [-0.24, 1.78, 0.55], 0.012);
  for (let i = -1; i <= 1; i++) {
    const lamp = group("roof-light-" + i, body, [i * 0.53, 2.87, 0.26]);
    rod(lamp, [0, -0.19, 0], [0, -0.02, 0], 0.06);
    const housing = panel(
      lamp,
      [
        [-0.18, -0.16],
        [0.18, -0.16],
        [0.2, -0.1],
        [0.2, 0.12],
        [0.15, 0.18],
        [-0.15, 0.18],
        [-0.2, 0.12],
        [-0.2, -0.1],
      ],
      0.23,
      "black",
    );
    mesh(lamp, new T.PlaneGeometry(0.29, 0.25), "lens", [0, 0.005, 0.144]);
    for (let fin = 0; fin < 5; fin++)
      box(lamp, [0.026, 0.24, 0.075], [-0.14 + fin * 0.07, 0.01, -0.14]);
  }
  for (const s of [-1, 1]) {
    const lamp = group("front-aux-" + s, body, [s * 0.38, 1.59, 2.24]);
    mesh(
      lamp,
      new T.CylinderGeometry(0.135, 0.13, 0.09, 20),
      "black",
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    );
    mesh(lamp, new T.CircleGeometry(0.105, 20), "lens", [0, 0, 0.05]);
  }
  const links: {
    wheel: (typeof wheels)[number];
    strut: T.Group;
    rod: T.Mesh;
    spring: T.Mesh;
    lower: T.Mesh;
    upper: T.Mesh;
    mount: Vec;
  }[] = [];
  for (const w of wheels) {
    const s = Math.sign(w.x),
      e = Math.sign(w.z),
      strut = group(w.id + "-suspension", root);
    const mount: Vec = [s * 0.75, 1.64, e * 1.37];
    strut.userData.dynamic = true;
    const piston = mesh(
      strut,
      new T.CylinderGeometry(0.037, 0.037, 1, 10),
      "silver",
    );
    const path: T.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        a = t * Math.PI * 2 * 7;
      path.push(
        new T.Vector3(Math.cos(a) * 0.092, t * 0.55, Math.sin(a) * 0.092),
      );
    }
    const spring = mesh(
      strut,
      new T.TubeGeometry(new T.CatmullRomCurve3(path), 90, 0.017, 5, false),
      "silver",
    );
    const lower = mesh(
      strut,
      new T.CylinderGeometry(0.038, 0.038, 1, 10),
      "black",
    );
    const upper = mesh(
      strut,
      new T.CylinderGeometry(0.03, 0.03, 1, 10),
      "black",
    );
    links.push({ wheel: w, strut, rod: piston, spring, lower, upper, mount });
  }
  const axles: T.Group[] = [];
  for (const end of [-1, 1]) {
    const axle = group("axle-" + end, root, [0, 0.91, end * 1.9]);
    rod(axle, [-1.45, 0, 0], [1.45, 0, 0], 0.09);
    mesh(axle, new T.SphereGeometry(0.21, 16, 10), "black");
    axles.push(axle);
  }
  const bumper = group("front-bumper");
  rod(bumper, [-0.76, 1.18, 1.8], [-1.02, 1.6, 2.43], 0.065);
  rod(bumper, [-1.02, 1.6, 2.43], [1.02, 1.6, 2.43], 0.065);
  rod(bumper, [1.02, 1.6, 2.43], [0.76, 1.18, 1.8], 0.065);
  const carrier = group("rear-carrier");
  for (const s of [-1, 1])
    rod(carrier, [s * 0.66, 1.2, -1.8], [s * 0.35, 2.15, -2.06], 0.055);
  root.userData.sculptRuntime = {
    nodes,
    sockets: Object.fromEntries(
      wheels.map((w) => [
        w.id,
        { node: w.steer, localPivot: [0, 0, 0], axis: [1, 0, 0] },
      ]),
    ),
    colliders: {
      chassis: { type: "box", size: [1.55, 0.5, 3.8] },
      wheels: { type: "cylinder", radius: 0.91 },
    },
    destructionGroups: Object.fromEntries(parts.map((p) => [p.name, [p]])),
  };
  function updateSuspension() {
    root.updateMatrixWorld(true);
    const bodyPoint = (p: Vec) => root.worldToLocal(body.localToWorld(v(p)));
    const fit = (m: T.Mesh, a: T.Vector3, b: T.Vector3) => {
      const d = b.clone().sub(a);
      m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      m.scale.y = d.length();
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    };
    for (const l of links) {
      const p = bodyPoint(l.mount),
        s = Math.sign(l.wheel.x),
        e = Math.sign(l.wheel.z),
        end = new T.Vector3(
          l.wheel.x * 0.88,
          l.wheel.steer.position.y,
          l.wheel.z,
        );
      fit(l.rod, p, end);
      l.spring.position.copy(p);
      l.spring.quaternion.copy(l.rod.quaternion);
      l.spring.scale.y = p.distanceTo(end) / 0.68;
      fit(
        l.lower,
        bodyPoint([s * 0.55, 0.91, e * 0.8]),
        end.clone().add(new T.Vector3(0, -0.08, 0)),
      );
      fit(
        l.upper,
        bodyPoint([s * 0.62, 1.18, e * 0.68]),
        end.clone().add(new T.Vector3(0, 0.08, 0)),
      );
    }
    for (let i = 0; i < axles.length; i++) {
      const a = wheels[i * 2].steer.position,
        b = wheels[i * 2 + 1].steer.position;
      axles[i].position.copy(a.clone().add(b).multiplyScalar(0.5));
      axles[i].rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  updateSuspension();
  // Batch only static siblings. Movable wheel pivots, struts and semantic part groups remain separate.
  function batch(g: T.Object3D) {
    for (const child of [...g.children])
      if (child instanceof T.Group) batch(child);
    if (g.userData.dynamic) return;
    const buckets = new Map<T.Material, T.Mesh[]>();
    for (const child of g.children) {
      if (
        !(child instanceof T.Mesh) ||
        child instanceof T.InstancedMesh ||
        Array.isArray(child.material) ||
        child.material.transparent
      )
        continue;
      const list = buckets.get(child.material) ?? [];
      list.push(child);
      buckets.set(child.material, list);
    }
    for (const [material, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        return (
          m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        ).applyMatrix4(m.matrix);
      });
      const geo = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const merged = new T.Mesh(geo, material);
      merged.name = g.name + "-batched-" + material.uuid.slice(0, 5);
      merged.castShadow = merged.receiveShadow = true;
      list.forEach((m) => {
        g.remove(m);
        m.geometry.dispose();
      });
      g.add(merged);
    }
  }
  batch(root);
  return {
    root,
    body,
    wheels,
    spare,
    links,
    axles,
    parts,
    nodes,
    materials,
    group,
    mesh,
    box,
    rod,
    panel,
    updateSuspension,
  };
}
export type Crawler = ReturnType<typeof createCrawlerModel>;
