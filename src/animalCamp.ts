import * as T from "three";
import { ANIMAL_CAMP, ANIMAL_REWARDS } from "./destination";
import { terrainHeight } from "./terrain";
import type { Point } from "./streaming";
import { FOOD_QUALITIES } from "./delivery";

/** A small, decorative campsite. No collision bodies or changes to the terrain. */
export function createAnimalCamp() {
  const root = new T.Group();
  root.name = "animal-destination";
  root.visible = false;
  const baseY = terrainHeight(ANIMAL_CAMP.x, ANIMAL_CAMP.z);
  const sphere = new T.SphereGeometry(1, 16, 12);
  const cone = new T.ConeGeometry(1, 1, 4);
  const materials = {
    white: new T.MeshStandardMaterial({ color: "#fff3df", roughness: .8 }),
    black: new T.MeshStandardMaterial({ color: "#252d31", roughness: .8 }),
    orange: new T.MeshStandardMaterial({ color: "#d97a32", roughness: .85 }),
    cream: new T.MeshStandardMaterial({ color: "#ffdda1", roughness: .8 }),
    pink: new T.MeshStandardMaterial({ color: "#e9a5a0", roughness: .85 }),
    gold: new T.MeshStandardMaterial({ color: "#e4af3e", roughness: .55, metalness: .15 }),
    wood: new T.MeshStandardMaterial({ color: "#695840", roughness: .95 }),
  };
  type Tint = keyof typeof materials;
  function ball(parent: T.Object3D, color: Tint, at: number[], size: number[]) {
    const mesh = new T.Mesh(sphere, materials[color]);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function eye(parent: T.Object3D, x: number, y: number, z: number) {
    ball(parent, "black", [x, y, z], [.055, .07, .035]);
    ball(parent, "white", [x - .015, y + .022, z + .029], [.016, .02, .012]);
  }
  const animals = ANIMAL_REWARDS.map((reward, i) => {
    const actor = new T.Group();
    actor.name = "reward-" + reward.id;
    actor.visible = false;
    actor.position.set(-1, 0, (i - 1) * 3.3);
    actor.rotation.y = Math.PI / 2;
    const ground = terrainHeight(ANIMAL_CAMP.x + actor.position.x, ANIMAL_CAMP.z + actor.position.z) - baseY;
    root.add(actor);
    const color: Tint = reward.id === "fox" ? "orange" : "white";
    ball(actor, color, [0, .74, 0], [.57, .73, .46]);
    ball(actor, color, [0, 1.57, .04], [.57, .52, .48]);
    for (const side of [-1, 1]) ball(actor, reward.id === "panda" ? "black" : color, [side * .3, .14, .2], [.24, .15, .32]);
    const wave = new T.Group();
    wave.position.set(-.5, 1.07, 0);
    actor.add(wave);
    ball(wave, reward.id === "panda" ? "black" : color, [-.12, -.13, .06], [.18, .34, .2]);
    ball(actor, reward.id === "panda" ? "black" : color, [.51, .88, .08], [.18, .34, .2]).rotation.z = .25;
    let tail: T.Group | undefined;
    if (reward.id === "rabbit") {
      for (const side of [-1, 1]) {
        ball(actor, "white", [side * .24, 2.13, .015], [.16, .64, .15]).rotation.z = -side * .14;
        ball(actor, "pink", [side * .24, 2.16, .14], [.075, .46, .025]).rotation.z = -side * .14;
        eye(actor, side * .2, 1.62, .48);
        ball(actor, "pink", [side * .34, 1.43, .43], [.11, .06, .035]);
      }
      ball(actor, "pink", [0, 1.43, .535], [.07, .05, .035]);
      ball(actor, "white", [0, .55, -.51], [.25, .25, .25]);
    } else if (reward.id === "fox") {
      ball(actor, "cream", [0, .76, .405], [.34, .45, .08]);
      ball(actor, "cream", [0, 1.38, .4], [.36, .23, .23]);
      ball(actor, "black", [0, 1.43, .62], [.075, .06, .05]);
      for (const side of [-1, 1]) {
        const ear = new T.Mesh(cone, materials.orange);
        ear.scale.set(.27, .61, .24); ear.position.set(side * .37, 1.99, -.02);
        ear.rotation.z = -side * .15; actor.add(ear);
        const inner = new T.Mesh(cone, materials.cream);
        inner.scale.set(.13, .34, .08); inner.position.set(side * .37, 1.99, .125);
        inner.rotation.z = -side * .15; actor.add(inner);
        eye(actor, side * .22, 1.63, .46);
      }
      tail = new T.Group(); tail.position.set(.43, .45, -.25); tail.rotation.z = -.6; actor.add(tail);
      ball(tail, "orange", [0, .34, -.18], [.3, .62, .31]);
      ball(tail, "cream", [0, .84, -.18], [.23, .28, .23]);
    } else {
      for (const side of [-1, 1]) {
        ball(actor, "black", [side * .43, 1.99, -.02], [.22, .22, .18]);
        ball(actor, "black", [side * .22, 1.65, .465], [.16, .2, .055]).rotation.z = side * .3;
        ball(actor, "white", [side * .22, 1.65, .52], [.055, .067, .025]);
        ball(actor, "black", [side * .22, 1.65, .544], [.029, .04, .014]);
      }
      ball(actor, "black", [0, 1.43, .535], [.095, .065, .045]);
    }
    return { actor, ground, wave, tail, index: i };
  });

  const feeding = new T.Group(); feeding.name = "animal-food-bowls"; feeding.visible = false; root.add(feeding);
  const bowlGeometry = new T.CylinderGeometry(.38, .3, .15, 16);
  const foodMaterial = new T.MeshStandardMaterial({ color: "#dca04a", roughness: .9 });
  for (const { actor, ground } of animals) {
    const bowl = new T.Mesh(bowlGeometry, materials.wood);
    bowl.position.set(actor.position.x + .85, ground + .08, actor.position.z); feeding.add(bowl);
    for (let i = 0; i < 5; i++) {
      const food = new T.Mesh(sphere, foodMaterial);
      food.scale.set(.09, .08, .09);
      food.position.set(bowl.position.x + Math.sin(i * 2.4) * .2, ground + .18, bowl.position.z + Math.cos(i * 2.4) * .2);
      feeding.add(food);
    }
  }
  const heartShape = new T.Shape();
  heartShape.moveTo(0, -.3); heartShape.bezierCurveTo(-.65, .1, -.35, .65, 0, .3); heartShape.bezierCurveTo(.35, .65, .65, .1, 0, -.3);
  const heartGeometry = new T.ShapeGeometry(heartShape);
  const heartMaterial = new T.MeshBasicMaterial({ color: "#e4909a", side: T.DoubleSide, transparent: true, depthWrite: false });
  const hearts = animals.map((_, i) => { const h = new T.Mesh(heartGeometry, heartMaterial); h.name = "feeding-heart-" + i; h.rotation.y = Math.PI / 2; h.visible = false; root.add(h); return h; });

  const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => {
    const a = i / 96 * Math.PI * 2, x = Math.cos(a) * ANIMAL_CAMP.radius, z = Math.sin(a) * ANIMAL_CAMP.radius;
    return new T.Vector3(x, terrainHeight(ANIMAL_CAMP.x + x, ANIMAL_CAMP.z + z) - baseY + .09, z);
  })), new T.LineBasicMaterial({ color: "#e3ae39", transparent: true, opacity: .85 }));
  line.name = "destination-ring";
  root.add(line);
  const poleGeometry = new T.CylinderGeometry(.055, .075, 3.7, 8);
  const flagShape = new T.Shape();
  flagShape.moveTo(0, 0); flagShape.lineTo(0, -.7); flagShape.lineTo(1, -.35); flagShape.closePath();
  const flagGeometry = new T.ShapeGeometry(flagShape);
  const flagMaterial = new T.MeshStandardMaterial({ color: "#e5b643", roughness: .9, side: T.DoubleSide });
  for (const side of [-1, 1]) {
    const flag = new T.Group(), x = 3.5, z = side * 6;
    flag.position.set(x, terrainHeight(ANIMAL_CAMP.x + x, ANIMAL_CAMP.z + z) - baseY, z);
    const pole = new T.Mesh(poleGeometry, materials.wood); pole.position.y = 1.85; flag.add(pole);
    const cloth = new T.Mesh(flagGeometry, flagMaterial); cloth.position.y = 3.6; cloth.rotation.y = Math.PI / 2; flag.add(cloth);
    root.add(flag);
  }
  const beacon = new T.Mesh(new T.OctahedronGeometry(.5), materials.gold);
  beacon.name = "camp-beacon";
  beacon.position.set(0, 4.3, 0);
  root.add(beacon);
  let reveal = 0, wasComplete = false, previousMeals = -1, happy = 0;
  return {
    root,
    update(time: number, dt: number, car: Point, origin: Point, completed: boolean, enabled: boolean, meals = 0, quality = 0) {
      root.position.set(ANIMAL_CAMP.x - origin.x, baseY, ANIMAL_CAMP.z - origin.z);
      root.visible = enabled && Math.hypot(car.x - ANIMAL_CAMP.x, car.z - ANIMAL_CAMP.z) < 320;
      if (previousMeals >= 0 && meals > previousMeals) happy = 5;
      previousMeals = meals; happy = Math.max(0, happy - dt);
      feeding.visible = completed && meals > 0;
      foodMaterial.color.set(FOOD_QUALITIES[quality]?.color || "#dca04a");
      heartMaterial.opacity = Math.min(1, happy);
      if (!completed) reveal = 0;
      else reveal = Math.min(1, reveal + dt * 1.6);
      if (completed !== wasComplete) {
        line.material.color.set(completed ? "#73a476" : "#e3ae39");
        wasComplete = completed;
      }
      beacon.visible = !completed;
      beacon.rotation.y = time * .65;
      beacon.position.y = 4.3 + Math.sin(time * 1.7) * .17;
      for (const { actor, ground, wave, tail, index } of animals) {
        actor.visible = completed;
        actor.scale.setScalar(Math.max(.001, 1 - (1 - reveal) ** 3));
        actor.position.y = ground + Math.sin(reveal * Math.PI) * .6 + Math.max(0, Math.sin(time * 2 + index * 1.5)) * .06;
        actor.rotation.y = Math.PI / 2 + Math.sin(time * .8 + index) * .1;
        actor.rotation.x = happy > 0 ? Math.sin(time * 5 + index) * .1 : 0;
        wave.rotation.z = -.55 + Math.sin(time * 3 + index) * .35;
        if (tail) tail.rotation.y = Math.sin(time * 2.7) * .3;
        hearts[index].visible = completed && happy > 0;
        hearts[index].position.set(actor.position.x, ground + 3.05 + Math.sin(time * 2 + index) * .12, actor.position.z);
      }
    },
    dispose() {
      const geometries = new Set<T.BufferGeometry>(), ownedMaterials = new Set<T.Material>();
      root.traverse(node => {
        if (node instanceof T.Mesh || node instanceof T.Line) {
          geometries.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) ownedMaterials.add(material);
        }
      });
      geometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); root.removeFromParent();
    },
  };
}
