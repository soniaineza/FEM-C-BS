// Geography for the on-device backend: distances, drivable-looking paths and a
// built-in gazetteer for Rwanda, so place search, reverse lookup and routing
// work with no geocoder or OSRM server. Pure functions, no React Native imports.

export interface LatLng {
  latitude: number;
  longitude: number;
}

export const KIGALI: LatLng = { latitude: -1.9441, longitude: 30.0619 };

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Compass bearing 0-360 travelling from a to b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Moves a point by metres east/north (small distances only). */
export function offsetM(p: LatLng, eastM: number, northM: number): LatLng {
  return {
    latitude: p.latitude + northM / 111_320,
    longitude: p.longitude + eastM / (111_320 * Math.cos(toRad(p.latitude))),
  };
}

export interface PathPoint extends LatLng {
  heading: number;
}

/** A polyline you can ask "where is a vehicle after driving d metres?". */
export class Path {
  readonly coords: [number, number][]; // [lng, lat], the order maps and OSRM use
  readonly lengthM: number;
  private readonly cum: number[] = [0];

  constructor(coords: [number, number][]) {
    this.coords = coords;
    for (let i = 1; i < coords.length; i++) {
      const a = { latitude: coords[i - 1][1], longitude: coords[i - 1][0] };
      const b = { latitude: coords[i][1], longitude: coords[i][0] };
      this.cum.push(this.cum[i - 1] + haversineKm(a, b) * 1000);
    }
    this.lengthM = this.cum[this.cum.length - 1];
  }

