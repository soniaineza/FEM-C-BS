import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { CAR_MODEL_GLB_BASE64 } from './carModelData';

// Cars for the map, in metres in a local frame where +X is right, +Y is the
// direction of travel and +Z is up; MapEngine places them with the car's
// heading.
//
// Primary: Kenney "Car Kit" glTF models (CC0, assets/models/cars) — sedan
// for Economy, luxury SUV for Comfort, van for XL — loaded once from the
// bundle and cloned per car, with the paint recoloured per car and wheels
// that turn as it drives (chosen with TypeSafe's Jev, 1.0).
// Fallback: a procedural low-poly car, shown until the models have loaded
// or if they fail. Geometry/materials are shared between cars either way.
//
// Stylised look (both kinds): cel shading (MeshToonMaterial, 3-step ramp),
// a soft ink outline (inverted hull on smoothed normals), a glowing FEM taxi
// sign on the roof and brake lights the engine switches on as a car slows.

export const CAR_LENGTH_M = 4.4;

const BODY_COLORS: Record<string, number> = {
  fem_economy: 0xf8fafc, // white
  fem_comfort: 0x1f2937, // graphite
  fem_xl: 0x9ca3af, // silver
};
const ASSIGNED_COLOR = 0x16a34a; // Kimu brand green

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

export { CAR_COLOR_NAMES } from './map-types';

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
    mat = new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp() });
    s.bodyMats.set(color, mat);
  }
  return mat;
}

// ---------------------------------------------------------------------------
// Stylisation: toon ramp, outlines, taxi sign, brake lights
// ---------------------------------------------------------------------------

const OUTLINE_COLOR = 0x0b1220;
const OUTLINE_M = 0.07; // outline thickness in metres (scales with the car)
const SIGN_AVAILABLE = 0x22c55e; // FEM green: free cab
const SIGN_ASSIGNED = 0xffffff; // the rider's own car

let toonRamp: THREE.Texture | null = null;
/** 3-step light ramp: shadow, mid, lit — the cel-shaded look. */
function getToonRamp(): THREE.Texture {
  if (toonRamp) return toonRamp;
  const tex = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  toonRamp = tex;
  return tex;
}

