// Simulation for the on-device backend: the ambient fleet of cars on the home
// map, and the timeline a booked ride follows (driver found, drives over,
// waits, takes the rider, drops them off). Everything is a pure function of the
// clock, so it needs no timers and stays correct if the app is backgrounded.

import { VEHICLES, type RideRec, type RideDriverInfo, type RideSim, type RideStatus } from './db';
import { buildLoop, buildRoute, haversineKm, offsetM, Path, seeded, type LatLng, type PathPoint } from './geo';
import { fetchRoadInBackground, roadServiceEnabled } from './roads';

/** Demo pacing. A real trip is faster than real life so a demo isn't a half-hour wait. */
export const TIMING = {
  assignMs: 4_000, // searching -> driver assigned
  acceptMs: 3_000, // assigned -> driver accepted, heading over
  approachMs: 30_000, // driver drives to the pickup
  waitAtPickupMs: 6_000, // driver waits, then the rider's PIN is checked
  pinMs: 2_000,
  minTripMs: 30_000,
  maxTripMs: 180_000,
  tripSpeedMps: 22, // demo driving speed along the route
  cashConfirmMs: 4_000, // simulated driver takes the cash
  offerDelayMs: 6_000, // driver goes online -> first simulated request
  offerGapMs: 12_000, // between simulated requests
  offerExpireMs: 45_000, // an unanswered request lapses
  ambientRadiusKm: 5,
  trailWindowMs: 8_000,
  trailStepMs: 500,
};

// ---------------------------------------------------------------- people

const DRIVERS: [string, string, string, string][] = [
  ['Jean-Claude Habimana', 'fem_economy', 'Toyota Corolla', 'White'],
  ['Aline Mukamana', 'fem_comfort', 'Toyota RAV4', 'Silver'],
  ['Patrick Niyonzima', 'fem_economy', 'Suzuki Swift', 'Blue'],
  ['Diane Uwimana', 'fem_economy', 'Hyundai Elantra', 'Black'],
  ['Eric Nshimiyimana', 'fem_xl', 'Toyota Noah', 'White'],
  ['Grace Ingabire', 'fem_comfort', 'Kia Sportage', 'Grey'],
  ['Olivier Mugabo', 'fem_economy', 'Toyota Premio', 'Silver'],
  ['Claudine Umutoni', 'fem_economy', 'Toyota Vitz', 'Red'],
  ['Emmanuel Bizimana', 'fem_comfort', 'Toyota Harrier', 'Black'],
  ['Samuel Kayitare', 'fem_xl', 'Toyota Hiace', 'White'],
];

export const RIDER_NAMES = [
  'Marie Uwase', 'Eric Ndayishimiye', 'Divine Mutoni', 'Robert Gasana', 'Liliane Ishimwe',
  'Gilbert Habiyaremye', 'Vestine Mukandayisenga', 'Honore Twagirayezu', 'Gisele Umuhoza', 'Janvier Kamanzi',
];

const CAR_COLORS = ['White', 'White', 'Silver', 'Silver', 'Grey', 'Black', 'Blue', 'Red'];

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

export function driverInfoFor(seed: string, vehicleId: string): RideDriverInfo {
  const rnd = seeded(`driver:${seed}`);
  const pool = DRIVERS.filter((d) => d[1] === vehicleId);
  const [name, , model, color] = pick(pool.length ? pool : DRIVERS, rnd);
  const letters = 'ABCDEFGH';
  return {
    name,
    phone: `+250 78${Math.floor(rnd() * 10)} ${String(Math.floor(rnd() * 900) + 100)} ${String(Math.floor(rnd() * 900) + 100)}`,
    rating: Math.round((4.6 + rnd() * 0.4) * 10) / 10,
    vehicleModel: model,
    vehicleColor: color,
    licensePlate: `RA${letters[Math.floor(rnd() * 8)]} ${Math.floor(rnd() * 900) + 100} ${letters[Math.floor(rnd() * 8)]}`,
  };
}

export function riderNameFor(seed: string): string {
  return pick(RIDER_NAMES, seeded(`rider:${seed}`));
}

// ------------------------------------------------------------ ambient fleet

export type TrailSample = [number, number, number, number | null];

export interface AmbientCar {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  vehicleId: string;
  color: string;
  trail: TrailSample[];
}

interface CarPlan {
  id: string;
  path: Path;
  /** Real roads are driven back and forth; the fallback block loop is driven round. */
  bounce: boolean;
  speed: number;
  phase: number;
  vehicleId: string;
  color: string;
}

const CELL_DEG = 0.03; // ~3.3 km squares, each with its own cars
const CARS_PER_CELL = 3;
const plans = new Map<string, CarPlan>();
// Real roads for each cell, filled in the background when a routing service is available.
const cellRoads = new Map<string, Path[]>();
const warmedAt = new Map<string, number>();
const REWARM_MS = 2 * 60 * 1000;
const cellKey = (i: number, j: number) => `${i}:${j}`;

