import * as THREE from 'three';

const WALK_SPEED = 1.3; // units per second

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

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);

// A person who works at `desk`, takes breaks at one of the shared `spots`,
// then walks back. See routes.js for the shape of `desk` and `spots`.
//
// `body` is what the person looks like: either a character model
// (bodyModel.js) or a box figure (bodyBox.js). This file only decides where
// the person is and what they are doing.
// `workTime` is the [min, max] seconds spent at the desk between breaks.
export function createPerson({
  name,
  boss = false,
  body,
  desk,
  spots,
  findPath,
  firstBreak = 5,
  workTime = [10, 20],
}) {
  const group = body.group;
  group.position.set(desk.seat[0], 0, desk.seat[1]);

  const nameTag = createNameTag(name, boss);
  group.add(nameTag);

  // The person works through a queue of steps:
  //   { walk, x, z }                      walk to a point
  //   { slide, x, z, face, sit, lift }    get into or out of a seat
  //   { act, action, face, sit, lift, left, onDone }  stay put for `left` seconds

  const queue = [];
  const state = {
    walking: false,
    walkDistance: 0,
    seated: true,
    lift: 0,
    action: 'work',
    slide: null, // { sit, progress } while getting into or out of a seat
  };
  let yaw = desk.face;
  let targetYaw = desk.face;
  let clock = Math.random() * 10;
  let tagY = null;

  const workStep = (seconds) => ({
    act: true,
    action: 'work',
    face: desk.face,
    sit: true,
    lift: 0,
    left: seconds,
  });
  queue.push(workStep(firstBreak));

  function planBreak() {
    const free = spots.filter((spot) => !spot.busy);
    if (free.length === 0) {
      queue.push(workStep(between(4, 8)));
      return;
    }
    const spot = pick(free);
    spot.busy = true;

    const route = [desk.side, ...findPath(desk.node, spot.node), ...(spot.approach ?? [])];
    const last = route[route.length - 1];
    const sit = Boolean(spot.seat);
    const lift = spot.lift ?? 0;

    // There
    queue.push({ slide: true, x: desk.side[0], z: desk.side[1], face: desk.face, sit: false });
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
    if (sit) queue.push({ slide: true, x: last[0], z: last[1], face: spot.face, sit: false, lift });
    for (const [x, z] of route.slice(0, -1).reverse()) queue.push({ walk: true, x, z });
    queue.push({ slide: true, x: desk.seat[0], z: desk.seat[1], face: desk.face, sit: true, lift: 0 });
    queue.push(workStep(between(workTime[0], workTime[1])));
  }

  function advance(dt) {
    if (queue.length === 0) planBreak();
    const step = queue[0];
    const pos = group.position;

    state.walking = false;
    state.slide = null;

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
        state.walkDistance += travel;
      }
      state.walking = true;
    } else if (step.slide) {
      if (step.progress === undefined) {
        step.progress = 0;
        step.fromX = pos.x;
        step.fromZ = pos.z;
      }
      step.progress = Math.min(1, step.progress + dt / body.slideTime);
      const k = step.progress * step.progress * (3 - 2 * step.progress);
      pos.x = step.fromX + (step.x - step.fromX) * k;
      pos.z = step.fromZ + (step.z - step.fromZ) * k;
      targetYaw = step.face;
      state.seated = step.sit;
      state.lift = step.lift ?? 0;
      state.action = 'idle';
      state.slide = { sit: step.sit, progress: step.progress };
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

    body.update(dt, state, clock);

    // Keep the name tag floating just above the head.
    const target = body.tagY();
    tagY = tagY === null ? target : tagY + (target - tagY) * Math.min(1, dt * 10);
    nameTag.position.y = tagY;
  }

  // Snapshot for debugging in the browser console (see window.office in main.js).
  const debug = () => ({
    name,
    at: [Number(group.position.x.toFixed(2)), Number(group.position.z.toFixed(2))],
    action: state.action,
    steps: queue.map((step) => (step.act ? step.action : `${step.walk ? 'walk' : 'slide'} ${step.x},${step.z}`)),
  });

  return { group, update, debug };
}