const outlineMats = new Map<number, THREE.Material>();
/** Back-face hull material that pushes vertices out along their normals. */
function outlineMaterial(width: number): THREE.Material {
  const key = Math.round(width * 1e5);
  let mat = outlineMats.get(key);
  if (mat) return mat;
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position) + normalize(normal) * ${width.toFixed(6)};`
    );
  };
  m.customProgramCacheKey = () => `fem-outline-${key}`;
  outlineMats.set(key, m);
  return m;
}

const outlineGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** Position-only copy with welded vertices and smooth normals, so the hull has no cracks. */
function outlineGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = outlineGeometries.get(geometry);
  if (cached) return cached;
  // glTF positions may be interleaved or quantized (normalized ints); copy
  // them into a plain float attribute (getX() de-quantizes) before welding.
  const src = geometry.getAttribute('position');
  const positions = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    positions[i * 3] = src.getX(i);
    positions[i * 3 + 1] = src.getY(i);
    positions[i * 3 + 2] = src.getZ(i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (geometry.index) g.setIndex(Array.from(geometry.index.array as ArrayLike<number>));
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  outlineGeometries.set(geometry, welded);
  return welded;
}

/** Adds an outline hull as a child of every mesh under `root`. */
function addOutlines(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.outline && !mesh.userData.noOutline) meshes.push(mesh);
  });
  const scale = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.getWorldScale(scale);
    const avg = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3 || 1;
    const hull = new THREE.Mesh(outlineGeometry(mesh.geometry), outlineMaterial(OUTLINE_M / avg));
    hull.userData.outline = true;
    hull.frustumCulled = false;
    mesh.add(hull);
  }
}

interface Accessories {
  sign: THREE.BufferGeometry;
  signStripe: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry;
  signMats: Map<number, THREE.Material>;
  stripeMat: THREE.Material;
  brakeOn: THREE.Material;
  brakeOff: THREE.Material;
  outline: THREE.Material;
}
let accessories: Accessories | null = null;
function getAccessories(): Accessories {
  if (accessories) return accessories;
  accessories = {
    sign: new RoundedBoxGeometry(0.95, 0.42, 0.32, 2, 0.08),
    signStripe: new THREE.BoxGeometry(0.78, 0.1, 0.03),
    lamp: new RoundedBoxGeometry(0.42, 0.08, 0.16, 1, 0.03),
    signMats: new Map(),
    stripeMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    brakeOn: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    brakeOff: new THREE.MeshBasicMaterial({ color: 0x5b1414 }),
    outline: new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }),
  };
  return accessories;
}

/** Roof taxi sign + brake lights; lights are listed in userData.brakeLights. */
function addTaxiParts(car: THREE.Group, roofZ: number, rearY: number, lampZ: number, assigned: boolean) {
  const a = getAccessories();
  const signColor = assigned ? SIGN_ASSIGNED : SIGN_AVAILABLE;
  let signMat = a.signMats.get(signColor);
  if (!signMat) {
    signMat = new THREE.MeshBasicMaterial({ color: signColor });
    a.signMats.set(signColor, signMat);
  }
  const sign = new THREE.Mesh(a.sign, signMat);
  sign.position.set(0, -0.15, roofZ + 0.16);
  const signHull = new THREE.Mesh(a.sign, a.outline);
  signHull.scale.setScalar(1.14);
  sign.add(signHull);
  const stripe = new THREE.Mesh(a.signStripe, assigned ? signMat : a.stripeMat);
  stripe.position.set(0, 0, 0.17);
  sign.add(stripe);
  sign.name = 'sign';
  car.add(sign);

  const lights: THREE.Mesh[] = [];
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(a.lamp, a.brakeOff);
    lamp.position.set(x, rearY - 0.02, lampZ);
    car.add(lamp);
    lights.push(lamp);
  }
  car.userData.brakeLights = lights;
  car.userData.brakeOn = false;
}

/** Switches a car's brake lights (cheap: only swaps materials on change). */
export function setBrakeLights(car: THREE.Object3D, on: boolean) {
  if (car.userData.brakeOn === on) return;
  car.userData.brakeOn = on;
  const a = getAccessories();
  for (const lamp of (car.userData.brakeLights as THREE.Mesh[] | undefined) ?? []) lamp.material = on ? a.brakeOn : a.brakeOff;
}

// ---------------------------------------------------------------------------
// glTF models
// ---------------------------------------------------------------------------

const MODEL_FOR_CLASS: Record<string, string> = {
  fem_economy: 'sedan',
  fem_comfort: 'suv-luxury',
  fem_xl: 'van',
};
// The kit's cars are toy-proportioned (about as wide as they are long);
// stretch them toward a real car's footprint.
const MODEL_WIDTH_M = 2.3;
const PALETTE_CELL = { w: 64, h: 128 }; // Kenney colormap: 8x4 gradient cells

interface CarTemplate {
  root: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  paintCell: { x: number; y: number; w: number; h: number } | null;
  wheelRadiusM: number;
  /** Roof height and tail-light height in metres (for the sign and brake lights). */
  heightM: number;
}

const templates = new Map<string, CarTemplate>();
const paintedMaterials = new Map<string, THREE.Material>();
let loading: Promise<void> | null = null;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Which cell of the Kenney palette each model's body paint uses, as
// [column, row] in the 8x4 grid. Verified from the models' UVs: the most-used
// cells overall are the shared dark greys (tyres, glass, trim), so the paint
// is the saturated row-1 cell — sedan red-orange, luxury SUV yellow, van
// blue. Update this if the bundled models change.
const PAINT_CELLS: Record<string, [number, number]> = {
  sedan: [6, 1],
  'suv-luxury': [4, 1],
  van: [7, 1],
};

async function loadModel(loader: GLTFLoader, name: string): Promise<void> {
  const b64 = CAR_MODEL_GLB_BASE64[name];
  if (!b64) return;
  const gltf = await loader.parseAsync(base64ToArrayBuffer(b64), '');
  const model = gltf.scene;

  // Normalise: centre on the ground, stretch to a car footprint, then rotate
  // glTF's Y-up / +Z-forward frame into ours (Z up, +Y forward, +X right).
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const scaled = new THREE.Group();
  const sx = MODEL_WIDTH_M / size.x;
  const sz = CAR_LENGTH_M / size.z;
  scaled.scale.set(sx, (sx + sz) / 2, sz);
  scaled.add(model);
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  root.add(scaled);

  let material: THREE.MeshStandardMaterial | null = null;
  let wheelRadius = 0.3;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    material = material ?? (mesh.material as THREE.MeshStandardMaterial);
    if (mesh.name.startsWith('wheel') || mesh.parent?.name.startsWith('wheel')) {
      mesh.geometry.computeBoundingSphere();
      wheelRadius = mesh.geometry.boundingSphere?.radius ?? wheelRadius;
    }
  });
  if (!material) return;
  const mat = material as THREE.MeshStandardMaterial;
  const cell = PAINT_CELLS[name];
  const paintCell = cell
    ? { x: cell[0] * PALETTE_CELL.w, y: cell[1] * PALETTE_CELL.h, w: PALETTE_CELL.w, h: PALETTE_CELL.h }
    : null;
  addOutlines(root);
  templates.set(name, {
    root,
    material: mat,
    paintCell,
    wheelRadiusM: wheelRadius * ((sx + sz) / 2),
    heightM: size.y * ((sx + sz) / 2),
  });
}

/** Loads the embedded car models once; resolves when ready (or failed). */
export function loadCarModels(): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all(Object.values(MODEL_FOR_CLASS).map((n) => loadModel(loader, n)))
      .then(() => undefined)
      .catch((err) => {
        // Keep the procedural cars; the map stays fully usable.
        console.warn('[carModel] glTF cars unavailable:', err?.message ?? err);
      });
  }
  return loading;
}

function toonFromTemplate(src: THREE.MeshStandardMaterial): THREE.Material {
  return new THREE.MeshToonMaterial({ map: src.map, color: src.color, gradientMap: getToonRamp() });
}

/** A copy of the model's palette with the paint cell recoloured (cached). */
function paintedMaterial(name: string, tpl: CarTemplate, color: number): THREE.Material {
  const key = `${name}:${color}`;
  const cached = paintedMaterials.get(key);
  if (cached) return cached;
  const map = tpl.material.map;
  const image = map?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!map || !image || !tpl.paintCell) return toonFromTemplate(tpl.material);

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return toonFromTemplate(tpl.material);
  ctx.drawImage(image, 0, 0);
  const { x, y, w, h } = tpl.paintCell;
  const cell = ctx.getImageData(x, y, w, h);
  const px = cell.data;
  // Keep the cell's light-to-dark gradient, swap its hue for the paint.
  let mean = 0;
  for (let i = 0; i < px.length; i += 4) mean += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  mean = mean / (px.length / 4) || 1;
  const target = new THREE.Color(color);
  const [tr, tg, tb] = [target.r * 255, target.g * 255, target.b * 255];
  for (let i = 0; i < px.length; i += 4) {
    const k = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / mean;
    px[i] = Math.min(255, tr * k);
    px[i + 1] = Math.min(255, tg * k);
    px[i + 2] = Math.min(255, tb * k);
  }
  ctx.putImageData(cell, x, y);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.offset.copy(map.offset);
  tex.repeat.copy(map.repeat);
  tex.rotation = map.rotation;
  tex.center.copy(map.center);
  tex.magFilter = map.magFilter;
  tex.minFilter = map.minFilter;
  tex.needsUpdate = true;
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: getToonRamp() });
  paintedMaterials.set(key, mat);
  return mat;
}

function addShadowAndRing(car: THREE.Group, assigned: boolean) {
  const s = getShared();
  const shadowMesh = new THREE.Mesh(s.shadow, s.shadowMat);
  shadowMesh.position.z = 0.02;
  shadowMesh.renderOrder = -1;
  shadowMesh.userData.noOutline = true;
  car.add(shadowMesh);
  if (assigned) {
    const ring = new THREE.Mesh(s.ring, s.ringMat);
    ring.position.z = 0.03;
    ring.name = 'ring';
    ring.userData.noOutline = true;
    car.add(ring);
  }
}

/** Whether createCar() currently returns glTF models (vs the fallback). */
export function carModelsReady(): boolean {
  return templates.size > 0;
}

/**
 * A car for the map. Wheels (glTF only) are listed in `userData.wheels` with
 * `userData.wheelRadiusM`, so the engine can turn them as the car moves.
 */
export function createCar(
  vehicleClass: string | null | undefined,
  assigned: boolean,
  paintColor?: string | null
): THREE.Group {
  const color = paintColor
    ? new THREE.Color(paintColor).getHex()
    : assigned
      ? ASSIGNED_COLOR
      : BODY_COLORS[vehicleClass ?? ''] ?? BODY_COLORS.fem_economy;

  const name = MODEL_FOR_CLASS[vehicleClass ?? ''] ?? 'sedan';
  const tpl = templates.get(name) ?? templates.get('sedan');
  if (tpl) {
    const car = new THREE.Group();
    addShadowAndRing(car, assigned);
    const body = tpl.root.clone(true);
    const material = paintedMaterial(name, tpl, color);
    const wheels: THREE.Object3D[] = [];
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        if (!mesh.userData.outline) mesh.material = material;
        mesh.frustumCulled = false;
      }
      // Outermost wheel object only (a node and its mesh can share the name).
      if (o.name.startsWith('wheel') && !o.parent?.name.startsWith('wheel')) {
        o.userData.baseQuaternion = o.quaternion.clone();
        wheels.push(o);
      }
    });
    car.add(body);
    addTaxiParts(car, tpl.heightM, -CAR_LENGTH_M / 2, tpl.heightM * 0.42, assigned);
    car.userData.wheels = wheels;
    car.userData.wheelRadiusM = tpl.wheelRadiusM;
    car.matrixAutoUpdate = false;
    return car;
  }
  return createProceduralCar(color, assigned);
}

function createProceduralCar(color: number, assigned: boolean): THREE.Group {
  const s = getShared();
  const paint = bodyMaterial(color);
  const car = new THREE.Group();
  addShadowAndRing(car, assigned);

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
  addOutlines(car);
  addTaxiParts(car, 1.54, -CAR_LENGTH_M / 2, 0.74, assigned);
  car.matrixAutoUpdate = false;
  return car;
}

export function createLights(): THREE.Object3D[] {
  // World space is MapLibre's mercator frame (x east, y south, z up).
  // Toon shading reads the key light through its 3-step ramp; the
  // hemisphere fill keeps shadow sides colourful rather than muddy.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa3b2, 1.35);
  hemi.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
  sun.position.set(0.45, 0.55, 1);
  return [hemi, sun];
}