/** Forgets all street routes and car plans (used by tests; also after switching routing service). */
export function resetAmbientRoads(): void {
  cellRoads.clear();
  warmedAt.clear();
  plans.clear();
}

function carPlan(i: number, j: number, k: number): CarPlan {
  const road = cellRoads.get(cellKey(i, j))?.[k];
  const key = `${i}:${j}:${k}${road ? ':road' : ''}`;
  let plan = plans.get(key);
  if (plan) return plan;
  const rnd = seeded(`car:${i}:${j}:${k}`);
  const center: LatLng = {
    latitude: (i + 0.2 + rnd() * 0.6) * CELL_DEG,
    longitude: (j + 0.2 + rnd() * 0.6) * CELL_DEG,
  };
  const path = road ?? buildLoop(center, 250 + rnd() * 450, 200 + rnd() * 300, 60);
  plan = {
    id: `car-${i}:${j}:${k}`,
    path,
    bounce: Boolean(road),
    speed: 6 + rnd() * 4,
    phase: rnd() * path.lengthM,
    vehicleId: VEHICLES[Math.floor(rnd() * VEHICLES.length)].id,
    color: pick(CAR_COLORS, rnd),
  };
  if (plans.size > 400) plans.clear();
  plans.set(key, plan);
  return plan;
}

function planPoint(plan: CarPlan, t: number): PathPoint {
  const d = plan.phase + (plan.speed * t) / 1000;
  return plan.bounce ? plan.path.atPingPong(d) : plan.path.atLoop(d);
}

/**
 * Asks the routing service (in the background, never blocking a screen) for a
 * real street route per car in this cell, so traffic drives on roads instead of
 * over buildings. Cars switch from the block loop to their road once it arrives.
 */
function warmRoads(i: number, j: number, now: number): void {
  const key = cellKey(i, j);
  const last = warmedAt.get(key);
  if (!roadServiceEnabled() || (last != null && now - last < REWARM_MS)) return;
  if ((cellRoads.get(key)?.filter(Boolean).length ?? 0) >= CARS_PER_CELL) return;
  warmedAt.set(key, now);
  for (let k = 0; k < CARS_PER_CELL; k++) {
    const rnd = seeded(`road:${key}:${k}`);
    const from: LatLng = {
      latitude: (i + 0.15 + rnd() * 0.7) * CELL_DEG,
      longitude: (j + 0.15 + rnd() * 0.7) * CELL_DEG,
    };
    const angle = rnd() * Math.PI * 2;
    const metres = 1500 + rnd() * 1500;
    const to = offsetM(from, Math.cos(angle) * metres, Math.sin(angle) * metres);
    void fetchRoadInBackground(from, to).then((path) => {
      if (!path || path.lengthM < 300) return;
      const roads = cellRoads.get(key) ?? [];
      roads[k] = path;
      cellRoads.set(key, roads);
      for (const planKey of [...plans.keys()]) if (planKey.startsWith(`${key}:`)) plans.delete(planKey);
    });
  }
}

/** Cars cruising near a point (the phone's GPS position in a real install). */
export function ambientCars(center: LatLng, now: number, sinceMs?: number): AmbientCar[] {
  const ci = Math.floor(center.latitude / CELL_DEG);
  const cj = Math.floor(center.longitude / CELL_DEG);
  // Roads for the cell under the phone first, then its four neighbours.
  for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) warmRoads(ci + di, cj + dj, now);
  const window = Math.min(TIMING.trailWindowMs, Math.max(1_000, sinceMs != null ? now - sinceMs : TIMING.trailWindowMs));
  const out: (AmbientCar & { km: number })[] = [];
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let k = 0; k < CARS_PER_CELL; k++) {
        const plan = carPlan(i, j, k);
        const here = planPoint(plan, now);
        const km = haversineKm(center, here);
        if (km > TIMING.ambientRadiusKm) continue;
        const trail: TrailSample[] = [];
        for (let t = now - window; t <= now; t += TIMING.trailStepMs) {
          const p = planPoint(plan, t);
          trail.push([Math.round(t), p.latitude, p.longitude, Math.round(p.heading)]);
        }
        out.push({
          id: plan.id,
          latitude: here.latitude,
          longitude: here.longitude,
          heading: Math.round(here.heading),
          vehicleId: plan.vehicleId,
          color: plan.color,
          trail,
          km,
        });
      }
    }
  }
  return out.sort((a, b) => a.km - b.km).slice(0, 40).map(({ km: _km, ...car }) => car);
}

/** Minutes for the nearest ambient car of each vehicle class to reach a point. */
export function pickupEtas(pickup: LatLng, now: number): Record<string, number> {
  const etas: Record<string, number> = {};
  for (const car of ambientCars(pickup, now, 1_000)) {
    // City driving ~ 6 m/s once the detour factor of real streets is included.
    const minutes = Math.max(1, Math.round((haversineKm(pickup, car) * 1000 * 1.3) / 6 / 60));
    if (etas[car.vehicleId] == null || minutes < etas[car.vehicleId]) etas[car.vehicleId] = minutes;
  }
  return etas;
}

