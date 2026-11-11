import * as THREE from 'three';
import { mat, box, cylinder, floorPatch } from './helpers.js';
import {
  createDesk,
  createMonitor,
  createChair,
  createPlant,
  createBookshelf,
  createWindow,
  createClock,
  createSofa,
  createFloorLabel,
} from './furniture.js';

// Floor plan (seen from above, camera sits at the bottom right):
//
//   x = -8                0                 8
//   z = -6 +--------------+-----------------+
//          | Workstations |  Meeting room   |
//   z =  0 +--------------+-----------------+
//          | Pantry       |  Rest area      |
//   z =  6 +--------------+-----------------+
//
// The back (z = -6) and left (x = -8) sides have walls; the other two are open.

const WIDTH = 16;
const DEPTH = 12;
const WALL_HEIGHT = 3;
const BACK = -DEPTH / 2;
const LEFT = -WIDTH / 2;

// Where each workstation's desk stands. The worker sits 0.8 in front (+z).
export const DESK_POSITIONS = [
  { x: -6.2, z: -4.6 },
  { x: -4.0, z: -4.6 },
  { x: -1.8, z: -4.6 },
];

function place(object, x, y, z, rotationY = 0) {
  object.position.set(x, y, z);
  object.rotation.y = rotationY;
  return object;
}

function label(text, x, z) {
  const mesh = createFloorLabel(text);
  mesh.position.set(x, 0.035, z);
  return mesh;
}

function createShell() {
  const group = new THREE.Group();

  group.add(box(WIDTH, 0.1, DEPTH, mat(0xc9b79c), 0, -0.05, 0)); // floor
  group.add(box(WIDTH, WALL_HEIGHT, 0.1, mat(0xe9e4da), 0, WALL_HEIGHT / 2, BACK)); // back wall
  group.add(box(0.1, WALL_HEIGHT, DEPTH, mat(0xdfd9cd), LEFT, WALL_HEIGHT / 2, 0)); // left wall

  const skirting = mat(0x8c7a63);
  group.add(box(WIDTH, 0.12, 0.04, skirting, 0, 0.06, BACK + 0.07));
  group.add(box(0.04, 0.12, DEPTH, skirting, LEFT + 0.07, 0.06, 0));

  return group;
}

function createWorkstationArea(updaters) {
  const group = new THREE.Group();

  group.add(floorPatch(7.9, 5.9, 0x5b7594, -4, -3)); // carpet

  for (const { x, z } of DESK_POSITIONS) {
    group.add(place(createDesk(), x, 0, z));
    group.add(place(createChair(), x, 0, z + 0.8));
    const monitor = createMonitor();
    group.add(place(monitor.group, x, 0, z));
    updaters.push(monitor.update);
  }

  group.add(place(createWindow(), -6.2, 2.05, BACK + 0.06));
  group.add(place(createWindow(), -1.8, 2.05, BACK + 0.06));

  const clock = createClock();
  group.add(place(clock.group, -4, 2.3, BACK + 0.07));
  updaters.push(clock.update);

  group.add(place(createBookshelf(), LEFT + 0.25, 0, -2.2));
  group.add(place(createPlant(), -7.3, 0, -5.3));
  group.add(label('Workstations', -4, -1.5));

  return group;
}

