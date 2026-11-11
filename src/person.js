import * as THREE from 'three';
import { mat, box, cylinder } from './helpers.js';

const STAND_Y = 0.97; // hip height when standing
const SIT_Y = 0.57; // hip height on an office chair
const WALK_SPEED = 1.3; // units per second
const SLIDE_TIME = 0.6; // seconds to move between a seat and the spot next to it

const HALF_PI = Math.PI / 2;

function createNameTag(name, isBoss) {
  const label = isBoss ? `${name} (Boss)` : name;
  const font = '600 40px system-ui, "Segoe UI", sans-serif';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(label).width) + 48;
  canvas.height = 72;

  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = isBoss ? 'rgba(60, 42, 8, 0.85)' : 'rgba(15, 20, 30, 0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 36);
  ctx.fill();
  ctx.fillStyle = isBoss ? '#ffd257' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  const height = 0.26;
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
  sprite.renderOrder = 10; // always drawn on top so names stay readable
  return sprite;
}

// Shoulder pivot -> upper arm -> elbow pivot -> forearm + hand.
// With the elbow at 0 the forearm points forward; at -PI/2 the arm hangs straight.
function createArm(side, shirt, skin) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.27, 0.45, 0);
  shoulder.add(box(0.1, 0.26, 0.1, shirt, 0, -0.13, 0));

  const elbow = new THREE.Group();
  elbow.position.set(0, -0.26, 0);
  shoulder.add(elbow);
  elbow.add(box(0.085, 0.085, 0.3, shirt, 0, 0, -0.15));
  elbow.add(box(0.08, 0.05, 0.1, skin, 0, 0, -0.34)); // hand

  return { shoulder, elbow };
}

// Hip pivot -> thigh -> knee pivot -> shin + shoe.
function createLeg(side, trousers, shoe) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.11, 0, 0);
  hip.add(box(0.16, 0.46, 0.16, trousers, 0, -0.23, 0));

  const knee = new THREE.Group();
  knee.position.set(0, -0.46, 0);
  hip.add(knee);
  knee.add(box(0.13, 0.44, 0.13, trousers, 0, -0.22, 0));
  knee.add(box(0.13, 0.07, 0.24, shoe, 0, -0.455, -0.05));

  return { hip, knee };
}

function standingPose() {
  return {
    pelvisY: STAND_Y,
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shL: 0.05, shR: 0.05, elL: -1.45, elR: -1.45,
    elInR: 0, // right forearm swings in towards the face
    lean: 0, headX: 0, headY: 0,
  };
}

function seatedPose(lift = 0) {
  return {
    ...standingPose(),
    pelvisY: SIT_Y + lift,
    hipL: HALF_PI, hipR: HALF_PI, kneeL: -HALF_PI, kneeR: -HALF_PI,
  };
}

// The pose a person is aiming for right now. `t` is their own running clock.
function targetPose(state, t) {
  if (state.walking) {
    const p = state.walkPhase;
    return {
      ...standingPose(),
      pelvisY: STAND_Y - 0.01 + Math.abs(Math.cos(p)) * 0.02,
      hipL: Math.sin(p) * 0.55,
      hipR: -Math.sin(p) * 0.55,
      kneeL: -Math.max(0, Math.sin(p - 1)) * 0.8,
      kneeR: -Math.max(0, Math.sin(p - 1 + Math.PI)) * 0.8,
      shL: -Math.sin(p) * 0.45,
      shR: Math.sin(p) * 0.45,
      elL: -1.25, elR: -1.25,
      lean: -0.05,
    };
  }

  const pose = state.seated ? seatedPose(state.lift) : standingPose();

  switch (state.action) {
    case 'work': {
      // Typing in short bursts with pauses, glancing around now and then.
      const burst = Math.sin(t * 0.7) > -0.6 ? 1 : 0.15;
      pose.shL = pose.shR = 0.35;
      pose.elL = -0.3 + Math.sin(t * 14) * 0.1 * burst;
      pose.elR = -0.3 + Math.sin(t * 14 + 2.1) * 0.1 * burst;
      pose.headX = Math.sin(t * 0.9) * 0.05;
      pose.headY = Math.sin(t * 0.35) * 0.18;
      pose.lean = -0.04 + Math.sin(t * 0.5) * 0.015;
      break;
    }
    case 'rest': {
      // Leaning back with hands on the lap.
      pose.shL = pose.shR = 0.3;
      pose.elL = pose.elR = -1.1;
      pose.lean = 0.14;
      pose.headY = Math.sin(t * 0.4) * 0.3;
      break;
    }
    case 'eat':
    case 'drink': {
      // Right hand goes up to the mouth and back down.
      const k = 0.5 + 0.5 * Math.sin(t * (state.action === 'eat' ? 1.8 : 1.0));
      pose.shR = 0.6;
      pose.elR = -0.45 + 1.42 * k;
      pose.elInR = 0.6 * k;
      pose.headX = -0.12 * k;
      if (state.action === 'eat') {
        pose.shL = 0.5; // left hand rests on the table
        pose.elL = -0.5;
      }
      break;
    }
    case 'think': {
      // Hand on chin, looking across the whiteboard.
      pose.shR = 0.6;
      pose.elR = 0.9;
      pose.elInR = 0.6;
      pose.headY = Math.sin(t * 0.5) * 0.25;
      break;
    }
    default:
      break;
  }

  return pose;
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);

