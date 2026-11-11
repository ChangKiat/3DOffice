import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOffice, DESK_POSITIONS } from './office.js';
import { createPerson } from './person.js';
import { createSpots, deskRoute } from './routes.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2330);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
camera.position.set(9.5, 10.5, 14);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the floor
controls.update();

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.1));

const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(8, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 45;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Scene contents
const office = createOffice();
scene.add(office.group);

// The team, one per desk from left to right. `firstBreak` staggers when each
// person first gets up, in seconds.
const team = [
  { name: 'Rong Zhao', shirt: 0x3f7fd1, hair: 0x1d1a18, skin: 0xe8b796, firstBreak: 3 },
  { name: 'Chang Kiat', boss: true, shirt: 0x2b2f36, tie: 0xc0392b, hair: 0x1d1a18, skin: 0xe2ad88, firstBreak: 16 },
  { name: 'Chee Chong', shirt: 0x4f9d69, hair: 0x3a2a1e, skin: 0xd9a47c, firstBreak: 9 },
];

const spots = createSpots();
const people = team.map((member, i) => {
  const person = createPerson({ ...member, desk: deskRoute(DESK_POSITIONS[i]), spots });
  scene.add(person.group);
  return person;
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // avoid big jumps after the tab was hidden
  office.update(clock.elapsedTime);
  for (const person of people) person.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
