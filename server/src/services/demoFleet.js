const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { getRoadRoute } = require('./routing');
const { recordSample, nowMs } = require('./driverTrails');
const { bearingDegrees, bearingDiffDegrees, haversineKm } = require('../utils/distance');
const {
  acceptRide,
  markArrived,
  verifyPin,
  completeTrip,
  updateDriverLocation,
} = require('./rideDriverOps');
const { confirmCashPayment } = require('./payments');

// Demo fleet (DEMO_FLEET=1, never in production): simulated drivers that
// drive real Kigali roads. Idle cars cruise between real places along OSRM
// road routes; when the matcher assigns one a ride it accepts, drives to the
// pickup, waits for the rider, starts the trip with the ride PIN, drives to
// the destination, completes it and (for cash) confirms the cash — through
// the same rideDriverOps/payments functions a real driver's app calls, so
// matching, pricing, payments and tracking run exactly as in production.
//
// Motion model, per car:
//  - Kinematics integrated in 250 ms sub-steps; each sub-step is recorded to
//    the trail (4 Hz), so the map replays cars along the street geometry.
//  - Speed targets come from OSRM's per-segment road speeds scaled to city
//    driving, capped by corner sharpness and by the car ahead (following
//    distance), with smooth acceleration and braking — never an instant stop.
//  - Re-routing never interrupts motion: the next route is requested from a
//    point a few seconds ahead on the current path, and the car switches to
//    it when it gets there.

const TICK_MS = 1000;
const SUB_STEP_MS = 250;
const RIDE_POLL_EVERY_TICKS = 2;
const ACCEL = 1.6; // m/s²
const BRAKE = 2.6; // m/s² comfortable
const HARD_BRAKE = 4.5; // m/s² when the car ahead is close
const MIN_GAP_M = 7; // bumper-to-bumper-ish stop distance behind another car
const FOLLOW_RANGE_M = 30;
const MAX_BLOCKED_MS = 12_000; // then drive around (a parked car, a pickup)
const LANDMARK_ROUTE_TTL = 6 * 60 * 60 * 1000;
const PATH_CACHE_MAX = 1600;

// Real Kigali places (approximate coordinates; OSRM snaps them to the
// nearest road).
const KIGALI_PLACES = [
  ['Kigali City Tower', -1.9447, 30.0612],
  ['Kigali Convention Centre', -1.9536, 30.0925],
  ['Kimironko Market', -1.9492, 30.1262],
  ['Nyabugogo Bus Park', -1.9393, 30.0447],
  ['Amahoro Stadium, Remera', -1.9557, 30.1183],
  ['Kigali International Airport', -1.9686, 30.1395],
  ['Kigali Genocide Memorial, Gisozi', -1.9306, 30.0608],
  ['Nyamirambo', -1.9778, 30.0446],
  ['Sonatubes, Kicukiro', -1.9658, 30.1043],
  ['MTN Centre, Nyarutarama', -1.9403, 30.1033],
  ['Kacyiru', -1.9393, 30.0864],
  ['King Faisal Hospital', -1.9443, 30.0931],
  ['Gikondo', -1.9756, 30.0751],
  ['Kibagabaga', -1.9315, 30.1180],
  ['Giporoso, Remera', -1.9600, 30.1090],
  ['University of Rwanda, Nyarugenge', -1.9591, 30.0636],
  ['Kimihurura', -1.9540, 30.0980],
  ['Kicukiro Centre', -1.9745, 30.1030],
  ['Remera Taxi Park', -1.9567, 30.1143],
  ['Kanombe', -1.9728, 30.1413],
  ['Kabeza', -1.9678, 30.1275],
  ['Kinamba', -1.9338, 30.0690],
  ['Muhima', -1.9420, 30.0545],
  ['Biryogo', -1.9700, 30.0500],
  ['Kimisagara', -1.9520, 30.0460],
  ['Rebero', -1.9900, 30.0700],
  ['Kagarama', -1.9860, 30.1060],
  ['Niboye', -1.9790, 30.1130],
  ['Kibagabaga Hospital', -1.9275, 30.1110],
  ['Gacuriro', -1.9150, 30.0930],
  ['Kinyinya', -1.9120, 30.1060],
  ['Batsinda', -1.9020, 30.0770],
  ['Kiyovu', -1.9530, 30.0620],
  ['Nyabisindu', -1.9400, 30.1160],
  ['Gisozi', -1.9230, 30.0700],
  ['Kabuga Road, Masaka', -1.9590, 30.1560],
];