function createMeetingRoom() {
  const group = new THREE.Group();

  group.add(floorPatch(7.9, 5.9, 0xb08d62, 4, -3)); // wooden floor

  // Glass partitions with a door gap on the workstation side.
  const glass = mat(0xbfe3f5, { transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false });
  const frosted = mat(0xffffff, { transparent: true, opacity: 0.3, depthWrite: false });
  const frame = mat(0x2b2f36);
  const panel = (w, h, d, material, x, y, z) => {
    const mesh = box(w, h, d, material, x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };

  group.add(panel(0.04, 2.6, 4.4, glass, 0.05, 1.3, -3.8));
  group.add(panel(0.04, 2.6, 0.4, glass, 0.05, 1.3, -0.2));
  group.add(panel(7.9, 2.6, 0.04, glass, 4.05, 1.3, 0));
  group.add(panel(7.9, 0.5, 0.045, frosted, 4.05, 1.15, 0));
  group.add(panel(0.045, 0.5, 4.4, frosted, 0.05, 1.15, -3.8));

  group.add(box(0.06, 0.06, 6, frame, 0.05, 2.63, -3));
  group.add(box(8, 0.06, 0.06, frame, 4, 2.63, 0));
  for (const z of [-1.6, -0.4, 0]) group.add(box(0.06, 2.6, 0.06, frame, 0.05, 1.3, z));
  group.add(box(0.06, 2.6, 0.06, frame, 7.97, 1.3, 0));

  // Table and six chairs
  const tableWood = mat(0x7a5536);
  group.add(box(3.2, 0.07, 1.3, tableWood, 4, 0.72, -3));
  for (const x of [2.7, 5.3]) group.add(box(0.1, 0.69, 1.0, tableWood, x, 0.345, -3));
  for (const x of [3, 4, 5]) {
    group.add(place(createChair(0x4a5568), x, 0, -2.05));
    group.add(place(createChair(0x4a5568), x, 0, -3.95, Math.PI));
  }

  // Whiteboard on the back wall
  group.add(box(2.5, 1.3, 0.03, mat(0x9aa3ad), 4, 1.75, BACK + 0.065));
  group.add(box(2.4, 1.2, 0.03, mat(0xffffff, { roughness: 0.4 }), 4, 1.75, BACK + 0.08));
  const scribbles = [
    [3.3, 2.1, 0.7, 0x3e7cb1],
    [3.45, 1.95, 1.0, 0x3e7cb1],
    [3.2, 1.8, 0.5, 0xc0503a],
    [4.6, 1.6, 0.6, 0x4f9d69],
    [4.45, 1.45, 0.9, 0x4f9d69],
  ];
  for (const [x, y, w, color] of scribbles) {
    group.add(box(w, 0.03, 0.01, mat(color), x, y, BACK + 0.1));
  }

  group.add(place(createPlant(), 7.3, 0, -5.3));
  group.add(label('Meeting Room', 4, -0.8));

  return group;
}

function createPantry() {
  const group = new THREE.Group();

  group.add(floorPatch(7.9, 5.9, 0xdedad2, -4, 3)); // tiles

  // Counter along the left wall, with cabinets above
  const cabinet = mat(0x6f8f86);
  const steel = mat(0x3a3f47, { roughness: 0.5, metalness: 0.6 });
  group.add(box(0.6, 0.9, 3.6, cabinet, -7.68, 0.45, 3));
  group.add(box(0.66, 0.05, 3.7, mat(0x3b3f45, { roughness: 0.4 }), -7.66, 0.925, 3));
  group.add(box(0.35, 0.6, 3.6, mat(0xf2efe9), -7.8, 2.0, 3));
  for (let i = 1; i < 4; i++) {
    group.add(box(0.01, 0.8, 0.02, mat(0x4f6a63), -7.375, 0.45, 1.2 + i * 0.9));
    group.add(box(0.01, 0.56, 0.02, mat(0xcfcac0), -7.62, 2.0, 1.2 + i * 0.9));
  }

  // Coffee machine, mugs, microwave, sink
  group.add(box(0.3, 0.4, 0.28, mat(0x23262b, { roughness: 0.4 }), -7.7, 1.15, 2.0));
  group.add(box(0.12, 0.03, 0.16, steel, -7.56, 1.0, 2.0));
  [0xd9523f, 0xf7f5ef, 0x3e7cb1].forEach((color, i) => {
    group.add(cylinder(0.04, 0.035, 0.09, mat(color), -7.6, 0.995, 1.45 + i * 0.12));
  });
  group.add(box(0.36, 0.28, 0.5, mat(0xe3e6ea), -7.72, 1.09, 2.9));
  group.add(box(0.01, 0.2, 0.34, mat(0x23262b), -7.535, 1.09, 2.85));
  group.add(box(0.4, 0.02, 0.55, steel, -7.65, 0.955, 4.0));
  group.add(cylinder(0.015, 0.015, 0.25, steel, -7.86, 1.07, 4.0, 8));
  group.add(box(0.16, 0.02, 0.02, steel, -7.79, 1.19, 4.0));

  // Fridge
  const fridge = mat(0xd8dde2, { roughness: 0.4 });
  group.add(box(0.75, 1.9, 0.7, fridge, -7.58, 0.95, 5.3));
  group.add(box(0.01, 0.02, 0.7, steel, -7.2, 1.25, 5.3));
  group.add(box(0.03, 0.35, 0.03, steel, -7.19, 1.55, 5.05));
  group.add(box(0.03, 0.35, 0.03, steel, -7.19, 0.95, 5.05));

  // Water dispenser
  group.add(box(0.34, 1.0, 0.34, mat(0xf2f2f2), -7.7, 0.5, 0.75));
  group.add(
    cylinder(0.13, 0.13, 0.36, mat(0x6fb7e8, { transparent: true, opacity: 0.7 }), -7.7, 1.18, 0.75),
  );

  // High table with three stools
  const tableX = -4;
  const tableZ = 3;
  group.add(cylinder(0.55, 0.55, 0.05, mat(0xf2efe9), tableX, 1.05, tableZ, 32));
  group.add(cylinder(0.04, 0.04, 1.0, steel, tableX, 0.53, tableZ, 12));
  group.add(cylinder(0.3, 0.3, 0.04, steel, tableX, 0.02, tableZ, 24));
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 2; // people stand in the gaps (see routes.js)
    const x = tableX + Math.cos(angle) * 0.95;
    const z = tableZ + Math.sin(angle) * 0.95;
    group.add(cylinder(0.17, 0.17, 0.05, mat(0xe0a030), x, 0.72, z, 20));
    group.add(cylinder(0.025, 0.025, 0.7, steel, x, 0.36, z, 8));
    group.add(cylinder(0.18, 0.18, 0.03, steel, x, 0.015, z, 20));
  }
  group.add(cylinder(0.04, 0.035, 0.09, mat(0xd9523f), tableX + 0.2, 1.12, tableZ - 0.1));

  // Planter that separates the pantry from the workstations
  group.add(box(4, 0.5, 0.35, mat(0x8c7a63), -5.4, 0.25, 0));
  const leaf = mat(0x3f8f55, { flatShading: true });
  for (let i = 0; i < 8; i++) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24 + (i % 3) * 0.03, 0), leaf);
    bush.position.set(-7.15 + i * 0.5, 0.62, 0);
    bush.rotation.y = i;
    bush.castShadow = true;
    group.add(bush);
  }

  group.add(label('Pantry', -4, 5.3));

  return group;
}

