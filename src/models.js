import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Loads the Mixamo characters and animation clips from public/models and
// prepares them so any clip can play on any character.
//
// Mixamo gives every download a different bone prefix ("mixamorig1Hips",
// "mixamorig7Hips", ...), so bones and animation tracks are renamed to a
// common "mixamorigHips" form. Hip movement is stored relative to hip height
// so it can be rescaled for characters of different sizes.

const canonical = (name) => name.replace(/^mixamorig\d*/, 'mixamorig');

// Which model each kind of person uses. `hide` removes meshes by name,
// `tintMesh` is the mesh recoloured per person, `height` is in metres.
const CHARACTERS = {
  worker: { file: 'ch17', height: 1.76, hide: ['Helmet'], tintMesh: 'Shirt' },
  casual: { file: 'ch01', height: 1.76 },
  ch28: { file: 'ch28', height: 1.76 },
  ch18: { file: 'ch18', height: 1.76 },
  boss: { file: 'ch33', height: 1.78 },
  receptionist: { file: 'kachujin', height: 1.68 },
};

// name -> file, and whether the hips stay pinned over the feet. The sitting clip
// moves the hips back half a metre; the person is moved onto the seat in code instead.
const CLIPS = {
  idle: { file: 'idle' },
  drink: { file: 'drinking' },
  sit: { file: 'stand-to-sit', pinHips: true },
  type: { file: 'sit-to-type', pinHips: true },
  // Optional: a looping walk. Without it the walk is animated in code (bodyModel.js).
  // Forward travel is taken out so the person can be moved along their route in code.
  walk: { file: 'walk', optional: true, removeTravel: true },
  // Optional: a clip with only a couple of steps. If there is no proper walk
  // loop, one is built from a single step of this clip (see loopFromSteps).
  walkSteps: { file: 'walk-stop', optional: true },
};

function prepareClip(name, gltf, { pinHips = false, removeTravel = false } = {}) {
  const source = gltf.animations[0];

  let rigHipHeight;
  gltf.scene.traverse((node) => {
    if (rigHipHeight === undefined && /Hips$/.test(node.name)) rigHipHeight = node.position.y;
  });

  const tracks = [];
  let travelPerSecond = 0; // forward speed recorded in the clip, in hip heights per second
  for (const track of source.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = canonical(track.name.slice(0, dot));
    const property = track.name.slice(dot + 1);

    if (property === 'scale') continue;
    if (property === 'position') {
      if (bone !== 'mixamorigHips') continue;
      const values = Float32Array.from(track.values, (v) => v / rigHipHeight);
      if (pinHips) {
        for (let i = 0; i < values.length; i += 3) {
          values[i] = 0;
          values[i + 2] = 0;
        }
      }
      if (removeTravel && values.length >= 6) {
        // Take out the steady forward movement but keep the small back-and-forth
        // of the hips within each step.
        const travel = values[values.length - 1] - values[2];
        const start = track.times[0];
        const span = track.times[track.times.length - 1] - start || 1;
        travelPerSecond = travel / span;
        for (let i = 0; i < track.times.length; i++) {
          values[i * 3 + 2] -= (travel * (track.times[i] - start)) / span;
        }
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, track.times, values));
      continue;
    }
    const copy = track.clone();
    copy.name = `${bone}.${property}`;
    tracks.push(copy);
  }

  const clip = new THREE.AnimationClip(name, source.duration, tracks);
  clip.travelPerSecond = travelPerSecond;
  return clip;
}