// The original 32 drivers keep their names/phones (existing rows are
// updated in place); the rest of the fleet is generated deterministically.
const FLEET = [
  ['Jean-Claude Habimana', 'fem_economy', 'Toyota Corolla', 'White'],
  ['Aline Mukamana', 'fem_comfort', 'Toyota RAV4', 'Silver'],
  ['Patrick Niyonzima', 'fem_economy', 'Suzuki Swift', 'Blue'],
  ['Diane Uwimana', 'fem_economy', 'Hyundai Elantra', 'Black'],
  ['Eric Nshimiyimana', 'fem_xl', 'Toyota Noah', 'White'],
  ['Grace Ingabire', 'fem_comfort', 'Kia Sportage', 'Grey'],
  ['Olivier Mugabo', 'fem_economy', 'Toyota Premio', 'Silver'],
  ['Claudine Umutoni', 'fem_economy', 'Toyota Vitz', 'Red'],
  ['Emmanuel Bizimana', 'fem_comfort', 'Toyota Harrier', 'Black'],
  ['Josiane Iradukunda', 'fem_economy', 'Nissan Note', 'White'],
  ['Samuel Kayitare', 'fem_xl', 'Toyota Hiace', 'White'],
  ['Chantal Nyirahabimana', 'fem_economy', 'Toyota Corolla', 'Grey'],
  ['David Ndayisenga', 'fem_comfort', 'Mitsubishi Outlander', 'Blue'],
  ['Esther Uwase', 'fem_economy', 'Hyundai i10', 'Silver'],
  ['Innocent Hakizimana', 'fem_economy', 'Toyota Allion', 'White'],
  ['Solange Mukeshimana', 'fem_comfort', 'Toyota Prado', 'Black'],
  ['Beatrice Uwamahoro', 'fem_economy', 'Toyota Corolla', 'Blue'],
  ['Claude Nkurunziza', 'fem_comfort', 'Toyota RAV4', 'White'],
  ['Sandrine Mutesi', 'fem_economy', 'Hyundai i10', 'Red'],
  ['Fabrice Niyonsenga', 'fem_xl', 'Toyota Noah', 'Silver'],
  ['Clarisse Uwingabire', 'fem_economy', 'Suzuki Swift', 'Grey'],
  ['Thierry Rukundo', 'fem_comfort', 'Kia Sportage', 'Black'],
  ['Nadine Irakoze', 'fem_economy', 'Toyota Vitz', 'White'],
  ['Didier Manzi', 'fem_economy', 'Nissan Note', 'Silver'],
  ['Alice Umutesi', 'fem_comfort', 'Toyota Harrier', 'Blue'],
  ['Pascal Rwema', 'fem_economy', 'Hyundai Elantra', 'Grey'],
  ['Ange Uwimana', 'fem_xl', 'Toyota Hiace', 'White'],
  ['Yves Nshimiyimana', 'fem_economy', 'Toyota Premio', 'Black'],
  ['Christelle Mukiza', 'fem_comfort', 'Mitsubishi Outlander', 'Silver'],
  ['Kevin Niyigena', 'fem_economy', 'Toyota Allion', 'Blue'],
  ['Aurore Mukamana', 'fem_economy', 'Suzuki Swift', 'White'],
  ['Mugisha Habumuremyi', 'fem_comfort', 'Toyota Prado', 'Grey'],
];

const FIRST_NAMES = [
  'Jean', 'Marie', 'Eric', 'Divine', 'Robert', 'Liliane', 'Gilbert', 'Vestine', 'Honore', 'Gisele',
  'Janvier', 'Odette', 'Theogene', 'Florence', 'Alexis', 'Jeanne', 'Celestin', 'Immaculee', 'Faustin', 'Pacifique',
  'Arsene', 'Joyeuse', 'Elie', 'Ariane', 'Moise', 'Delphine', 'Gad', 'Sonia', 'Bosco', 'Keza',
];
const LAST_NAMES = [
  'Mugisha', 'Uwera', 'Habiyaremye', 'Mukandayisenga', 'Twagirayezu', 'Umuhoza', 'Nsengiyumva', 'Ishimwe',
  'Ndagijimana', 'Uwamariya', 'Byiringiro', 'Munyaneza', 'Kamanzi', 'Niyonkuru', 'Gasana', 'Mutoni',
];
const MODELS = {
  fem_economy: ['Toyota Corolla', 'Suzuki Swift', 'Hyundai Elantra', 'Toyota Premio', 'Toyota Vitz', 'Nissan Note', 'Hyundai i10', 'Toyota Allion'],
  fem_comfort: ['Toyota RAV4', 'Kia Sportage', 'Toyota Harrier', 'Mitsubishi Outlander', 'Toyota Prado'],
  fem_xl: ['Toyota Noah', 'Toyota Hiace'],
};
// Weighted like Kigali traffic: mostly white/silver.
const COLORS = ['White', 'White', 'White', 'Silver', 'Silver', 'Grey', 'Black', 'Black', 'Blue', 'Red', 'Green', 'Yellow'];

