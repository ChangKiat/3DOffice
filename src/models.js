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
};

function prepareClip(name, gltf, { pinHips = false } = {}) {
  const source = gltf.animations[0];

  let rigHipHeight;
  gltf.scene.traverse((node) => {
    if (rigHipHeight === undefined && /Hips$/.test(node.name)) rigHipHeight = node.position.y;
  });

  const tracks = [];
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
      tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, track.times, values));
      continue;
    }
    const copy = track.clone();
    copy.name = `${bone}.${property}`;
    tracks.push(copy);
  }

  return new THREE.AnimationClip(name, source.duration, tracks);
}

// The same clip with hip movement scaled to a character's own hip height.
function fitClip(clip, hipHeight) {
  const fitted = clip.clone();
  for (const track of fitted.tracks) {
    if (track.name !== 'mixamorigHips.position') continue;
    for (let i = 0; i < track.values.length; i++) track.values[i] *= hipHeight;
  }
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
    Object.entries(CLIPS).map(async ([name, info]) => [name, prepareClip(name, await load(info.file), info)]),
  );
  const clips = Object.fromEntries(clipEntries);

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