function createRestArea() {
  const group = new THREE.Group();

  group.add(floorPatch(5.2, 3.8, 0xc9805a, 4, 2.9, 0.012)); // rug

  group.add(place(createSofa(2.2, 0x586f8c), 4, 0, 1.0));
  group.add(place(createSofa(1.0, 0x7a8f5a), 6.7, 0, 2.9, -Math.PI / 2));

  // Coffee table
  const wood = mat(0xa9774a);
  group.add(box(1.2, 0.05, 0.6, wood, 4, 0.4, 2.6));
  for (const x of [3.47, 4.53]) {
    for (const z of [2.37, 2.83]) group.add(box(0.05, 0.38, 0.05, wood, x, 0.19, z));
  }
  group.add(box(0.26, 0.03, 0.2, mat(0x3e7cb1), 3.8, 0.44, 2.6));
  group.add(cylinder(0.04, 0.035, 0.09, mat(0xf7f5ef), 4.3, 0.47, 2.7));

  // Bean bags
  const beanBags = [
    [1.9, 3.2, 0xe0a030],
    [2.7, 4.3, 0xc0503a],
    [5.5, 4.3, 0x3f9a96],
  ];
  for (const [x, z, color] of beanBags) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mat(color));
    bag.scale.y = 0.65;
    bag.position.set(x, 0.29, z);
    bag.castShadow = true;
    bag.receiveShadow = true;
    group.add(bag);
  }

  // Floor lamp
  group.add(cylinder(0.16, 0.16, 0.03, mat(0x2b2f36), 2.2, 0.015, 0.9));
  group.add(cylinder(0.02, 0.02, 1.5, mat(0x2b2f36), 2.2, 0.75, 0.9, 8));
  group.add(
    cylinder(0.12, 0.22, 0.28, mat(0xfff0cf, { emissive: 0xffd9a0, emissiveIntensity: 0.8 }), 2.2, 1.6, 0.9),
  );
  const lampLight = new THREE.PointLight(0xffd9a0, 4, 6);
  lampLight.position.set(2.2, 1.4, 1.2);
  group.add(lampLight);

  group.add(place(createPlant(1.15), 7.3, 0, 0.9));
  group.add(place(createPlant(0.9), 0.8, 0, 5.3));
  group.add(label('Rest Area', 4, 5.4));

  return group;
}

export function createOffice() {
  const group = new THREE.Group();
  const updaters = [];

  group.add(
    createShell(),
    createWorkstationArea(updaters),
    createMeetingRoom(),
    createPantry(),
    createRestArea(),
  );

  function update(time) {
    for (const fn of updaters) fn(time);
  }

  return { group, update };
}