/** Deterministic driver #i (stable across restarts, so rows update in place). */
function fleetEntry(i) {
  if (i < FLEET.length) return FLEET[i];
  const h = crypto.createHash('sha256').update(`fem-fleet-${i}`).digest();
  const cls = h[0] % 100 < 60 ? 'fem_economy' : h[0] % 100 < 88 ? 'fem_comfort' : 'fem_xl';
  return [
    `${FIRST_NAMES[h[1] % FIRST_NAMES.length]} ${LAST_NAMES[h[2] % LAST_NAMES.length]}`,
    cls,
    MODELS[cls][h[3] % MODELS[cls].length],
    COLORS[h[4] % COLORS.length],
  ];
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function plateFor(i) {
  return `RA${PLATE_LETTERS[(i * 7) % PLATE_LETTERS.length]} ${String(100 + ((i * 137) % 900))} ${PLATE_LETTERS[(i * 3) % PLATE_LETTERS.length]}`;
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Paths: compact road polylines with cumulative distance and road speed.
// ---------------------------------------------------------------------------

/**
 * @param {[number, number][]} coordinates [lng, lat] pairs
 * @param {number[]} [speeds] OSRM road speed (m/s) per segment
 */
function buildPath(coordinates, speeds) {
  // Drop duplicate vertices: zero-length segments give undefined headings.
  const pts = [];
  const segSpeeds = [];
  for (let i = 0; i < coordinates.length; i++) {
    const [lng, lat] = coordinates[i];
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev.lat - lat) < 1e-7 && Math.abs(prev.lng - lng) < 1e-7) continue;
    if (prev) segSpeeds.push(speeds && Number.isFinite(speeds[i - 1]) ? speeds[i - 1] : null);
    pts.push({ lat, lng });
  }
  if (pts.length === 1) pts.push({ ...pts[0] });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng) * 1000);
  }
  return { pts, cum, speeds: segSpeeds, length: cum[cum.length - 1] };
}

function segmentAt(path, s) {
  const { cum } = path;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

function pointAt(path, s) {
  const { pts, cum } = path;
  if (s <= 0) return { ...pts[0], seg: 0 };
  if (s >= path.length) return { ...pts[pts.length - 1], seg: pts.length - 2 };
  const lo = segmentAt(path, s);
  const hi = lo + 1;
  const span = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / span;
  return {
    lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * t,
    lng: pts[lo].lng + (pts[hi].lng - pts[lo].lng) * t,
    seg: lo,
  };
}

/** Bearing of travel at distance s, looking a few metres ahead. */
function headingAt(path, s) {
  const a = pointAt(path, Math.max(0, s - 2));
  const b = pointAt(path, Math.min(path.length, s + 8));
  if (Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8) return null;
  return bearingDegrees(a.lat, a.lng, b.lat, b.lng);
}

/** Distance along `path` of the point nearest to (lat, lng). */
function project(path, lat, lng) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < path.pts.length - 1; i++) {
    const a = path.pts[i];
    const b = path.pts[i + 1];
    const dx = (b.lng - a.lng) * kx;
    const dy = b.lat - a.lat;
    const px = (lng - a.lng) * kx;
    const py = lat - a.lat;
    const len2 = dx * dx + dy * dy;
    const f = len2 ? clamp((px * dx + py * dy) / len2, 0, 1) : 0;
    const qx = px - dx * f;
    const qy = py - dy * f;
    const d = qx * qx + qy * qy;
    if (d < best.d) best = { s: path.cum[i] + (path.cum[i + 1] - path.cum[i]) * f, d };
  }
  return best.s;
}

/**
 * Route path starting exactly at (lat, lng): OSRM snaps the start to the
 * road, which can be metres away from the car. Prepending the car's own
 * position turns that gap into a short drive instead of a jump.
 */
