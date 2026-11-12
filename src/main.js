import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOffice } from './office.js';
import { createPerson } from './person.js';
import { createBoxBody } from './bodyBox.js';
import { createModelBody } from './bodyModel.js';
import { loadCharacterAssets } from './models.js';
import { setupChat } from './chat.js';
import {
  createSpots,
  findPath,
  nodePoint,
  WORK_DESKS,
  BOSS_SEAT,
  RECEPTION_SEAT,
  MEETING_CHAIRS,
} from './routes.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

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
// `meetingChair` is where the person sits when a meeting is called.
// `model` and `tint` are used with the character models in public/models; the
// colours after them are for the box figures shown when the models are missing.
const team = [
  {
    name: 'Rong Zhao',
    meetingChair: MEETING_CHAIRS.near[0],
    desk: WORK_DESKS[0],
    model: 'worker',
    tint: [0.7, 1.3, 3.2],
    shirt: 0x3f7fd1,
    hair: 0x1d1a18,
    skin: 0xe8b796,
    firstBreak: 3,
  },
  {
    name: 'Azmir',
    meetingChair: MEETING_CHAIRS.near[1],
    desk: WORK_DESKS[1],
    model: 'worker',
    tint: [3.2, 1.6, 0.6],
    shirt: 0xd98a3d,
    hair: 0x1d1a18,
    skin: 0xc68e6a,
    firstBreak: 14,
  },
  {
    name: 'Chee Chong',
    meetingChair: MEETING_CHAIRS.near[2],
    desk: WORK_DESKS[2],
    model: 'worker',
    tint: [0.8, 2.6, 1.2],
    shirt: 0x4f9d69,
    hair: 0x3a2a1e,
    skin: 0xd9a47c,
    firstBreak: 9,
  },
  {
    name: 'Chang Kiat',
    meetingChair: MEETING_CHAIRS.far[1],
    boss: true,
    desk: BOSS_SEAT,
    model: 'boss',
    shirt: 0x2b2f36,
    tie: 0xc0392b,
    hair: 0x1d1a18,
    skin: 0xe2ad88,
    firstBreak: 6,
  },
  {
    name: 'Tracy',
    meetingChair: MEETING_CHAIRS.far[2],
    desk: RECEPTION_SEAT,
    model: 'receptionist',
    shirt: 0xd9609a,
    hair: 0x3a2a1e,
    longHair: true,
    skin: 0xf0c8a8,
    firstBreak: 22,
    workTime: [18, 30], // reception is left empty less often
  },
];

const spots = createSpots();
const people = [];
if (import.meta.env.DEV) window.office = { people };

// The office shows straight away; people appear once their models have loaded.
loadCharacterAssets()
  .catch((error) => {
    console.warn('Character models could not be loaded; using box figures instead.', error);
    return null;
  })
  .then((assets) => {
    for (const member of team) {
      const body = assets
        ? createModelBody(assets, member.model, { tint: member.tint })
        : createBoxBody(member);
      const person = createPerson({ ...member, body, spots, graph: { findPath, nodePoint } });
      person.meetingChair = member.meetingChair;
      scene.add(person.group);
      people.push(person);
    }
    meetingButton.disabled = false;
  });

// "Call meeting" sends everyone to the meeting room; pressing it again sends them back.
const meetingButton = document.getElementById('meeting');
let meetingOn = false;
meetingButton.addEventListener('click', () => {
  meetingOn = !meetingOn;
  for (const person of people) {
    if (meetingOn) person.callMeeting(person.meetingChair);
    else person.endMeeting();
  }
  meetingButton.textContent = meetingOn ? 'End meeting' : 'Call meeting';
  meetingButton.classList.toggle('active', meetingOn);
});

setupChat({
  getActivity: (name) => people.find((person) => person.name === name)?.activity() ?? 'at work in the office',
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
