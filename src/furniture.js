import * as THREE from 'three';
import { mat, box, cylinder } from './helpers.js';

// All furniture is built around its own local origin on the floor.
// The caller positions and rotates the returned group.

const metal = () => mat(0x3a3f47, { roughness: 0.5, metalness: 0.6 });

// Desk centred on the origin; the person sits on the +z side facing -z.
export function createDesk() {
  const group = new THREE.Group();
  const wood = mat(0xa9774a);
  const steel = metal();

  group.add(box(1.8, 0.06, 0.9, wood, 0, 0.72, 0)); // top surface at y = 0.75
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.38, 0.38]) {
      group.add(box(0.06, 0.69, 0.06, steel, x, 0.345, z));
    }
  }

  // Drawer unit
  group.add(box(0.42, 0.55, 0.6, mat(0x8e6238), 0.62, 0.4, -0.05));
  group.add(box(0.2, 0.02, 0.02, steel, 0.62, 0.55, 0.26));
  group.add(box(0.2, 0.02, 0.02, steel, 0.62, 0.3, 0.26));

  // Keyboard and mouse
  group.add(box(0.46, 0.02, 0.15, mat(0x23262b), 0, 0.76, 0.28));
  group.add(box(0.06, 0.025, 0.1, mat(0x23262b), 0.38, 0.763, 0.28));

  // Coffee mug and a stack of paper
  group.add(cylinder(0.04, 0.035, 0.09, mat(0xd9523f), -0.55, 0.795, 0.2));
  group.add(box(0.24, 0.03, 0.32, mat(0xf7f5ef), -0.6, 0.765, -0.15));

  return group;
}

// Monitor (placed on a desk) whose screen shows scrolling lines of "code".
export function createMonitor() {
  const group = new THREE.Group();
  const dark = mat(0x1d1f23, { roughness: 0.4 });

  group.add(box(0.26, 0.02, 0.18, dark, 0, 0.76, -0.28));
  group.add(box(0.05, 0.3, 0.04, dark, 0, 0.9, -0.3));
  group.add(box(0.8, 0.48, 0.035, dark, 0, 1.18, -0.27));

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256;
  screenCanvas.height = 144;
  const ctx = screenCanvas.getContext('2d');
  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.42),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.position.set(0, 1.18, -0.25);
  group.add(screen);

  const colors = ['#7ee787', '#79c0ff', '#e6edf3', '#ffa657', '#d2a8ff'];
  const lines = [];
  const newLine = () => ({
    indent: Math.floor(Math.random() * 4) * 12,
    width: 30 + Math.random() * 130,
    color: colors[Math.floor(Math.random() * colors.length)],
  });
  for (let i = 0; i < 11; i++) lines.push(newLine());

  function draw() {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 256, 144);
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, 256, 12);
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color;
      ctx.fillRect(10 + line.indent, 20 + i * 11, line.width, 5);
    });
    texture.needsUpdate = true;
  }
  draw();

  const interval = 0.3 + Math.random() * 0.25; // each screen scrolls at its own pace
  let lastStep = 0;
  function update(time) {
    if (time - lastStep < interval) return;
    lastStep = time;
    lines.shift();
    lines.push(newLine());
    draw();
  }

  return { group, update };
}

// Swivel chair; the backrest is on the +z side, so the sitter faces -z.
export function createChair(color = 0x2f3a4a) {
  const group = new THREE.Group();
  const fabric = mat(color);
  const steel = metal();

  group.add(box(0.5, 0.07, 0.5, fabric, 0, 0.47, 0)); // seat
  group.add(box(0.48, 0.6, 0.06, fabric, 0, 0.82, 0.27)); // backrest
  group.add(box(0.05, 0.2, 0.04, steel, 0, 0.5, 0.29));
  group.add(cylinder(0.03, 0.03, 0.36, steel, 0, 0.26, 0, 12));

  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    pivot.add(box(0.05, 0.04, 0.32, steel, 0, 0.07, 0.16));
    group.add(pivot);
  }

  return group;
}

export function createPlant(scale = 1) {
  const group = new THREE.Group();
  group.add(cylinder(0.2, 0.15, 0.36, mat(0xb5654a), 0, 0.18, 0));
  group.add(cylinder(0.025, 0.025, 0.5, mat(0x5b4530), 0, 0.6, 0, 8));

  const leaf = mat(0x3f8f55, { flatShading: true });
  const blobs = [
    [0, 1.0, 0, 0.3],
    [0.18, 0.82, 0.08, 0.2],
    [-0.16, 0.85, -0.1, 0.22],
    [0.02, 0.8, -0.2, 0.18],
  ];
  for (const [x, y, z, r] of blobs) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  group.scale.setScalar(scale);
  return group;
}