function pathFrom(lat, lng, route) {
  const coords = route.coordinates;
  const [lng0, lat0] = coords[0];
  const gapM = haversineKm(lat, lng, lat0, lng0) * 1000;
  if (gapM < 2) return buildPath(coords, route.speeds);
  return buildPath([[lng, lat], ...coords], route.speeds ? [null, ...route.speeds] : undefined);
}

function debug(car, msg) {
  if (process.env.FLEET_DEBUG === '1') console.log(`[fleet] ${car.name}: ${msg}`);
}

class DemoFleet {
  constructor() {
    this.cars = new Map(); // driverId -> car state
    this.tickCount = 0;
    this.timer = null;
    this.routeQueue = Promise.resolve();
    this.pathCache = new Map(); // "from>to" landmark pair -> path
  }

  async start() {
    await this.ensureDrivers();
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error('[fleet] tick failed:', err.message));
    }, TICK_MS);
    console.log(`[fleet] demo fleet driving ${this.cars.size} cars around Kigali`);
  }

  stop() {
    clearInterval(this.timer);
  }

  /**
   * Creates (or refreshes) the fleet's driver accounts. Idle cars stay
   * offline until their first road route is ready, then appear mid-street
   * (not stacked on a landmark).
   */
  async ensureDrivers() {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);
    const size = Math.max(0, config.demoFleetSize);
    for (let i = 0; i < size; i++) {
      const [name, vehicleId, model, color] = fleetEntry(i);
      const landmark = i % KIGALI_PLACES.length;
      const [, lat, lng] = KIGALI_PLACES[landmark];
      const phone = `+25078999${String(i).padStart(4, '0')}`;
      const { rows } = await getPool().query(
        `INSERT INTO drivers (full_name, phone, password_hash, license_number, verified, status,
                              current_vehicle_id, current_latitude, current_longitude, rating,
                              vehicle_model, vehicle_color, vehicle_plate, is_profile_complete)
         VALUES ($1,$2,$3,$4,TRUE,'offline',$5,$6,$7,$8,$9,$10,$11,TRUE)
         ON CONFLICT (phone) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           verified = TRUE,
           status = CASE WHEN drivers.status = 'busy' THEN 'busy' ELSE 'offline' END,
           current_vehicle_id = EXCLUDED.current_vehicle_id,
           vehicle_model = EXCLUDED.vehicle_model, vehicle_color = EXCLUDED.vehicle_color,
           vehicle_plate = EXCLUDED.vehicle_plate
         RETURNING id, status, current_latitude, current_longitude`,
        [name, phone, passwordHash, `DL-${1000 + i}`, vehicleId, lat, lng,
          Math.round(rand(4.6, 5.0) * 10) / 10, model, color, plateFor(i)]
      );
      const row = rows[0];
      const busy = row.status === 'busy';
      this.cars.set(row.id, {
        id: row.id,
        name,
        lat: row.current_latitude,
        lng: row.current_longitude,
        heading: rand(0, 360),
        speed: 0,
        // Driving style: some drivers are a bit brisker than others.
        style: rand(0.85, 1.1),
        landmark: busy ? null : landmark, // index into KIGALI_PLACES when parked at one
        cruiseTo: null,
        path: null,
        s: 0,
        next: null, // { path, switchS } — route queued behind the current one
        mode: 'cruise', // cruise | ride
        online: busy, // idle cars go online once placed on a road
        planning: false,
        pauseUntil: 0,
        blockedSince: 0,
        lastStepAt: nowMs(),
        rides: [],
        target: null, // { kind: 'pickup'|'dropoff', rideId }
        timers: new Map(), // key -> epoch ms for delayed human-like actions
        busyUntil: 0,
      });
    }
  }

  // ------------------------------------------------------------------
  // Routing
  // ------------------------------------------------------------------

  /**
   * Plans a road route for the car without stopping it. OSRM calls are
   * serialised (the public server allows ~1 request/second); each carries a
   * generation so a slow, superseded plan can never overwrite a newer one.
   *
   * If the car is moving, the route starts from where it will be in ~3 s
   * along its current path; the car keeps driving and switches over there.
   */
  planRoute(car, to, label, { fromLandmark = null, placeAlong = false } = {}) {
    const gen = (car.planGen = (car.planGen || 0) + 1);
    car.planning = true;
    car.next = null;

    let from;
    let switchS = null;
    if (fromLandmark != null) {
      const [, lat, lng] = KIGALI_PLACES[fromLandmark];
      from = { latitude: lat, longitude: lng };
    } else if (car.path && car.s < car.path.length - 1) {
      switchS = Math.min(car.path.length, car.s + Math.max(8, car.speed * 3));
      const p = pointAt(car.path, switchS);
      from = { latitude: p.lat, longitude: p.lng };
    } else {
      from = { latitude: car.lat, longitude: car.lng };
    }

    const cacheKey = fromLandmark != null && to.landmark != null ? `${fromLandmark}>${to.landmark}` : null;
    this.routeQueue = this.routeQueue
      .then(async () => {
        if (gen !== car.planGen) return;
        let path = cacheKey ? this.pathCache.get(cacheKey) : null;
        let source = 'cache';
        if (!path) {
          const route = await getRoadRoute(from, to, {
            speeds: true,
            cacheTtlMs: cacheKey ? LANDMARK_ROUTE_TTL : undefined,
          });
          source = route.source;
          if (gen !== car.planGen) return;
          if (route.source !== 'osrm' && car.mode === 'cruise') {
            // Never cruise through buildings on a straight-line estimate:
            // stay parked and try somewhere else shortly.
            car.pauseUntil = nowMs() + rand(8000, 15000);
            return;
          }
          path = cacheKey ? buildPath(route.coordinates, route.speeds) : pathFrom(from.latitude, from.longitude, route);
          if (cacheKey) this.cachePath(cacheKey, path);
          await new Promise((r) => setTimeout(r, 300)); // be gentle with OSRM
        }
        if (gen !== car.planGen) return;
        this.adoptPath(car, path, switchS, placeAlong);
        debug(car, `route to ${label}: ${Math.round(path.length)} m (${source})`);
      })
      .catch((err) => console.error('[fleet] route failed:', err.message))
      .finally(() => {
        if (gen === car.planGen) car.planning = false;
      });
  }

  cachePath(key, path) {
    this.pathCache.set(key, path);
    if (this.pathCache.size > PATH_CACHE_MAX) this.pathCache.delete(this.pathCache.keys().next().value);
  }

  /** Installs a planned path now, or queues it at the switch point. */
  adoptPath(car, path, switchS, placeAlong) {
    if (placeAlong) {
      // Initial placement: somewhere along the first route, already moving.
      car.path = path;
      car.s = path.length * rand(0.05, 0.85);
      const p = pointAt(path, car.s);
      car.lat = p.lat;
      car.lng = p.lng;
      car.heading = headingAt(path, car.s) ?? car.heading;
      car.speed = rand(4, 8);
      car.online = true;
      car.goOnline = true;
      return;
    }
    if (switchS != null && car.path && car.s < switchS) {
      car.next = { path, switchS };
      return;
    }
    this.install(car, path);
  }

  install(car, path) {
    // Start from wherever the car actually is on the new route (usually 0).
    const s = Math.min(path.length, project(path, car.lat, car.lng));
    const p = pointAt(path, s);
    const gapM = haversineKm(car.lat, car.lng, p.lat, p.lng) * 1000;
    if (gapM < 2) {
      car.path = path;
      car.s = s;
    } else {
      // Off the route (snapped start, overshoot): drive onto it from the
      // car's real position instead of teleporting.
      const coords = [[car.lng, car.lat], [p.lng, p.lat]];
      const speeds = [null, path.speeds[p.seg] ?? null];
      for (let i = p.seg + 1; i < path.pts.length; i++) {
        coords.push([path.pts[i].lng, path.pts[i].lat]);
        speeds.push(path.speeds[i] ?? null);
      }
      car.path = buildPath(coords, speeds);
      car.s = 0;
    }
    car.next = null;
  }

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------

  async tick() {
    if (this.ticking) return; // a slow tick must not overlap the next
    this.ticking = true;
    try {
      await this.step();
    } finally {
      this.ticking = false;
    }
  }

  async step() {
    this.tickCount += 1;
    const now = nowMs();
    if (this.tickCount % RIDE_POLL_EVERY_TICKS === 1) await this.syncRides();

    const cars = [...this.cars.values()];
    const idleUpdates = [];
    const wentOnline = [];
    for (const car of cars) {
      if (car.mode === 'ride') await this.driveRide(car, now);
      else this.cruise(car, now);
    }

    // Integrate motion in sub-steps; every sub-step is a trail sample.
    for (const car of cars) {
      const elapsed = clamp(now - car.lastStepAt, 0, 3000);
      car.lastStepAt = now;
      const steps = Math.max(1, Math.round(elapsed / SUB_STEP_MS));
      const dt = elapsed / steps / 1000;
      for (let k = 1; k <= steps; k++) {
        const t = now - elapsed + Math.round((k * elapsed) / steps);
        this.advance(car, cars, dt, t);
        if (car.online) recordSample(car.id, { latitude: car.lat, longitude: car.lng, heading: car.heading }, t);
      }
      if (!car.online) continue;
      if (car.goOnline) {
        car.goOnline = false;
        wentOnline.push(car.id);
      }
      if (car.mode === 'ride' && car.rides.length) {
        await updateDriverLocation(car.id, { latitude: car.lat, longitude: car.lng, heading: car.heading })
          .catch(() => {});
      } else {
        idleUpdates.push(car);
      }
    }

    if (idleUpdates.length) {
      await getPool().query(
        `UPDATE drivers d SET current_latitude = v.lat, current_longitude = v.lng,
           current_heading = v.heading, last_online_at = now()
          FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::float8[]) AS lat,
                       unnest($3::float8[]) AS lng, unnest($4::float8[]) AS heading) v
         WHERE d.id = v.id`,
        [
          idleUpdates.map((c) => c.id),
          idleUpdates.map((c) => c.lat),
          idleUpdates.map((c) => c.lng),
          idleUpdates.map((c) => c.heading),
        ]
      );
    }
    if (wentOnline.length) {
      await getPool().query(
        `UPDATE drivers SET status = 'active' WHERE id = ANY($1::uuid[]) AND status = 'offline'`,
        [wentOnline]
      );
    }
  }

  /** Speed the car wants at distance s of its path (m/s). */
  targetSpeed(car, s) {
    const path = car.path;
    // Road speed from OSRM, scaled to real Kigali city driving (~18-54 km/h).
    const seg = segmentAt(path, s);
    const road = path.speeds[seg];
    let v = (road != null ? clamp(road * 0.55, 5.5, 16) : 10) * car.style;

    // Corners: look ahead and slow for the sharpest bend within braking range.
    const here = headingAt(path, s);
    if (here != null) {
      for (const d of [12, 24, 40]) {
        const ahead = headingAt(path, Math.min(path.length, s + d));
        if (ahead == null) continue;
        const turn = bearingDiffDegrees(here, ahead);
        const cornerV = turn > 100 ? 3.5 : turn > 65 ? 5 : turn > 35 ? 7.5 : Infinity;
        // Allowed now = speed from which we can still brake to cornerV in d metres.
        v = Math.min(v, Math.sqrt(cornerV * cornerV + 2 * BRAKE * Math.max(0, d - 8)));
      }
    }

    // Ease into the end of the route (a stop that isn't a queued switch).
    if (!car.next) {
      const remaining = path.length - s;
      v = Math.min(v, Math.sqrt(2 * BRAKE * 0.6 * Math.max(0, remaining - 1)));
    }
    return v;
  }

  /**
   * Nearest car ahead in the same lane: close by, in front of us, heading
   * the same way. Returns { gap, speed } or null.
   */
  leaderAhead(car, cars) {
    let best = null;
    const kx = Math.cos((car.lat * Math.PI) / 180) * 111320;
    const ky = 110540;
    const hr = (car.heading * Math.PI) / 180;
    const fx = Math.sin(hr);
    const fy = Math.cos(hr);
    for (const other of cars) {
      if (other === car || !other.online) continue;
      const dx = (other.lng - car.lng) * kx;
      const dy = (other.lat - car.lat) * ky;
      if (Math.abs(dx) > FOLLOW_RANGE_M || Math.abs(dy) > FOLLOW_RANGE_M) continue;
      const along = dx * fx + dy * fy;
      if (along < 1) continue; // behind or beside us
      const side = Math.abs(dx * fy - dy * fx);
      if (side > 3.5) continue; // another lane / parallel street
      if (bearingDiffDegrees(car.heading, other.heading) > 40) continue; // crossing or oncoming
      if (!best || along < best.gap) best = { gap: along, speed: other.speed };
    }
    return best;
  }

  /** One kinematic sub-step of dt seconds at time t. */
  advance(car, cars, dt, t) {
    if (!car.path) {
      car.speed = 0;
      return;
    }
    // Queued route: switch once we reach its start point.
    if (car.next && (car.s >= car.next.switchS - 0.5 || car.s >= car.path.length - 0.5)) {
      this.install(car, car.next.path);
    }

    let want = car.pauseUntil > t ? 0 : this.targetSpeed(car, car.s);
    let decel = BRAKE;

    const leader = car.online ? this.leaderAhead(car, cars) : null;
    if (leader) {
      if (!car.blockedSince && leader.gap < MIN_GAP_M + 4 && leader.speed < 0.5) car.blockedSince = t;
      const blockedFor = car.blockedSince ? t - car.blockedSince : 0;
      if (blockedFor < MAX_BLOCKED_MS) {
        // Keep a safe gap: the speed from which we can stop before MIN_GAP_M.
        const room = Math.max(0, leader.gap - MIN_GAP_M);
        want = Math.min(want, leader.speed + Math.sqrt(2 * BRAKE * room));
        if (leader.gap < MIN_GAP_M + 3) decel = HARD_BRAKE;
      }
    } else {
      car.blockedSince = 0;
    }

    car.speed = want > car.speed ? Math.min(want, car.speed + ACCEL * dt) : Math.max(want, car.speed - decel * dt);
    car.s = Math.min(car.path.length, car.s + car.speed * dt);
    if (car.s >= car.path.length && !car.next) car.speed = 0;
    const p = pointAt(car.path, car.s);
    car.lat = p.lat;
    car.lng = p.lng;
    const h = headingAt(car.path, car.s);
    if (h != null && car.speed > 0.2) car.heading = h;

    // Occasional brief stop: a junction, a pedestrian, a moto-taxi.
    if (car.speed > 6 && Math.random() < 0.003 * dt * 4) car.pauseUntil = t + rand(2500, 7000);
  }

  arrived(car) {
    return car.path && !car.next && car.s >= car.path.length - 1;
  }

  /**
   * Idle cars drive landmark to landmark. Both ends being fixed points makes
   * the route cacheable, so after warm-up cruising costs no routing calls and
   * OSRM capacity is left for riders' trips.
   */
  cruise(car, now) {
    if (car.planning || car.pauseUntil > now) return;
    if (car.path && this.arrived(car)) {
      if (car.speed > 0.3) return;
      // Park briefly at the landmark, then head somewhere new.
      car.landmark = car.cruiseTo;
      car.path = null;
      car.pauseUntil = now + rand(3000, 12000);
      return;
    }
    if (car.path) return;
    let next = Math.floor(Math.random() * KIGALI_PLACES.length);
    if (next === car.landmark) next = (next + 1) % KIGALI_PLACES.length;
    const [, lat, lng] = KIGALI_PLACES[next];
    car.cruiseTo = next;
    const first = !car.online;
    const fromLandmark = car.landmark;
    this.planRoute(car, { latitude: lat, longitude: lng, landmark: next }, 'cruise', {
      fromLandmark,
      placeAlong: first,
    });
  }

  /** Loads active rides for every fleet car and switches modes accordingly. */
  async syncRides() {
    const ids = [...this.cars.keys()];
    const { rows } = await getPool().query(
      `SELECT id, driver_id, status, payment_method, pickup_latitude, pickup_longitude,
              dest_latitude, dest_longitude, created_at
         FROM rides
        WHERE driver_id = ANY($1)
          AND status IN ('driverAssigned','driverArriving','driverArrived','pinVerified','inProgress','arrived','paymentPending')
        ORDER BY created_at ASC`,
      [ids]
    );
    const byDriver = new Map();
    for (const r of rows) {
      if (!byDriver.has(r.driver_id)) byDriver.set(r.driver_id, []);
      byDriver.get(r.driver_id).push(r);
    }
    for (const car of this.cars.values()) {
      const rides = byDriver.get(car.id) || [];
      const hadRides = car.rides.length > 0;
      car.rides = rides;
      if (rides.length && car.mode !== 'ride') {
        debug(car, `assigned ${rides.map((r) => r.id.slice(0, 8)).join(',')}`);
        car.mode = 'ride';
        car.online = true;
        car.landmark = null;
        car.target = null;
        car.pauseUntil = 0;
        // Keep driving the current street while the pickup route is planned.
        car.planGen = (car.planGen || 0) + 1;
        car.planning = false;
        car.next = null;
      } else if (!rides.length && hadRides) {
        debug(car, 'free again');
        car.mode = 'cruise';
        car.landmark = null;
        car.target = null;
        car.planGen = (car.planGen || 0) + 1;
        car.planning = false;
        car.next = null;
        // Finish the current street (if any), then pick a new destination.
        if (car.path && car.s < car.path.length - 1) car.cruiseTo = null;
        else car.path = null;
        car.pauseUntil = nowMs() + rand(2000, 6000);
      }
    }
  }

  /** Delayed, human-paced action: true once `ms` has passed since first asked. */
  due(car, key, now, [min, max]) {
    if (!car.timers.has(key)) car.timers.set(key, now + rand(min, max));
    if (car.timers.get(key) > now) return false;
    car.timers.delete(key);
    return true;
  }

  /** Works through the car's rides: pickups first, then drop-offs. */
  async driveRide(car, now) {
    if (!car.rides.length || car.busyUntil > now) return;

    // Accept new offers after a human-looking pause.
    for (const ride of car.rides.filter((r) => r.status === 'driverAssigned')) {
      if (!this.due(car, `accept:${ride.id}`, now, [2500, 6000])) continue;
      await this.safely(car, () => acceptRide(car.id, ride.id));
      ride.status = 'driverArriving';
    }

    // Rider is at the car: start the trip with the ride PIN.
    for (const ride of car.rides.filter((r) => r.status === 'driverArrived')) {
      if (!this.due(car, `pin:${ride.id}`, now, [6000, 12000])) continue;
      const { rows } = await getPool().query('SELECT ride_pin FROM rides WHERE id = $1', [ride.id]);
      await this.safely(car, () => verifyPin(car.id, ride.id, rows[0]?.ride_pin));
      ride.status = 'inProgress';
      car.target = null;
    }

    // Cash trips: the driver takes the cash and confirms it in the app.
    for (const ride of car.rides.filter((r) => r.status === 'paymentPending' && r.payment_method === 'cash')) {
      if (!this.due(car, `cash:${ride.id}`, now, [4000, 8000])) continue;
      await this.safely(car, async () => {
        const { rows } = await getPool().query(
          `SELECT * FROM payments WHERE ride_id = $1 AND method = 'cash' ORDER BY created_at DESC LIMIT 1`,
          [ride.id]
        );
        if (rows[0] && rows[0].status !== 'succeeded') await confirmCashPayment(rows[0]);
      });
      ride.status = 'completed';
    }

    const nextPickup = car.rides.find((r) => r.status === 'driverArriving');
    const nextDropoff = car.rides.find((r) => r.status === 'inProgress' || r.status === 'pinVerified');
    const goal = nextPickup
      ? { kind: 'pickup', ride: nextPickup, to: { latitude: nextPickup.pickup_latitude, longitude: nextPickup.pickup_longitude } }
      : nextDropoff
        ? { kind: 'dropoff', ride: nextDropoff, to: { latitude: nextDropoff.dest_latitude, longitude: nextDropoff.dest_longitude } }
        : null;

    // Waiting for the rider to come out, or for payment to settle: pull over
    // (the path's end brakes the car smoothly; no route = standing still).
    if (!goal) return;

    const sameGoal = car.target && car.target.kind === goal.kind && car.target.rideId === goal.ride.id;
    if (!sameGoal) {
      car.target = { kind: goal.kind, rideId: goal.ride.id };
      this.planRoute(car, goal.to, `${goal.kind} ${goal.ride.id.slice(0, 8)}`);
      return;
    }
    if (!car.path || car.planning || !this.arrived(car) || car.speed > 0.5) return;

    debug(car, `reached ${goal.kind} ${goal.ride.id.slice(0, 8)}`);
    if (goal.kind === 'pickup') {
      await this.safely(car, () => markArrived(car.id, goal.ride.id));
      goal.ride.status = 'driverArrived';
    } else {
      await this.safely(car, () => completeTrip(car.id, goal.ride.id));
      goal.ride.status = 'paymentPending';
    }
    car.target = null;
    car.path = null;
  }

  async safely(car, fn) {
    try {
      await fn();
    } catch (err) {
      // The ride moved on (cancelled, raced): resync next poll.
      console.warn(`[fleet] ${car.name}: ${err.message}`);
      car.busyUntil = nowMs() + 1500;
    }
  }
}

let fleet = null;

async function startDemoFleet() {
  if (fleet) return fleet;
  fleet = new DemoFleet();
  await fleet.start();
  return fleet;
}

module.exports = { startDemoFleet, KIGALI_PLACES, buildPath, pointAt, project, fleetEntry };