// Builds a looping walk out of a clip that only contains a step or two.
//
// A walk cycle is one step followed by the same step mirrored left-to-right.
// So: find the moment the legs are furthest apart, find the later moment that
// best matches its mirror image (one step on), and join that step to a
// mirrored copy of itself. Small mismatches at the joins are spread across
// each step so nothing jumps.
function loopFromSteps(source) {
  const FPS = 30;
  const samplers = new Map(
    source.tracks.map((track) => {
      const interpolant = track.createInterpolant();
      return [track.name, (time) => Array.from(interpolant.evaluate(time))];
    }),
  );
  const names = [...samplers.keys()];
  const isPosition = (name) => name.endsWith('.position');
  const mirrorName = (name) =>
    name.includes('Left') ? name.replace('Left', 'Right') : name.replace('Right', 'Left');
  const mirrorValue = (name, v) => (isPosition(name) ? [-v[0], v[1], v[2]] : [v[0], -v[1], -v[2], v[3]]);
  const sample = (name, time) => samplers.get(name)(time);
  const mirrored = (name, time) => {
    const other = samplers.has(mirrorName(name)) ? mirrorName(name) : name;
    return mirrorValue(name, samplers.get(other)(time));
  };
  const difference = (a, b) => 1 - Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);

  const limbs = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm']
    .map((bone) => `mixamorig${bone}.quaternion`)
    .filter((name) => samplers.has(name));
  const legSpread = (time) =>
    difference(sample('mixamorigLeftUpLeg.quaternion', time), mirrored('mixamorigLeftUpLeg.quaternion', time));
  const mismatch = (start, end) =>
    limbs.reduce((sum, name) => sum + difference(sample(name, end), mirrored(name, start)), 0);

  const step = 1 / FPS;
  let start = step;
  for (let time = step; time <= source.duration * 0.5; time += step) {
    if (legSpread(time) > legSpread(start)) start = time;
  }
  let end = Math.min(source.duration, start + 0.3);
  for (let time = end; time <= Math.min(source.duration, start + 0.8); time += step) {
    if (mismatch(start, time) < mismatch(start, end)) end = time;
  }

  const half = end - start;
  const count = Math.max(2, Math.round(half * FPS)); // keys per step
  const times = Float32Array.from({ length: count * 2 + 1 }, (_, i) => (i / count) * half);
  const hips = 'mixamorigHips.position';
  const travel = sample(hips, end)[2] - sample(hips, start)[2]; // forward distance of one step

  const tracks = names.map((name) => {
    const size = isPosition(name) ? 3 : 4;
    const values = new Float32Array(times.length * size);
    const halves = [
      { at: (time) => sample(name, time), next: mirrored(name, start) },
      { at: (time) => mirrored(name, time), next: sample(name, start) },
    ];

    halves.forEach(({ at, next }, h) => {
      // How far the end of this step is from where the following step starts.
      const natural = at(end);
      let target = next;
      if (!isPosition(name) && natural.reduce((sum, v, k) => sum + v * target[k], 0) < 0) {
        target = target.map((v) => -v);
      }
      const error = natural.map((v, k) => (name === hips && k === 2 ? 0 : target[k] - v));

      for (let i = 0; i < count; i++) {
        const value = at(start + (i / count) * half);
        const weight = i / count;
        for (let k = 0; k < size; k++) value[k] += error[k] * weight;
        if (name === hips) {
          // Forward movement is removed so the person can be moved in code.
          // The hips also start over the feet, wherever they were in the clip.
          value[2] = value[2] - sample(hips, start)[2] - travel * (i / count);
        } else if (!isPosition(name)) {
          const length = Math.hypot(...value);
          for (let k = 0; k < size; k++) value[k] /= length;
        }
        values.set(value, (h * count + i) * size);
      }
    });

    // Close the loop, and keep neighbouring rotations on the same side so
    // they blend the short way round.
    values.set(values.subarray(0, size), count * 2 * size);
    if (!isPosition(name)) {
      for (let i = 1; i < times.length; i++) {
        let dot = 0;
        for (let k = 0; k < 4; k++) dot += values[i * 4 + k] * values[(i - 1) * 4 + k];
        if (dot < 0) for (let k = 0; k < 4; k++) values[i * 4 + k] *= -1;
      }
    }

    return isPosition(name)
      ? new THREE.VectorKeyframeTrack(name, times, values)
      : new THREE.QuaternionKeyframeTrack(name, times, values);
  });

  const clip = new THREE.AnimationClip('walk', half * 2, tracks);
  clip.travelPerSecond = travel / half;
  clip.builtFrom = { start, end, mismatch: mismatch(start, end) };
  return clip;
}

// The same clip with hip movement scaled to a character's own hip height.
function fitClip(clip, hipHeight) {
  const fitted = clip.clone();
  for (const track of fitted.tracks) {
    if (track.name !== 'mixamorigHips.position') continue;
    for (let i = 0; i < track.values.length; i++) track.values[i] *= hipHeight;
  }
  fitted.travelPerSecond = (clip.travelPerSecond ?? 0) * hipHeight;
  return fitted;
}

function prepareCharacter(config, gltf, clips) {
  const scene = gltf.scene;
  let hipHeight = 1;

  scene.traverse((node) => {
    node.name = canonical(node.name);
    if (node.name === 'mixamorigHips') hipHeight = node.position.y;
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false; // skinned meshes move outside their rest-pose bounds
      if (config.hide?.some((part) => node.name.includes(part))) node.visible = false;
    }
  });

  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const fitted = {};
  for (const [name, clip] of Object.entries(clips)) fitted[name] = fitClip(clip, hipHeight);

  return { config, scene, scale: config.height / size.y, clips: fitted };
}

export async function loadCharacterAssets(base = '/models/') {
  const loader = new GLTFLoader();
  const load = (file) => loader.loadAsync(`${base}${file}.glb`);

  const clipEntries = await Promise.all(
    Object.entries(CLIPS).map(async ([name, info]) => {
      const gltf = info.optional ? await load(info.file).catch(() => null) : await load(info.file);
      return [name, gltf ? prepareClip(name, gltf, info) : null];
    }),
  );
  const clips = Object.fromEntries(clipEntries.filter(([, clip]) => clip !== null));
  if (!clips.walk && clips.walkSteps) clips.walk = loopFromSteps(clips.walkSteps);
  delete clips.walkSteps;
  if (import.meta.env?.DEV) window.walkClipInfo = clips.walk ? { ...clips.walk.builtFrom, duration: clips.walk.duration, travelPerSecond: clips.walk.travelPerSecond } : null;

  const characterEntries = await Promise.all(
    Object.entries(CHARACTERS).map(async ([kind, config]) => [
      kind,
      prepareCharacter(config, await load(config.file), clips),
    ]),
  );
  const characters = Object.fromEntries(characterEntries);

  // A fresh, independently animated copy of a character.
  // `tint` multiplies the colour of the character's tint mesh (values above 1 brighten).
  function instantiate(kind, { tint = null } = {}) {
    const character = characters[kind];
    const root = SkeletonUtils.clone(character.scene);
    root.scale.setScalar(character.scale);

    const bones = {};
    root.traverse((node) => {
      if (node.isBone) bones[node.name.replace('mixamorig', '')] = node;
      if (tint && node.isMesh && character.config.tintMesh && node.name.includes(character.config.tintMesh)) {
        node.material = node.material.clone();
        node.material.color.setRGB(tint[0], tint[1], tint[2]);
      }
    });

    return { root, bones, clips: character.clips };
  }

  return { instantiate };
}
