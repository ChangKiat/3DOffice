import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOffice } from './office.js';
import { createPerson } from './person.js';
import { createSpots, findPath, WORK_DESKS, BOSS_SEAT, RECEPTION_SEAT } from './routes.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2330);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
camera.position.set(14.5, 12.5, 17);

const controls = new OrbitControls(camera, canvas);
controls.target.set(3, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the floor
controls.update();

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.1));

const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(11, 14, 10);
sun.target.position.set(3, 0, 0);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -17;
sun.shadow.camera.right = 17;
sun.shadow.camera.top = 17;
sun.shadow.camera.bottom = -17;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 45;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Scene contents
const office = createOffice();
scene.add(office.group);

// The team. `firstBreak` staggers when each person first gets up, in seconds.
const team = [
  { name: 'Rong Zhao', desk: WORK_DESKS[0], shirt: 0x3f7fd1, hair: 0x1d1a18, skin: 0xe8b796, firstBreak: 3 },
  { name: 'Amir', desk: WORK_DESKS[1], shirt: 0xd98a3d, hair: 0x1d1a18, skin: 0xc68e6a, firstBreak: 14 },
  { name: 'Chee Chong', desk: WORK_DESKS[2], shirt: 0x4f9d69, hair: 0x3a2a1e, skin: 0xd9a47c, firstBreak: 9 },
  {
    name: 'Chang Kiat',
    boss: true,
    desk: BOSS_SEAT,
    shirt: 0x2b2f36,
    tie: 0xc0392b,
    hair: 0x1d1a18,
    skin: 0xe2ad88,
    firstBreak: 6,
  },
  {
    name: 'Tracy',
    desk: RECEPTION_SEAT,
    shirt: 0x8a5fb0,
    hair: 0x3a2a1e,
    skin: 0xf0c8a8,
    firstBreak: 22,
    workTime: [18, 30], // reception is left empty less often
  },
];

const spots = createSpots();
const people = team.map((member) => {
  const person = createPerson({ ...member, spots, findPath });
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
