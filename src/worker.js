import * as THREE from 'three';

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createChair() {
  const group = new THREE.Group();
  const fabric = mat(0x2f3a4a);
  const metal = mat(0x3a3f47, { roughness: 0.5, metalness: 0.6 });

  group.add(box(0.5, 0.07, 0.5, fabric, 0, 0.47, 0)); // seat
  group.add(box(0.48, 0.6, 0.06, fabric, 0, 0.82, 0.27)); // backrest
  group.add(box(0.05, 0.2, 0.04, metal, 0, 0.5, 0.29));

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 12), metal);
  pole.position.y = 0.26;
  pole.castShadow = true;
  group.add(pole);

  for (let i = 0; i < 5; i++) {
    const leg = box(0.05, 0.04, 0.32, metal, 0, 0.07, 0.16);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    pivot.add(leg);
    group.add(pivot);
  }

  return group;
}

// One arm: shoulder pivot -> upper arm -> elbow pivot -> forearm + hand.
function createArm(side, shirt, skin) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.27, 1.02, 0);
  shoulder.rotation.x = 0.35; // upper arm tilts forward
  shoulder.add(box(0.1, 0.26, 0.1, shirt, 0, -0.13, 0));

  const elbow = new THREE.Group();
  elbow.position.set(0, -0.26, 0);
  shoulder.add(elbow);
  elbow.add(box(0.085, 0.085, 0.3, shirt, 0, 0, -0.15));
  elbow.add(box(0.08, 0.05, 0.1, skin, 0, 0, -0.34)); // hand

  return { shoulder, elbow };
}

export function createWorker() {
  const group = new THREE.Group();
  group.position.set(0, 0, -1.6); // seated in front of the desk, facing the monitor (-z)

  const skin = mat(0xe8b796);
  const shirt = mat(0x3f7fd1);
  const trousers = mat(0x2c3340);
  const hair = mat(0x3a2a1e);
  const shoe = mat(0x1d1f23);

  group.add(createChair());

  // Everything above the hips leans and breathes together.
  const upperBody = new THREE.Group();
  group.add(upperBody);

  upperBody.add(box(0.42, 0.55, 0.24, shirt, 0, 0.79, 0)); // torso
  upperBody.add(box(0.1, 0.08, 0.1, skin, 0, 1.1, 0)); // neck

  const head = new THREE.Group();
  head.position.set(0, 1.27, 0);
  upperBody.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 18), skin);
  skull.castShadow = true;
  head.add(skull);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  hairCap.rotation.x = 0.35; // sits further down the back of the head
  hairCap.castShadow = true;
  head.add(hairCap);

  const eyeMaterial = mat(0x1d1f23);
  for (const x of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMaterial);
    eye.position.set(x, 0.01, -0.15);
    head.add(eye);
  }

  const leftArm = createArm(-1, shirt, skin);
  const rightArm = createArm(1, shirt, skin);
  upperBody.add(leftArm.shoulder, rightArm.shoulder);

  // Legs (seated)
  for (const x of [-0.11, 0.11]) {
    group.add(box(0.16, 0.14, 0.46, trousers, x, 0.57, -0.2)); // thigh
    group.add(box(0.13, 0.46, 0.13, trousers, x, 0.3, -0.39)); // shin
    group.add(box(0.13, 0.07, 0.24, shoe, x, 0.035, -0.44));
  }

  function update(time) {
    // Typing: the two forearms tap out of phase, in short bursts with pauses.
    const burst = Math.sin(time * 0.7) > -0.6 ? 1 : 0.15;
    leftArm.elbow.rotation.x = -0.3 + Math.sin(time * 14) * 0.07 * burst;
    rightArm.elbow.rotation.x = -0.3 + Math.sin(time * 14 + 2.1) * 0.07 * burst;
    leftArm.shoulder.rotation.z = Math.sin(time * 3.1) * 0.03;
    rightArm.shoulder.rotation.z = -Math.sin(time * 2.7) * 0.03;

    // Head: small nod while reading, occasional glance to the side.
    head.rotation.x = Math.sin(time * 0.9) * 0.05;
    head.rotation.y = Math.sin(time * 0.35) * 0.18;

    // Breathing and a slight lean.
    upperBody.scale.y = 1 + Math.sin(time * 1.6) * 0.006;
    upperBody.rotation.x = -0.04 + Math.sin(time * 0.5) * 0.015;
  }

  return { group, update };
}
