import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// A procedurally built low-poly car (no model files to download or
// license). Built in metres in a local frame where +X is right, +Y is the
// direction of travel and +Z is up; MapEngine places it on the map with the
// car's heading. Geometry and materials are shared between every car so a
// dozen cars cost a handful of GPU buffers.

export const CAR_LENGTH_M = 4.4;

const BODY_COLORS: Record<string, number> = {
  fem_economy: 0xf8fafc, // white
  fem_comfort: 0x1f2937, // graphite
  fem_xl: 0x9ca3af, // silver
};
const ASSIGNED_COLOR = 0x16a34a; // FEM brand green

interface Shared {
  body: THREE.BufferGeometry;
  cabin: THREE.BufferGeometry;
  roof: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry;
  shadow: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
  glass: THREE.Material;
  tyre: THREE.Material;
  headlight: THREE.Material;
  taillight: THREE.Material;
  shadowMat: THREE.Material;
  ringMat: THREE.Material;
  bodyMats: Map<number, THREE.Material>;
}

let shared: Shared | null = null;

/** Hex for a car colour name as drivers enter it ("Red", "Silver"...). */
export const CAR_COLOR_NAMES: Record<string, string> = {
  white: '#f8fafc', black: '#1f2937', silver: '#c0c4ca', grey: '#8b9098', gray: '#8b9098',
  red: '#c8102e', blue: '#1d4ed8', green: '#15803d', yellow: '#eab308', orange: '#ea580c',
  brown: '#78350f', beige: '#d6c7a1', gold: '#b8923a', maroon: '#7f1d1d', navy: '#1e3a8a',
};

function shadowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function getShared(): Shared {
  if (shared) return shared;
  const body = new RoundedBoxGeometry(1.8, CAR_LENGTH_M, 0.72, 3, 0.22);
  body.translate(0, 0, 0.62);
  const cabin = new RoundedBoxGeometry(1.56, 2.2, 0.62, 3, 0.2);
  cabin.translate(0, -0.25, 1.18);
  const roof = new RoundedBoxGeometry(1.44, 1.7, 0.08, 2, 0.04);
  roof.translate(0, -0.3, 1.5);
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14);
  wheel.rotateZ(Math.PI / 2); // axle along X
  const lamp = new THREE.BoxGeometry(0.36, 0.06, 0.12);
  const shadow = new THREE.PlaneGeometry(2.6, 5.4);
  const ring = new THREE.RingGeometry(3.2, 3.9, 40);
  shared = {
    body,
    cabin,
    roof,
    wheel,
    lamp,
    shadow,
    ring,
    glass: new THREE.MeshLambertMaterial({ color: 0x1e293b }),
    tyre: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xfff7d6 }),
    taillight: new THREE.MeshBasicMaterial({ color: 0xdc2626 }),
    shadowMat: new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
    ringMat: new THREE.MeshBasicMaterial({
      color: ASSIGNED_COLOR,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    bodyMats: new Map(),
  };
  return shared;
}

function bodyMaterial(color: number): THREE.Material {
  const s = getShared();
  let mat = s.bodyMats.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    s.bodyMats.set(color, mat);
  }
  return mat;
}

export function createCar(
  vehicleClass: string | null | undefined,
  assigned: boolean,
  paintColor?: string | null
): THREE.Group {
  const s = getShared();
  const color = paintColor
    ? new THREE.Color(paintColor).getHex()
    : assigned
      ? ASSIGNED_COLOR
      : BODY_COLORS[vehicleClass ?? ''] ?? BODY_COLORS.fem_economy;
  const paint = bodyMaterial(color);
  const car = new THREE.Group();

  const shadowMesh = new THREE.Mesh(s.shadow, s.shadowMat);
  shadowMesh.position.z = 0.02;
  shadowMesh.renderOrder = -1;
  car.add(shadowMesh);

  if (assigned) {
    const ring = new THREE.Mesh(s.ring, s.ringMat);
    ring.position.z = 0.03;
    ring.name = 'ring';
    car.add(ring);
  }

  car.add(new THREE.Mesh(s.body, paint));
  car.add(new THREE.Mesh(s.cabin, s.glass));
  car.add(new THREE.Mesh(s.roof, paint));

  for (const [x, y] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35]]) {
    const w = new THREE.Mesh(s.wheel, s.tyre);
    w.position.set(x, y, 0.34);
    car.add(w);
  }
  for (const x of [-0.55, 0.55]) {
    const head = new THREE.Mesh(s.lamp, s.headlight);
    head.position.set(x, CAR_LENGTH_M / 2 + 0.01, 0.72);
    car.add(head);
    const tail = new THREE.Mesh(s.lamp, s.taillight);
    tail.position.set(x, -CAR_LENGTH_M / 2 - 0.01, 0.74);
    car.add(tail);
  }
  car.matrixAutoUpdate = false;
  return car;
}

export function createLights(): THREE.Object3D[] {
  // World space is MapLibre's mercator frame (x east, y south, z up).
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6);
  hemi.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.35, 0.6, 1);
  return [hemi, sun];
}