// Bookshelf with its back on the -x side (stand it against a left-hand wall).
export function createBookshelf() {
  const group = new THREE.Group();
  const wood = mat(0x7b5a3c);

  group.add(box(0.35, 1.9, 0.04, wood, 0, 0.95, -0.6));
  group.add(box(0.35, 1.9, 0.04, wood, 0, 0.95, 0.6));
  for (const y of [0.05, 0.5, 0.95, 1.4, 1.88]) {
    group.add(box(0.35, 0.04, 1.2, wood, 0, y, 0));
  }

  const bookColors = [0xc0503a, 0x3e7cb1, 0xe0b040, 0x4f9d69, 0x8a5fb0, 0xd98a3d];
  for (const shelfY of [0.07, 0.52, 0.97, 1.42]) {
    let offset = -0.52;
    let i = 0;
    while (offset < 0.4) {
      const thickness = 0.05 + ((i * 7) % 4) * 0.015;
      const height = 0.26 + ((i * 5) % 3) * 0.04;
      const color = bookColors[(i + Math.round(shelfY * 10)) % bookColors.length];
      group.add(box(0.22, height, thickness, mat(color), 0, shelfY + height / 2, offset + thickness / 2));
      offset += thickness + 0.008;
      i++;
    }
  }

  return group;
}

// Window centred on the origin, facing +z (hang it on the back wall).
export function createWindow(width = 1.6, height = 1.2) {
  const group = new THREE.Group();
  const frame = mat(0xffffff);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x7fbfff, emissiveIntensity: 0.7 }),
  );
  group.add(glass);

  group.add(box(width + 0.1, 0.06, 0.06, frame, 0, height / 2 + 0.03, 0));
  group.add(box(width + 0.1, 0.06, 0.06, frame, 0, -height / 2 - 0.03, 0));
  group.add(box(0.06, height + 0.1, 0.06, frame, -width / 2 - 0.02, 0, 0));
  group.add(box(0.06, height + 0.1, 0.06, frame, width / 2 + 0.02, 0, 0));
  group.add(box(0.04, height, 0.04, frame, 0, 0, 0));
  group.add(box(width, 0.04, 0.04, frame, 0, 0, 0));

  return group;
}

// Wall clock facing +z that shows the real time.
export function createClock() {
  const group = new THREE.Group();

  const rim = cylinder(0.24, 0.24, 0.03, mat(0x2b2f36), 0, 0, 0, 32);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);
  const face = cylinder(0.21, 0.21, 0.032, mat(0xffffff), 0, 0, 0.002, 32);
  face.rotation.x = Math.PI / 2;
  group.add(face);

  const handMaterial = mat(0x1d1f23);
  const makeHand = (length, width) => {
    const pivot = new THREE.Group();
    pivot.position.z = 0.025;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.008), handMaterial);
    hand.position.y = length / 2;
    pivot.add(hand);
    group.add(pivot);
    return pivot;
  };
  const hourHand = makeHand(0.1, 0.02);
  const minuteHand = makeHand(0.16, 0.014);

  function update() {
    const now = new Date();
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    minuteHand.rotation.z = -(minutes / 60) * Math.PI * 2;
    hourHand.rotation.z = -(hours / 12) * Math.PI * 2;
  }
  update();

  return { group, update };
}

// Sofa (or armchair when narrow) facing +z.
export function createSofa(width = 2.2, color = 0x586f8c) {
  const group = new THREE.Group();
  const fabric = mat(color);
  const cushion = mat(new THREE.Color(color).offsetHSL(0, 0, 0.08));

  group.add(box(width, 0.3, 0.85, fabric, 0, 0.3, 0));
  group.add(box(width, 0.6, 0.22, fabric, 0, 0.6, -0.32));
  for (const side of [-1, 1]) {
    group.add(box(0.22, 0.5, 0.85, fabric, side * (width / 2 + 0.11), 0.45, 0));
  }

  const seats = Math.max(1, Math.round(width / 1.1));
  const seatWidth = width / seats;
  for (let i = 0; i < seats; i++) {
    const x = -width / 2 + seatWidth * (i + 0.5);
    group.add(box(seatWidth - 0.05, 0.12, 0.6, cushion, x, 0.5, 0.1));
  }

  return group;
}

// Zone name painted flat on the floor, readable from the front of the office.
export function createFloorLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 54px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(text.toUpperCase(), 256, 50);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 0.5625),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  label.rotation.x = -Math.PI / 2;
  return label;
}
