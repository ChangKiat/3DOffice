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
// walks back, and can be called to a meeting at any moment.
//
// `body` is what the person looks like: either a character model
// (bodyModel.js) or a box figure (bodyBox.js). This file only decides where
// the person is and what they are doing.
//
// The desk, the break spots and the meeting chairs are all "places" with the
// same shape (see routes.js): the walkway `node` they hang off, `approach`
// points from that node, an optional `seat`, the `face` direction and the
// `action` done there.
//
// `workTime` is the [min, max] seconds spent at the desk between breaks.
export function createPerson({
  name,
  boss = false,
  body,
  desk,
  spots,
  graph,
  firstBreak = 5,
  workTime = [10, 20],
}) {
  const group = body.group;
  group.position.set(desk.seat[0], 0, desk.seat[1]);

  const nameTag = createNameTag(name, boss);
  group.add(nameTag);

  // The person works through a queue of steps:
  //   { walk, x, z, node }            walk to a walkway node
  //   { walk, x, z, place, index }    walk to one of a place's approach points
  //   { slide, x, z, sit, place }     get into or out of a seat
  //   { act, left, place }            stay at a place for `left` seconds
  const queue = [];
  const state = {
    walking: false,
    walkDistance: 0,
    seated: true,
    lift: 0,
    action: 'work',
    slide: null, // { sit, progress } while getting into or out of a seat
  };
  let here = desk; // the place the person is at, or was at last
  let reserved = null; // break spot held by this person
  let inMeeting = false;
  let yaw = desk.face;
  let targetYaw = desk.face;
  let clock = Math.random() * 10;
  let tagY = null;

  const actStep = (place, seconds) => ({ act: true, place, left: seconds });
  const approachStep = (place, index) => ({
    walk: true,
    x: place.approach[index][0],
    z: place.approach[index][1],
    place,
    index,
  });
  // Where someone stands just before sitting down at a place.
  const standPoint = (place) =>
    place.approach.length > 0 ? place.approach[place.approach.length - 1] : graph.nodePoint(place.node);

  queue.push(actStep(desk, firstBreak));

  // Steps that take the person from whatever they are doing now back to a
  // walkway node, and the name of that node.
  function leaveSteps() {
    const current = queue[0];
    const keep = [];
    let place = here;
    let index = place.approach.length - 1; // approach point the person will be standing at
    let seated = Boolean(place.seat);

    if (current?.walk) {
      keep.push(current);
      if (current.node) return { keep, start: current.node };
      place = current.place;
      index = current.index;
      seated = false;
    } else if (current?.slide) {
      keep.push(current);
      place = current.place;
      index = place.approach.length - 1;
      seated = current.sit;
    } else if (current?.act) {
      place = current.place;
      index = place.approach.length - 1;
      seated = Boolean(place.seat);
    }

    if (seated) {
      const [x, z] = standPoint(place);
      keep.push({ slide: true, x, z, sit: false, place });
    }
    for (let i = index - 1; i >= 0; i--) keep.push(approachStep(place, i));
    return { keep, start: place.node };
  }

  // Drop whatever was planned and head for `place`, staying there for `seconds`.
  function goTo(place, seconds) {
    const { keep, start } = leaveSteps();
    if (reserved && reserved !== place) {
      reserved.busy = false;
      reserved = null;
    }

    queue.length = 0;
    queue.push(...keep);
    for (const node of graph.findPath(start, place.node)) {
      const [x, z] = graph.nodePoint(node);
      queue.push({ walk: true, x, z, node });
    }
    place.approach.forEach((_, index) => queue.push(approachStep(place, index)));
    if (place.seat) queue.push({ slide: true, x: place.seat[0], z: place.seat[1], sit: true, place });
    queue.push(actStep(place, seconds));
  }

  const goToDesk = () => goTo(desk, between(workTime[0], workTime[1]));

  function planBreak() {
    const free = spots.filter((spot) => !spot.busy);
    if (free.length === 0) {
      queue.push(actStep(desk, between(4, 8)));
      return;
    }
    const spot = pick(free);
    spot.busy = true;
    reserved = spot;
    goTo(spot, between(7, 11));
  }

  function callMeeting(chair) {
    inMeeting = true;
    goTo(chair, Infinity);
  }

  function endMeeting() {
    if (!inMeeting) return;
    inMeeting = false;
    goToDesk();
  }

  function advance(dt) {
    if (queue.length === 0) {
      if (here === desk) planBreak();
      else goToDesk();
    }
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
        state.walking = true;
      }
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
      targetYaw = step.place.face;
      state.seated = step.sit;
      state.lift = step.place.lift ?? 0;
      state.action = 'idle';
      state.slide = { sit: step.sit, progress: step.progress };
      if (step.progress >= 1) queue.shift();
    } else {
      here = step.place;
      targetYaw = step.place.face;
      state.seated = Boolean(step.place.seat);
      state.lift = step.place.lift ?? 0;
      state.action = step.place.action;
      step.left -= dt;
      if (step.left <= 0) {
        if (reserved === step.place) {
          reserved.busy = false;
          reserved = null;
        }
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

  // What the person is doing right now, in words (used by the chat).
  function activity() {
    const where = queue[queue.length - 1]?.place;
    switch (state.action) {
      case 'work':
        return 'working at your desk';
      case 'eat':
        return 'having a snack at the pantry table';
      case 'drink':
        return 'getting a drink in the pantry';
      case 'rest':
        return 'taking a short break in the rest area';
      case 'think':
        return 'looking at the whiteboard in the meeting room';
      case 'meeting':
        return 'sitting in a meeting in the meeting room';
      default:
        if (where?.action === 'meeting') return 'on your way to a meeting in the meeting room';
        if (where?.action === 'work') return 'walking back to your desk';
        return 'walking through the office on a short break';
    }
  }

  // Snapshot for debugging in the browser console (see window.office in main.js).
  const debug = () => ({
    name,
    at: [Number(group.position.x.toFixed(2)), Number(group.position.z.toFixed(2))],
    action: state.action,
    seated: state.seated,
    steps: queue.map((step) => {
      if (step.act) return `${step.place.action} at ${step.place.name}`;
      return `${step.walk ? 'walk' : 'slide'} ${step.x},${step.z}`;
    }),
  });

  return { name, group, update, callMeeting, endMeeting, activity, debug };
}