// A person who works at `desk`, takes breaks at one of the shared `spots`,
// then walks back. See routes.js for the shape of `desk` and `spots`.
export function createPerson({
  name,
  boss = false,
  shirt: shirtColor = 0x3f7fd1,
  hair: hairColor = 0x3a2a1e,
  skin: skinColor = 0xe8b796,
  tie: tieColor = null,
  desk,
  spots,
  firstBreak = 5,
}) {
  const group = new THREE.Group();
  group.position.set(desk.seat[0], 0, desk.seat[1]);

  const skin = mat(skinColor);
  const shirt = mat(shirtColor);
  const trousers = mat(0x2c3340);
  const hair = mat(hairColor);
  const shoe = mat(0x1d1f23);

  // Everything hangs off the pelvis, which moves up and down between sitting and standing.
  const pelvis = new THREE.Group();
  group.add(pelvis);

  const upperBody = new THREE.Group();
  pelvis.add(upperBody);
  upperBody.add(box(0.42, 0.55, 0.24, shirt, 0, 0.22, 0)); // torso
  upperBody.add(box(0.1, 0.08, 0.1, skin, 0, 0.53, 0)); // neck
  if (tieColor !== null) upperBody.add(box(0.06, 0.34, 0.01, mat(tieColor), 0, 0.3, -0.125));

  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
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

  const leftLeg = createLeg(-1, trousers, shoe);
  const rightLeg = createLeg(1, trousers, shoe);
  pelvis.add(leftLeg.hip, rightLeg.hip);

  // Things held in the right hand while eating or drinking.
  const food = box(0.1, 0.05, 0.1, mat(0xe2b565), 0, 0.05, -0.36);
  const mug = cylinder(0.04, 0.035, 0.09, mat(0xf7f5ef), 0, 0.07, -0.36);
  food.visible = false;
  mug.visible = false;
  rightArm.elbow.add(food, mug);

  const nameTag = createNameTag(name, boss);
  nameTag.position.y = 1.08;
  pelvis.add(nameTag);

  // --- Behaviour -----------------------------------------------------------
  // The person works through a queue of steps:
  //   { walk, x, z }                      walk to a point
  //   { slide, x, z, face, sit, lift }    get into or out of a seat
  //   { act, action, face, sit, lift, left, onDone }  stay put for `left` seconds

  const queue = [];
  const state = { walking: false, seated: true, lift: 0, action: 'work', walkPhase: 0 };
  let yaw = 0;
  let targetYaw = 0;
  let pose = targetPose(state, 0);
  let clock = Math.random() * 10;

  const workStep = (seconds) => ({ act: true, action: 'work', face: 0, sit: true, lift: 0, left: seconds });
  queue.push(workStep(firstBreak));

  function planBreak() {
    const free = spots.filter((spot) => !spot.busy);
    if (free.length === 0) {
      queue.push(workStep(between(4, 8)));
      return;
    }
    const spot = pick(free);
    spot.busy = true;

    const route = [desk.side, desk.aisle, ...spot.path];
    const last = route[route.length - 1];
    const sit = Boolean(spot.seat);
    const lift = spot.lift ?? 0;

    // There
    queue.push({ slide: true, x: desk.side[0], z: desk.side[1], face: 0, sit: false });
    for (const [x, z] of route.slice(1)) queue.push({ walk: true, x, z });
    if (sit) queue.push({ slide: true, x: spot.seat[0], z: spot.seat[1], face: spot.face, sit: true, lift });
    queue.push({
      act: true,
      action: spot.action,
      face: spot.face,
      sit,
      lift,
      left: between(7, 11),
      onDone: () => {
        spot.busy = false;
      },
    });

    // And back
    if (sit) queue.push({ slide: true, x: last[0], z: last[1], face: spot.face, sit: false });
    for (const [x, z] of route.slice(0, -1).reverse()) queue.push({ walk: true, x, z });
    queue.push({ slide: true, x: desk.seat[0], z: desk.seat[1], face: 0, sit: true, lift: 0 });
    queue.push(workStep(between(10, 20)));
  }

  function advance(dt) {
    if (queue.length === 0) planBreak();
    const step = queue[0];
    const pos = group.position;

    state.walking = false;

    if (step.walk) {
      const dx = step.x - pos.x;
      const dz = step.z - pos.z;
      const distance = Math.hypot(dx, dz);
      const travel = WALK_SPEED * dt;
      state.seated = false;
      state.action = 'walk';
      if (distance <= travel) {
        pos.x = step.x;
        pos.z = step.z;
        queue.shift();
      } else {
        pos.x += (dx / distance) * travel;
        pos.z += (dz / distance) * travel;
        targetYaw = Math.atan2(-dx, -dz);
        state.walkPhase += travel * 5.5;
      }
      state.walking = true;
    } else if (step.slide) {
      if (step.progress === undefined) {
        step.progress = 0;
        step.fromX = pos.x;
        step.fromZ = pos.z;
      }
      step.progress = Math.min(1, step.progress + dt / SLIDE_TIME);
      const k = step.progress * step.progress * (3 - 2 * step.progress);
      pos.x = step.fromX + (step.x - step.fromX) * k;
      pos.z = step.fromZ + (step.z - step.fromZ) * k;
      targetYaw = step.face;
      state.seated = step.sit;
      state.lift = step.lift ?? 0;
      state.action = 'idle';
      if (step.progress >= 1) queue.shift();
    } else {
      targetYaw = step.face;
      state.seated = step.sit;
      state.lift = step.lift ?? 0;
      state.action = step.action;
      step.left -= dt;
      if (step.left <= 0) {
        step.onDone?.();
        queue.shift();
      }
    }
  }

  function update(dt) {
    clock += dt;
    advance(dt);

    // Turn towards where we're heading.
    yaw += wrapAngle(targetYaw - yaw) * Math.min(1, dt * 8);
    group.rotation.y = yaw;

    // Ease every joint towards the target pose.
    const target = targetPose(state, clock);
    const ease = Math.min(1, dt * 12);
    for (const key in target) pose[key] += (target[key] - pose[key]) * ease;

    pelvis.position.y = pose.pelvisY;
    leftLeg.hip.rotation.x = pose.hipL;
    rightLeg.hip.rotation.x = pose.hipR;
    leftLeg.knee.rotation.x = pose.kneeL;
    rightLeg.knee.rotation.x = pose.kneeR;
    leftArm.shoulder.rotation.x = pose.shL;
    rightArm.shoulder.rotation.x = pose.shR;
    leftArm.elbow.rotation.x = pose.elL;
    rightArm.elbow.rotation.x = pose.elR;
    rightArm.elbow.rotation.y = pose.elInR;
    upperBody.rotation.x = pose.lean;
    upperBody.scale.y = 1 + Math.sin(clock * 1.6) * 0.006; // breathing
    head.rotation.x = pose.headX;
    head.rotation.y = pose.headY;

    food.visible = state.action === 'eat';
    mug.visible = state.action === 'drink';
  }

  return { group, update };
}
