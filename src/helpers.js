import * as THREE from 'three';

export function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(rTop, rBottom, h, material, x = 0, y = 0, z = 0, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A thin floor covering (carpet, tiles, rug) that only receives shadows.
export function floorPatch(w, d, color, x, z, y = 0.01) {
  const mesh = box(w, 0.02, d, mat(color), x, y, z);
  mesh.castShadow = false;
  return mesh;
}