// ------------------------------------------------------------ ride timeline

export interface Timeline {
  tAssign: number;
  tAccept: number;
  tArrive: number;
  tPin: number;
  tStart: number;
  tEnd: number;
}

export function timeline(sim: RideSim): Timeline {
  const tAssign = sim.t0 + TIMING.assignMs;
  const tAccept = tAssign + TIMING.acceptMs;
  const tArrive = tAccept + TIMING.approachMs;
  const tPin = tArrive + TIMING.waitAtPickupMs;
  const tStart = tPin + TIMING.pinMs;
  return { tAssign, tAccept, tArrive, tPin, tStart, tEnd: tStart + sim.tripMs };
}

/** The status a passenger-booked ride has reached by `now`, ignoring cancellation and payment. */
export function statusAt(sim: RideSim, now: number): RideStatus {
  const tl = timeline(sim);
  if (now < sim.t0) return 'scheduled';
  if (now < tl.tAssign) return 'searchingDriver';
  if (now < tl.tAccept) return 'driverAssigned';
  if (now < tl.tArrive) return 'driverArriving';
  if (now < tl.tPin) return 'driverArrived';
  if (now < tl.tStart) return 'pinVerified';
  if (now < tl.tEnd) return 'inProgress';
  return 'paymentPending';
}

export function tripDurationMs(distanceKm: number): number {
  return Math.min(TIMING.maxTripMs, Math.max(TIMING.minTripMs, (distanceKm * 1000 * 1000) / TIMING.tripSpeedMps));
}

/** Where the simulated car starts, a few hundred metres from the pickup. */
export function approachStartFor(pickup: LatLng, seed: string): LatLng {
  const rnd = seeded(`approach:${seed}`);
  const angle = rnd() * Math.PI * 2;
  const metres = 350 + rnd() * 150;
  return offsetM(pickup, Math.cos(angle) * metres, Math.sin(angle) * metres);
}

const smooth = (f: number) => {
  const c = Math.min(1, Math.max(0, f));
  return c * c * (3 - 2 * c); // gentle start and stop rather than an instant jump to speed
};

const ridePaths = new Map<string, { approach: Path; trip: Path }>();

/** The roads a ride drives: the geometry saved at booking, else the local route. */
export function ridePathsOf(ride: RideRec): { approach: Path; trip: Path } {
  let hit = ridePaths.get(ride.id);
  if (hit) return hit;
  const sim = ride.sim!;
  const pickup: LatLng = { latitude: ride.pickup.latitude, longitude: ride.pickup.longitude };
  const destination: LatLng = { latitude: ride.destination.latitude, longitude: ride.destination.longitude };
  hit = {
    approach: sim.approachCoords ? new Path(sim.approachCoords) : buildRoute(sim.approachStart, pickup),
    trip: sim.tripCoords ? new Path(sim.tripCoords) : buildRoute(pickup, destination),
  };
  if (ridePaths.size > 50) ridePaths.clear();
  ridePaths.set(ride.id, hit);
  return hit;
}

/** Call after a ride's route changes (new destination). */
export function forgetRidePaths(rideId: string): void {
  ridePaths.delete(rideId);
}

/** The simulated car's position at time `t`, or null before a driver is found. */
export function carPositionAt(ride: RideRec, t: number): PathPoint | null {
  const sim = ride.sim;
  if (!sim) return null;
  const tl = timeline(sim);
  if (t < tl.tAssign) return null;
  const pickup: LatLng = { latitude: ride.pickup.latitude, longitude: ride.pickup.longitude };
  const { approach, trip } = ridePathsOf(ride);
  if (t < tl.tArrive) return approach.at(smooth((t - tl.tAccept) / TIMING.approachMs) * approach.lengthM);
  if (t < tl.tStart) {
    const end = approach.at(approach.lengthM);
    return { latitude: pickup.latitude, longitude: pickup.longitude, heading: end.heading };
  }
  return trip.at(smooth((t - tl.tStart) / sim.tripMs) * trip.lengthM);
}

/** Recent breadcrumbs of the ride's car, in the shape the map animates from. */
export function carTrail(ride: RideRec, now: number): TrailSample[] {
  if (!ride.sim) return [];
  const first = timeline(ride.sim).tAssign;
  const trail: TrailSample[] = [];
  for (let t = now - TIMING.trailWindowMs; t <= now; t += TIMING.trailStepMs) {
    if (t < first) continue;
    const p = carPositionAt(ride, t);
    if (p) trail.push([Math.round(t), p.latitude, p.longitude, Math.round(p.heading)]);
  }
  return trail;
}
