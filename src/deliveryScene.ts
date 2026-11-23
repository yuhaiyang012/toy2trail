import * as T from "three";
import { FOOD_QUALITIES, PICKUP_RADIUS, foodLocation, type DeliveryState } from "./delivery";
import { terrainHeight } from "./terrain";
import type { Point } from "./streaming";

export function createDeliveryScene() {
  const pickup = new T.Group(), cargo = new T.Group();
  pickup.name = "food-pickup"; cargo.name = "vehicle-food-cargo";
  pickup.visible = cargo.visible = false;
  cargo.position.set(0, 2.78, -.65);
  const materials = {
    wood: new T.MeshStandardMaterial({ color: "#a87c49", roughness: .9 }),
    dark: new T.MeshStandardMaterial({ color: "#35483d", roughness: .85 }),
    carrot: new T.MeshStandardMaterial({ color: "#ed9133", roughness: .7 }),
    green: new T.MeshStandardMaterial({ color: "#6f9c45", roughness: .8 }),
    fruit: new T.MeshStandardMaterial({ color: "#cf6045", roughness: .6 }),
    quality: new T.MeshStandardMaterial({ color: FOOD_QUALITIES[0].color, roughness: .6 }),
  };
  const cube = new T.BoxGeometry(1, 1, 1), sphere = new T.SphereGeometry(1, 12, 8);
  const cone = new T.ConeGeometry(1, 1, 8), cylinder = new T.CylinderGeometry(1, 1, 1, 8);
  function mesh(parent: T.Object3D, geo: T.BufferGeometry, color: keyof typeof materials, p: number[], s: number[]) {
    const node = new T.Mesh(geo, materials[color]);
    node.position.set(p[0], p[1], p[2]); node.scale.set(s[0], s[1], s[2]);
    node.castShadow = node.receiveShadow = true; parent.add(node); return node;
  }
  function foodBox(parent: T.Object3D) {
    const g = new T.Group(); parent.add(g); g.name = "mixed-animal-food";
    mesh(g, cube, "wood", [0, .04, 0], [1.35, .08, .9]);
    for (const side of [-1, 1]) {
      mesh(g, cube, "wood", [side * .66, .31, 0], [.07, .55, .9]);
      for (const y of [.18, .45]) mesh(g, cube, "wood", [0, y, side * .44], [1.35, .18, .06]);
      for (const x of [-.63, .63]) mesh(g, cube, "dark", [x, .31, side * .43], [.055, .64, .06]);
      mesh(g, cube, "quality", [0, .33, side * .481], [.48, .22, .02]);
    }
    for (let i = 0; i < 4; i++) {
      const carrot = mesh(g, cone, "carrot", [-.43 + i * .16, .53, .08], [.11, .43, .11]);
      carrot.rotation.z = Math.PI + .2;
      for (const bend of [-.4, .3]) mesh(g, cone, "green", [-.43 + i * .16, .78, .08], [.04, .2, .04]).rotation.z = bend;
    }
    for (let i = 0; i < 3; i++) {
      mesh(g, sphere, "fruit", [.26 + (i % 2) * .23, .53 + (i === 2 ? .16 : 0), -.19 + i * .12], [.14, .14, .14]);
      mesh(g, cylinder, "green", [.4 + i * .08, .62, .24], [.035, .48, .035]).rotation.z = .3;
    }
    return g;
  }
  foodBox(cargo);
  mesh(cargo, cube, "dark", [0, -.04, 0], [1.5, .08, 1.02]);
  for (const x of [-.49, .49]) mesh(cargo, cube, "dark", [x, .35, 0], [.045, .73, .98]);
  const stand = new T.Group(); pickup.add(stand);
  mesh(stand, cube, "wood", [0, .1, 0], [1.7, .2, 1.2]);
  const stock = foodBox(stand); stock.position.y = .2;
  const beacon = new T.Mesh(new T.OctahedronGeometry(.33), materials.quality);
  stand.add(beacon);
  const ringPosition = new T.BufferAttribute(new Float32Array(64 * 3), 3);
  const ringGeometry = new T.BufferGeometry(); ringGeometry.setAttribute("position", ringPosition);
  const ring = new T.LineLoop(ringGeometry, new T.LineBasicMaterial({ color: "#389b86", transparent: true, opacity: .85 }));
  ring.frustumCulled = false; pickup.add(ring);
  let orderId = -1, appear = 0;
  return {
    pickup, cargo,
    update(time: number, dt: number, state: Readonly<DeliveryState>, origin: Point, car: Point, enabled: boolean, cargoEnabled: boolean) {
      const point = foodLocation(state.order), ground = terrainHeight(point.x, point.z);
      if (state.order.id !== orderId) {
        orderId = state.order.id;
        materials.quality.color.set(FOOD_QUALITIES[state.order.quality].color);
        const dx = Math.cos(point.yaw) * 3.4, dz = -Math.sin(point.yaw) * 3.4;
        stand.position.set(dx, terrainHeight(point.x + dx, point.z + dz) - ground + .05, dz);
        stand.rotation.y = point.yaw;
        for (let i = 0; i < 64; i++) {
          const a = i / 64 * Math.PI * 2, x = Math.cos(a) * PICKUP_RADIUS, z = Math.sin(a) * PICKUP_RADIUS;
          ringPosition.setXYZ(i, x, terrainHeight(point.x + x, point.z + z) - ground + .08, z);
        }
        ringPosition.needsUpdate = true;
      }
      pickup.position.set(point.x - origin.x, ground, point.z - origin.z);
      pickup.visible = enabled && state.phase === "pickup" && Math.hypot(car.x - point.x, car.z - point.z) < 280;
      beacon.position.y = 2.6 + Math.sin(time * 2) * .13; beacon.rotation.y = time * .7;
      appear = state.phase === "carrying" ? T.MathUtils.damp(appear, 1, 12, dt) : 0;
      cargo.visible = enabled && cargoEnabled && state.phase === "carrying";
      cargo.scale.setScalar(Math.max(.001, appear));
    },
    dispose() {
      const geometries = new Set<T.BufferGeometry>(), owned = new Set<T.Material>();
      for (const root of [pickup, cargo]) {
        root.traverse(n => { if (n instanceof T.Mesh || n instanceof T.Line) { geometries.add(n.geometry); for (const mat of Array.isArray(n.material) ? n.material : [n.material]) owned.add(mat); } });
        root.removeFromParent();
      }
      geometries.forEach(g => g.dispose()); owned.forEach(m => m.dispose());
    },
  };
}
