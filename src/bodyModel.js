import * as THREE from 'three';
import { mat, cylinder } from './helpers.js';

// A person's body built from a Mixamo character (see models.js).
//
// Standing idle, drinking and sitting down come from recorded clips. Walking
// uses a recorded clip too when public/models/walk.glb exists; otherwise it is
// layered on in code by swinging the legs and arms from the standing pose.
// Typing has no recorded loop, so it is animated in code on top of the seated
// typing pose: fingers tap, wrists bob, the hands drift across the keyboard and
// the head glances down at the keys now and then.

const SEAT_LIFT = 0.0; // raises a seated character so it rests on an office chair
const SEAT_BACK = 0.0; // moves a seated character back (+) or forward (-) on the seat
const STRIDE = 3.9; // walk cycle radians per metre travelled
const BLEND_SPEED = 8;
const MIN_WALK_RATE = 0.6; // slowest and fastest a recorded walk may be played
const MAX_WALK_RATE = 1.7;

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();

export function createModelBody(assets, kind, { tint = null } = {}) {
  const group = new THREE.Group(); // faces -z, like every person
  const { root, bones, clips } = assets.instantiate(kind, { tint });

  // Mixamo characters face +z, so turn them around inside the group.
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI;
  holder.add(root);
  group.add(holder);

  const mixer = new THREE.AnimationMixer(root);
  const standClip = clips.idle.clone();
  standClip.name = 'stand';

  // Every action is always playing; only its weight changes. Times of the
  // one-shot clips are set by hand each frame.
  const actions = {
    idle: mixer.clipAction(clips.idle),
    drink: mixer.clipAction(clips.drink),
    sit: mixer.clipAction(clips.sit),
    type: mixer.clipAction(clips.type),
    stand: mixer.clipAction(standClip), // frozen standing pose under the coded walk
  };
  if (clips.walk) actions.walk = mixer.clipAction(clips.walk);
  // Speed the recorded walk was captured at, in metres per second (0 if it was
  // recorded on the spot).
  const recordedWalkSpeed = clips.walk ? Math.abs(clips.walk.travelPerSecond) * root.scale.x : 0;
  const weights = {};
  for (const [name, action] of Object.entries(actions)) {
    weights[name] = name === 'type' ? 1 : 0;
    action.setEffectiveWeight(weights[name]);
    action.play();
  }
  actions.idle.time = Math.random() * clips.idle.duration;
  actions.drink.time = Math.random() * clips.drink.duration;
  for (const name of ['sit', 'type', 'stand']) actions[name].paused = true;
  actions.sit.time = clips.sit.duration;
  actions.type.time = clips.type.duration;

  // For the coded movements each bone needs to turn about one of the
  // character's own axes (left-right by default, or straight up). Work out what
  // that axis is in each bone's own frame, in the pose of the given action.
  function sidewaysAxes(actionName, names, axis = X_AXIS) {
    for (const [name, action] of Object.entries(actions)) {
      action.setEffectiveWeight(name === actionName ? 1 : 0);
    }
    mixer.update(0);
    root.updateMatrixWorld(true);
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axes = {};
    for (const name of names) {
      const inRoot = rootInverse.clone().multiply(bones[name].getWorldQuaternion(tmpQuat));
      axes[name] = axis.clone().applyQuaternion(inRoot.invert());
    }
    return axes;
  }
  // The axis that bends a bone straight downwards (a finger pressing a key, a
  // wrist dipping), whichever way the bone happens to point in that pose.
  function pressAxes(actionName, names) {
    for (const [name, action] of Object.entries(actions)) {
      action.setEffectiveWeight(name === actionName ? 1 : 0);
    }
    mixer.update(0);
    root.updateMatrixWorld(true);
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axes = {};
    for (const name of names) {
      const bone = bones[name];
      const next = bone.children.find((child) => child.isBone && /Middle|Hand$/.test(child.name))
        ?? bone.children.find((child) => child.isBone);
      // Direction the bone points, flattened onto the floor, in the root's frame.
      const from = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const to = root.worldToLocal(next.getWorldPosition(new THREE.Vector3()));
      const direction = to.sub(from).setY(0).normalize();
      const axis = new THREE.Vector3().crossVectors(Y_AXIS, direction).normalize();
      const inRoot = rootInverse.clone().multiply(bone.getWorldQuaternion(tmpQuat));
      axes[name] = axis.applyQuaternion(inRoot.invert());
    }
    return axes;
  }
  const walkBones = [
    'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg',
    'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
  ];
  // Fingers that tap while typing: the first joint of each, where the model has one.
  // Each gets its own rhythm so the hands never move in step.
  const fingers = [];
  for (const side of ['Left', 'Right']) {
    ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].forEach((finger, i) => {
      const name = `${side}Hand${finger}1`;
      if (!bones[name]) return;
      fingers.push({ name, rate: 8.5 + i * 1.7 + (side === 'Left' ? 0 : 0.9), phase: Math.random() * 6.28 });
    });
  }
  const typeBones = [
    'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'Head',
    ...fingers.map((finger) => finger.name),
  ];
  const walkAxes = sidewaysAxes('stand', walkBones);
  const typeAxes = {
    ...pressAxes('type', typeBones.filter((name) => name !== 'Head')),
    ...sidewaysAxes('type', ['Head']),
  };
  const typeUpAxes = sidewaysAxes('type', ['LeftForeArm', 'RightForeArm', 'Head'], Y_AXIS);
  const rhythm = Math.random() * 20; // so people at neighbouring desks are out of step
  for (const [name, action] of Object.entries(actions)) action.setEffectiveWeight(weights[name]);

  // The coded movements are added on top of what the mixer wrote. The mixer
  // skips writing a bone whose value has not changed since the last frame, so
  // the additions must be undone before each mixer update or they pile up.
  const codedBones = [...new Set([...walkBones, ...typeBones])].map((name) => bones[name]);
  const cleanQuats = codedBones.map((bone) => bone.quaternion.clone());
  let cleanHipY = bones.Hips.position.y;
  const restoreClean = () => {
    codedBones.forEach((bone, i) => bone.quaternion.copy(cleanQuats[i]));
    bones.Hips.position.y = cleanHipY;
  };
  const saveClean = () => {
    codedBones.forEach((bone, i) => cleanQuats[i].copy(bone.quaternion));
    cleanHipY = bones.Hips.position.y;
  };

  const turn = (axes, name, angle) => {
    bones[name].quaternion.multiply(tmpQuat2.setFromAxisAngle(axes[name], angle));
  };

  // Mug held while drinking.
  const mug = cylinder(0.035, 0.03, 0.09, mat(0xf7f5ef), 0, 0, 0);
  mug.visible = false;
  group.add(mug);

  let walkAmount = 0;
  let typeAmount = 0; // 0 hands resting, 1 typing
  let typeTime = clips.type.duration;
  let seatedAmount = 1;
  let wasWorking = false;

  function update(dt, state, clock) {
    // Which clip should be showing?
    let current = 'idle';
    if (state.walking) current = actions.walk ? 'walk' : 'stand';
    else if (state.slide) current = 'sit';
    else if (state.seated) current = state.action === 'work' ? 'type' : 'sit';
    else if (state.action === 'eat' || state.action === 'drink') current = 'drink';

    const ease = Math.min(1, dt * BLEND_SPEED);
    for (const [name, action] of Object.entries(actions)) {
      weights[name] += ((name === current ? 1 : 0) - weights[name]) * ease;
      action.setEffectiveWeight(weights[name]);
    }

    // Sitting down plays the clip forwards, standing up plays it backwards.
    if (state.slide) {
      const progress = state.slide.sit ? state.slide.progress : 1 - state.slide.progress;
      actions.sit.time = progress * clips.sit.duration;
    } else if (state.seated) {
      actions.sit.time = clips.sit.duration;
    }

    // Move the hands onto the keyboard each time work starts.
    const working = current === 'type';
    if (working && !wasWorking) typeTime = 0;
    wasWorking = working;
    typeTime = Math.min(clips.type.duration, typeTime + dt);
    actions.type.time = typeTime;

    // Match the recorded walk to how fast the person is actually moving, so the
    // feet don't slide.
    if (actions.walk && recordedWalkSpeed > 0.3) {
      // Only up to a point: a slow, short-stepped clip sped up too far looks
      // frantic, so beyond the limit the feet slide a little instead.
      const ratio = (state.walkSpeed ?? recordedWalkSpeed) / recordedWalkSpeed;
      actions.walk.timeScale = Math.min(MAX_WALK_RATE, Math.max(MIN_WALK_RATE, ratio));
    }

    restoreClean();
    mixer.update(dt);
    saveClean();

    // Coded walk on top of the standing pose, when there is no recorded walk.
    walkAmount += ((state.walking && !actions.walk ? 1 : 0) - walkAmount) * ease;
    if (walkAmount > 0.01) {
      const p = state.walkDistance * STRIDE;
      const w = walkAmount;
      turn(walkAxes, 'LeftUpLeg', -Math.sin(p) * 0.5 * w);
      turn(walkAxes, 'RightUpLeg', Math.sin(p) * 0.5 * w);
      turn(walkAxes, 'LeftLeg', Math.max(0, Math.cos(p)) * 0.9 * w);
      turn(walkAxes, 'RightLeg', Math.max(0, -Math.cos(p)) * 0.9 * w);
      turn(walkAxes, 'LeftArm', Math.sin(p) * 0.4 * w);
      turn(walkAxes, 'RightArm', -Math.sin(p) * 0.4 * w);
      turn(walkAxes, 'LeftForeArm', -0.25 * w);
      turn(walkAxes, 'RightForeArm', -0.25 * w);
      bones.Hips.position.y += (Math.abs(Math.cos(p)) - 0.5) * 0.03 * w;
    }

    // Coded typing on top of the seated pose, in bursts with short pauses.
    if (weights.type > 0.5 && typeTime >= clips.type.duration) {
      const t = clock + rhythm;
      const typingNow = Math.sin(t * 0.55) > -0.7;
      typeAmount += ((typingNow ? 1 : 0) - typeAmount) * Math.min(1, dt * 5);
      const amount = typeAmount;

      [['Left', 0], ['Right', 1.9]].forEach(([side, offset]) => {
        // Wrists bob with the keystrokes and the hands drift across the keys.
        const tap = Math.sin(t * 10.5 + offset);
        turn(typeAxes, `${side}Hand`, (0.04 + tap * 0.09) * amount);
        turn(typeAxes, `${side}ForeArm`, tap * 0.025 * amount);
        turn(typeUpAxes, `${side}ForeArm`, Math.sin(t * 1.25 + offset * 2) * 0.11 * amount);
      });

      // Fingers stay slightly curled and jab down one after another.
      for (const finger of fingers) {
        const press = Math.max(0, Math.sin(t * finger.rate + finger.phase)) ** 2;
        turn(typeAxes, finger.name, 0.12 + press * 0.5 * amount);
      }

      // Eyes on the screen, with a look down at the keyboard now and then and
      // a slow drift from side to side while reading.
      const glance = Math.max(0, Math.sin(t * 0.4)) ** 8;
      turn(typeAxes, 'Head', glance * 0.22 + Math.sin(t * 2.1) * 0.01 * amount);
      turn(typeUpAxes, 'Head', Math.sin(t * 0.33) * 0.07);
    }

    // Settle onto the seat.
    let seatedTarget = state.seated ? 1 : 0;
    if (state.slide) seatedTarget = state.slide.sit ? state.slide.progress : 1 - state.slide.progress;
    seatedAmount += (seatedTarget - seatedAmount) * ease;
    holder.position.y = seatedAmount * (SEAT_LIFT + (state.lift ?? 0));
    holder.position.z = seatedAmount * SEAT_BACK;

    // Keep the mug in the right hand while drinking.
    mug.visible = weights.drink > 0.5;
    if (mug.visible) {
      group.updateMatrixWorld(true);
      bones.RightHand.getWorldPosition(tmpVec);
      group.worldToLocal(tmpVec);
      mug.position.copy(tmpVec);
      mug.position.y += 0.02;
    }
  }

  // Height for the name tag: just above the head.
  function tagY() {
    group.updateMatrixWorld(true);
    bones.Head.getWorldPosition(tmpVec);
    group.worldToLocal(tmpVec);
    return tmpVec.y + 0.38;
  }

  return { group, update, tagY, slideTime: 1.3 };
}
