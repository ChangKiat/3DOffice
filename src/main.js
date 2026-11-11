import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOffice } from './office.js';
import { createWorker } from './worker.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2330);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4.6, 3.6, 3.4);

const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.2, 0.9, -1.9);
controls.enableDamping = true;
controls.minDistance = 2.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the floor
controls.update();

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.1));

const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(5, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7;
sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7;
sun.shadow.camera.bottom = -7;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 25;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Scene contents
const office = createOffice();
scene.add(office.group);

const worker = createWorker();
scene.add(worker.group);

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
  const time = clock.getElapsedTime();
  office.update(time);
  worker.update(time);
  controls.update();
  renderer.render(scene, camera);
});