  /** Position and heading after `distM` metres (clamped to the path ends). */
  at(distM: number): PathPoint {
    const n = this.coords.length;
    if (n === 1 || this.lengthM === 0) {
      return { latitude: this.coords[0][1], longitude: this.coords[0][0], heading: 0 };
    }
    const d = Math.min(Math.max(distM, 0), this.lengthM);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo];
    const f = seg > 0 ? (d - this.cum[lo]) / seg : 0;
    const a = { latitude: this.coords[lo][1], longitude: this.coords[lo][0] };
    const b = { latitude: this.coords[hi][1], longitude: this.coords[hi][0] };
    return {
      latitude: a.latitude + (b.latitude - a.latitude) * f,
      longitude: a.longitude + (b.longitude - a.longitude) * f,
      heading: bearingDeg(a, b),
    };
  }

  /** Same position, but distances wrap around (for closed loops). */
  atLoop(distM: number): PathPoint {
    return this.at(this.lengthM > 0 ? ((distM % this.lengthM) + this.lengthM) % this.lengthM : 0);
  }

  /** Drives to the end and back again; the heading flips on the way back (for a road, not a loop). */
  atPingPong(distM: number): PathPoint {
    if (this.lengthM <= 0) return this.at(0);
    const period = this.lengthM * 2;
    const d = ((distM % period) + period) % period;
    if (d <= this.lengthM) return this.at(d);
    const back = this.at(period - d);
    return { ...back, heading: (back.heading + 180) % 360 };
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [0,1) from a string seed. */
export function seeded(seed: string): () => number {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Real road geometry, when a routing service has supplied it (see roads.ts).
// buildRoute() prefers it, so quotes, tracking and history all follow the streets.
const roadPaths = new Map<string, Path>();
const roadKey = (a: LatLng, b: LatLng) =>
  `${a.latitude.toFixed(4)},${a.longitude.toFixed(4)}>${b.latitude.toFixed(4)},${b.longitude.toFixed(4)}`;

export function rememberRoad(a: LatLng, b: LatLng, path: Path): void {
  if (roadPaths.size > 300) roadPaths.delete(roadPaths.keys().next().value as string);
  roadPaths.set(roadKey(a, b), path);
}

export function hasRoad(a: LatLng, b: LatLng): boolean {
  return roadPaths.has(roadKey(a, b));
}

export function forgetRoads(): void {
  roadPaths.clear();
}

/**
 * The route between two points: real roads when known, otherwise a road-like
 * curve with no routing engine: a gentle
 * quadratic curve (so it doesn't read as a ruler line), identical every time
 * for the same endpoints so quotes, tracking and history all agree.
 */
export function buildRoute(from: LatLng, to: LatLng): Path {
  const road = roadPaths.get(roadKey(from, to));
  if (road) return road;
  const straightKm = haversineKm(from, to);
  const steps = Math.min(90, Math.max(12, Math.round(straightKm * 10)));
  const rnd = seeded(`${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}>${to.latitude.toFixed(4)},${to.longitude.toFixed(4)}`);
  const bend = (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.1);
  const dx = to.longitude - from.longitude;
  const dy = to.latitude - from.latitude;
  const cx = (from.longitude + to.longitude) / 2 - dy * bend;
  const cy = (from.latitude + to.latitude) / 2 + dx * bend;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    coords.push([
      u * u * from.longitude + 2 * u * t * cx + t * t * to.longitude,
      u * u * from.latitude + 2 * u * t * cy + t * t * to.latitude,
    ]);
  }
  return new Path(coords);
}

/** Closed rounded-rectangle "block loop" for ambient cars to cruise around. */
export function buildLoop(center: LatLng, halfEastM: number, halfNorthM: number, cornerM: number): Path {
  const r = Math.min(cornerM, halfEastM, halfNorthM);
  const pts: [number, number][] = [];
  const corner = (cx: number, cy: number, startDeg: number) => {
    for (let k = 0; k <= 4; k++) {
      const a = toRad(startDeg + k * 22.5);
      const p = offsetM(center, cx + r * Math.cos(a), cy + r * Math.sin(a));
      pts.push([p.longitude, p.latitude]);
    }
  };
  // Corners are laid down counter-clockwise (NE, NW, SW, SE) and the result is
  // reversed below: cars circulate clockwise, keeping the block on their right
  // as they do when driving on the right.
  corner(halfEastM - r, halfNorthM - r, 0);
  corner(-(halfEastM - r), halfNorthM - r, 90);
  corner(-(halfEastM - r), -(halfNorthM - r), 180);
  corner(halfEastM - r, -(halfNorthM - r), 270);
  pts.push(pts[0]);
  return new Path(pts.reverse()); // reversed => clockwise
}

// ---------------------------------------------------------------------------
// Gazetteer: real Rwandan places, so search works with no internet.
// [name, latitude, longitude, town]
type PlaceRow = [string, number, number, string];

const KGL = 'Kigali';
export const PLACES: PlaceRow[] = [
  ['Kigali City Tower', -1.9447, 30.0612, KGL],
  ['Kigali Convention Centre', -1.9536, 30.0925, KGL],
  ['Kimironko Market', -1.9492, 30.1262, KGL],
  ['Nyabugogo Bus Park', -1.9393, 30.0447, KGL],
  ['Amahoro Stadium, Remera', -1.9557, 30.1183, KGL],
  ['Kigali International Airport', -1.9686, 30.1395, KGL],
  ['Kigali Genocide Memorial, Gisozi', -1.9306, 30.0608, KGL],
  ['Nyamirambo', -1.9778, 30.0446, KGL],
  ['Sonatubes, Kicukiro', -1.9658, 30.1043, KGL],
  ['MTN Centre, Nyarutarama', -1.9403, 30.1033, KGL],
  ['Kacyiru', -1.9393, 30.0864, KGL],
  ['King Faisal Hospital', -1.9443, 30.0931, KGL],
  ['Gikondo', -1.9756, 30.0751, KGL],
  ['Kibagabaga', -1.9315, 30.118, KGL],
  ['Giporoso, Remera', -1.96, 30.109, KGL],
  ['University of Rwanda, Nyarugenge', -1.9591, 30.0636, KGL],
  ['Kimihurura', -1.954, 30.098, KGL],
  ['Kicukiro Centre', -1.9745, 30.103, KGL],
  ['Remera Taxi Park', -1.9567, 30.1143, KGL],
  ['Kanombe', -1.9728, 30.1413, KGL],
  ['Kabeza', -1.9678, 30.1275, KGL],
  ['Kinamba', -1.9338, 30.069, KGL],
  ['Muhima', -1.942, 30.0545, KGL],
  ['Biryogo', -1.97, 30.05, KGL],
  ['Kimisagara', -1.952, 30.046, KGL],
  ['Rebero', -1.99, 30.07, KGL],
  ['Kagarama', -1.986, 30.106, KGL],
  ['Niboye', -1.979, 30.113, KGL],
  ['Kibagabaga Hospital', -1.9275, 30.111, KGL],
  ['Gacuriro', -1.915, 30.093, KGL],
  ['Kinyinya', -1.912, 30.106, KGL],
  ['Batsinda', -1.902, 30.077, KGL],
  ['Kiyovu', -1.953, 30.062, KGL],
  ['Nyabisindu', -1.94, 30.116, KGL],
  ['Gisozi', -1.923, 30.07, KGL],
  ['Kabuga Road, Masaka', -1.959, 30.156, KGL],
  ['Kigali Heights', -1.9535, 30.0928, KGL],
  ['Kigali Arena, Remera', -1.9539, 30.1064, KGL],
  ['Radisson Blu Hotel & Convention Centre', -1.9532, 30.0919, KGL],
  ['Marriott Hotel Kigali', -1.9525, 30.0616, KGL],
  ['Serena Hotel Kigali', -1.9531, 30.0637, KGL],
  ['Nyarugenge Market (Kigali Main Market)', -1.9497, 30.0587, KGL],
  ['CHUK University Teaching Hospital', -1.9539, 30.0577, KGL],
  ['Rwanda Military Hospital, Kanombe', -1.9738, 30.1263, KGL],
  ['Camp Kigali', -1.9506, 30.0641, KGL],
  ['Kigali Public Library, Kacyiru', -1.9444, 30.0881, KGL],
  ['Parliament of Rwanda, Kimihurura', -1.9528, 30.0869, KGL],
  ['Kigali Cultural Village', -1.9601, 30.0959, KGL],
  ['Norrsken House Kigali', -1.9483, 30.0625, KGL],
  ['Inema Arts Center, Kacyiru', -1.9349, 30.0889, KGL],
  ['Nyandungu Eco-Tourism Park', -1.9862, 30.1361, KGL],
  ['Kigali Golf Resort, Nyarutarama', -1.9272, 30.1029, KGL],
  ['Gikondo Expo Ground', -1.9761, 30.0798, KGL],
  ['Kicukiro Sonatube Roundabout', -1.9657, 30.1039, KGL],
  ['Kimironko Bus Terminal', -1.9509, 30.1257, KGL],
  ['Gasabo District Office', -1.9137, 30.0972, KGL],
  ['Nyarutarama', -1.9351, 30.1064, KGL],
  ['Remera', -1.9559, 30.1131, KGL],
  ['Kagugu', -1.9075, 30.0739, KGL],
  ['Masaka', -2.0053, 30.1665, KGL],
  ['Bugesera Airport (Kigali Bugesera)', -2.1735, 30.1868, 'Bugesera'],
  ['Rwamagana Town', -1.9487, 30.4347, 'Rwamagana'],
  ['Muhanga Town (Gitarama)', -2.0844, 29.7566, 'Muhanga'],
  ['Huye (Butare) Town', -2.5967, 29.7394, 'Huye'],
  ['National Museum of Rwanda, Huye', -2.6016, 29.7383, 'Huye'],
  ['Nyanza (King’s Palace Museum)', -2.3507, 29.7429, 'Nyanza'],
  ['Musanze Town (Ruhengeri)', -1.4998, 29.6347, 'Musanze'],
  ['Kinigi (Volcanoes National Park HQ)', -1.4426, 29.5903, 'Musanze'],
  ['Rubavu (Gisenyi) Town', -1.6774, 29.2585, 'Rubavu'],
  ['Rusizi (Cyangugu) Town', -2.4846, 28.9075, 'Rusizi'],
  ['Nyungwe Forest National Park', -2.4903, 29.2117, 'Nyamasheke'],
  ['Kibuye (Karongi) Town', -2.0603, 29.3494, 'Karongi'],
  ['Byumba (Gicumbi) Town', -1.5764, 30.0675, 'Gicumbi'],
  ['Nyagatare Town', -1.2977, 30.3271, 'Nyagatare'],
  ['Akagera National Park, Kabarondo Gate', -1.8672, 30.7314, 'Kayonza'],
  ['Kayonza Town', -1.8849, 30.6469, 'Kayonza'],
  ['Kibungo (Ngoma) Town', -2.1552, 30.5443, 'Ngoma'],
];

export function normalise(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bcenter\b/g, 'centre')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const label = (p: PlaceRow) => (p[0].toLowerCase().includes(p[3].toLowerCase()) ? `${p[0]}, Rwanda` : `${p[0]}, ${p[3]}, Rwanda`);

export interface FoundPlace {
  address: string;
  latitude: number;
  longitude: number;
}

/** Forward geocoding over the gazetteer: name-prefix and word matches rank first. */
export function searchPlaces(query: string, near?: LatLng | null): FoundPlace[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const words = q.split(' ');
  const scored: { row: PlaceRow; score: number }[] = [];
  for (const row of PLACES) {
    const name = normalise(row[0]);
    const town = normalise(row[3]);
    const nameWords = name.split(' ');
    let score = 0;
    if (name === q) score += 10;
    else if (name.startsWith(q)) score += 6;
    else if (name.includes(q)) score += 4;
    for (const w of words) {
      if (nameWords.includes(w)) score += 2;
      else if (nameWords.some((nw) => nw.startsWith(w))) score += 1.5;
      else if (town.startsWith(w)) score += 0.5;
      else score -= 3; // a word that matches nothing rules the place out
    }
    if (score <= 0) continue;
    if (near) score += Math.max(0, 1 - haversineKm(near, { latitude: row[1], longitude: row[2] }) / 30);
    scored.push({ row, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ row }) => ({ address: label(row), latitude: row[1], longitude: row[2] }));
}

const RWANDA_BOX = { minLat: -2.85, maxLat: -1.04, minLng: 28.85, maxLng: 30.9 };

/** Reverse geocoding: the nearest known place, or plain coordinates. */
export function reversePlace(p: LatLng): string {
  let best: PlaceRow | null = null;
  let bestKm = Infinity;
  for (const row of PLACES) {
    const km = haversineKm(p, { latitude: row[1], longitude: row[2] });
    if (km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  if (best && bestKm <= 0.4) return label(best);
  if (best && bestKm <= 6) return `Near ${label(best)}`;
  const inRwanda =
    p.latitude >= RWANDA_BOX.minLat && p.latitude <= RWANDA_BOX.maxLat &&
    p.longitude >= RWANDA_BOX.minLng && p.longitude <= RWANDA_BOX.maxLng;
  const coords = `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;
  return inRwanda ? `Rwanda (${coords})` : `Pinned location (${coords})`;
}
