import * as THREE from 'three';

const ROOM = 8; // floor is ROOM x ROOM, centred on the origin
const WALL_HEIGHT = 3;

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(rTop, rBottom, h, material, x = 0, y = 0, z = 0, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoom() {
  const group = new THREE.Group();

  group.add(box(ROOM, 0.1, ROOM, mat(0xc9b79c), 0, -0.05, 0)); // floor
  group.add(box(ROOM, WALL_HEIGHT, 0.1, mat(0xe9e4da), 0, WALL_HEIGHT / 2, -ROOM / 2)); // back wall
  group.add(box(0.1, WALL_HEIGHT, ROOM, mat(0xdfd9cd), -ROOM / 2, WALL_HEIGHT / 2, 0)); // left wall

  // Skirting boards
  const skirting = mat(0x8c7a63);
  group.add(box(ROOM, 0.12, 0.04, skirting, 0, 0.06, -ROOM / 2 + 0.07));
  group.add(box(0.04, 0.12, ROOM, skirting, -ROOM / 2 + 0.07, 0.06, 0));

  // Rug under the desk
  const rug = box(3.4, 0.02, 2.6, mat(0x4f6d8f), 0, 0.01, -1.9);
  rug.castShadow = false;
  group.add(rug);

  return group;
}

function createWindow() {
  const group = new THREE.Group();
  const frame = mat(0xffffff);
  const z = -ROOM / 2 + 0.06;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x7fbfff, emissiveIntensity: 0.7 }),
  );
  glass.position.set(2.2, 1.75, z);
  group.add(glass);

  group.add(box(1.9, 0.06, 0.06, frame, 2.2, 2.38, z));
  group.add(box(1.9, 0.06, 0.06, frame, 2.2, 1.12, z));
  group.add(box(0.06, 1.3, 0.06, frame, 1.28, 1.75, z));
  group.add(box(0.06, 1.3, 0.06, frame, 3.12, 1.75, z));
  group.add(box(0.04, 1.2, 0.04, frame, 2.2, 1.75, z));
  group.add(box(1.8, 0.04, 0.04, frame, 2.2, 1.75, z));

  return group;
}

function createDesk() {
  const group = new THREE.Group();
  const wood = mat(0xa9774a);
  const metal = mat(0x3a3f47, { roughness: 0.5, metalness: 0.6 });

  group.add(box(1.8, 0.06, 0.9, wood, 0, 0.72, -2.4)); // top surface at y = 0.75
  for (const x of [-0.82, 0.82]) {
    for (const z of [-2.78, -2.02]) {
      group.add(box(0.06, 0.69, 0.06, metal, x, 0.345, z));
    }
  }

  // Drawer unit
  group.add(box(0.42, 0.55, 0.6, mat(0x8e6238), 0.62, 0.4, -2.45));
  group.add(box(0.2, 0.02, 0.02, metal, 0.62, 0.55, -2.14));
  group.add(box(0.2, 0.02, 0.02, metal, 0.62, 0.3, -2.14));

  // Keyboard and mouse
  group.add(box(0.46, 0.02, 0.15, mat(0x23262b), 0, 0.76, -2.12));
  group.add(box(0.06, 0.025, 0.1, mat(0x23262b), 0.38, 0.763, -2.12));

  // Coffee mug
  group.add(cylinder(0.04, 0.035, 0.09, mat(0xd9523f), -0.55, 0.795, -2.2));

  // Stack of paper
  group.add(box(0.24, 0.03, 0.32, mat(0xf7f5ef), -0.6, 0.765, -2.55));

  return group;
}

// Monitor whose screen shows scrolling lines of "code".
function createMonitor() {
  const group = new THREE.Group();
  const dark = mat(0x1d1f23, { roughness: 0.4 });

  group.add(box(0.26, 0.02, 0.18, dark, 0, 0.76, -2.68));
  group.add(box(0.05, 0.3, 0.04, dark, 0, 0.9, -2.7));
  group.add(box(0.8, 0.48, 0.035, dark, 0, 1.18, -2.67));

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
  screen.position.set(0, 1.18, -2.65);
  group.add(screen);

  const glow = new THREE.PointLight(0x8fc7ff, 0.6, 3);
  glow.position.set(0, 1.2, -2.3);
  group.add(glow);

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

  let lastStep = 0;
  function update(time) {
    if (time - lastStep < 0.35) return;
    lastStep = time;
    lines.shift();
    lines.push(newLine());
    draw();
  }

  return { group, update };
}

function createBookshelf() {
  const group = new THREE.Group();
  const wood = mat(0x7b5a3c);
  const x = -ROOM / 2 + 0.25;
  const z = 0.4;

  group.add(box(0.35, 1.9, 0.04, wood, x, 0.95, z - 0.6));
  group.add(box(0.35, 1.9, 0.04, wood, x, 0.95, z + 0.6));
  for (const y of [0.05, 0.5, 0.95, 1.4, 1.88]) {
    group.add(box(0.35, 0.04, 1.2, wood, x, y, z));
  }

  const bookColors = [0xc0503a, 0x3e7cb1, 0xe0b040, 0x4f9d69, 0x8a5fb0, 0xd98a3d];
  for (const shelfY of [0.07, 0.52, 0.97, 1.42]) {
    let offset = -0.52;
    let i = 0;
    while (offset < 0.4) {
      const thickness = 0.05 + ((i * 7) % 4) * 0.015;
      const height = 0.26 + ((i * 5) % 3) * 0.04;
      const color = bookColors[(i + Math.round(shelfY * 10)) % bookColors.length];
      group.add(box(0.22, height, thickness, mat(color), x, shelfY + height / 2, z + offset + thickness / 2));
      offset += thickness + 0.008;
      i++;
    }
  }

  return group;
}

function createPlant() {
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

  group.position.set(-3.3, 0, -3.3);
  return group;
}

// Wall clock that shows the real time.
function createClock() {
  const group = new THREE.Group();
  group.position.set(-1.8, 2.2, -ROOM / 2 + 0.07);

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

export function createOffice() {
  const group = new THREE.Group();
  const monitor = createMonitor();
  const clock = createClock();

  group.add(
    createRoom(),
    createWindow(),
    createDesk(),
    monitor.group,
    createBookshelf(),
    createPlant(),
    clock.group,
  );

  function update(time) {
    monitor.update(time);
    clock.update();
  }

  return { group, update };
}
