const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getPool } = require('../db');
const { config } = require('../config');
const { getRoadRoute } = require('./routing');
const { recordSample } = require('./driverTrails');
const { bearingDegrees, bearingDiffDegrees, haversineKm } = require('../utils/distance');
const {
  acceptRide,
  markArrived,
  verifyPin,
  completeTrip,
  updateDriverLocation,
} = require('./rideDriverOps');

// Demo fleet (DEMO_FLEET=1, never in production): simulated drivers that
// drive real Kigali roads. Idle cars cruise between real places along OSRM
// road routes; when the matcher assigns one a ride it accepts, drives to the
// pickup, waits for the rider, starts the trip with the ride PIN, drives to
// the destination and completes it — through the same rideDriverOps
// functions a real driver's app calls, so every other part of the system
// (matching, pricing, payments, tracking) runs exactly as in production.

const TICK_MS = 1000;
const RIDE_POLL_EVERY_TICKS = 2;
const ACCEL = 1.4; // m/s²
const BRAKE = 2.2; // m/s²
const LANDMARK_ROUTE_TTL = 6 * 60 * 60 * 1000;

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
];

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

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function plateFor(i) {
  return `RA${PLATE_LETTERS[(i * 7) % PLATE_LETTERS.length]} ${String(100 + ((i * 137) % 900))} ${PLATE_LETTERS[(i * 3) % PLATE_LETTERS.length]}`;
}

/** Road path with cumulative distances, for constant-time position lookup. */
function buildPath(coordinates) {
  const pts = coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng) * 1000);
  }
  return { pts, cum, length: cum[cum.length - 1] };
}

function pointAt(path, s) {
  const { pts, cum } = path;
  if (s <= 0) return { ...pts[0], seg: 0 };
  if (s >= path.length) return { ...pts[pts.length - 1], seg: pts.length - 2 };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
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
  const a = pointAt(path, s);
  const b = pointAt(path, Math.min(path.length, s + 8));
  if (a.lat === b.lat && a.lng === b.lng) return null;
  return bearingDegrees(a.lat, a.lng, b.lat, b.lng);
}

/** Target speed (m/s) at s: slower into sharp turns and near the end. */
function targetSpeed(car, path, s) {
  const here = headingAt(path, s);
  const ahead = headingAt(path, Math.min(path.length, s + 35));
  let v = car.cruise;
  if (here != null && ahead != null) {
    const turn = bearingDiffDegrees(here, ahead);
    if (turn > 70) v = Math.min(v, 4.5);
    else if (turn > 35) v = Math.min(v, 7.5);
  }
  const remaining = path.length - s;
  if (remaining < 40) v = Math.min(v, Math.max(1.5, remaining / 6));
  return v;
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

  /** Creates (or refreshes) the fleet's driver accounts, verified and online. */
  async ensureDrivers() {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);
    for (let i = 0; i < Math.min(config.demoFleetSize, FLEET.length); i++) {
      const [name, vehicleId, model, color] = FLEET[i];
      const landmark = i % KIGALI_PLACES.length;
      const [, lat, lng] = KIGALI_PLACES[landmark];
      const start = { lat, lng };
      const phone = `+25078999${String(i).padStart(4, '0')}`;
      const { rows } = await getPool().query(
        `INSERT INTO drivers (full_name, phone, password_hash, license_number, verified, status,
                              current_vehicle_id, current_latitude, current_longitude, rating,
                              vehicle_model, vehicle_color, vehicle_plate, is_profile_complete)
         VALUES ($1,$2,$3,$4,TRUE,'active',$5,$6,$7,$8,$9,$10,$11,TRUE)
         ON CONFLICT (phone) DO UPDATE SET
           verified = TRUE,
           status = CASE WHEN drivers.status = 'busy' THEN 'busy' ELSE 'active' END,
           current_vehicle_id = EXCLUDED.current_vehicle_id,
           vehicle_model = EXCLUDED.vehicle_model, vehicle_color = EXCLUDED.vehicle_color,
           vehicle_plate = EXCLUDED.vehicle_plate,
           -- A car mid-ride keeps its place; idle cars restart at a landmark.
           current_latitude = CASE WHEN drivers.status = 'busy' THEN drivers.current_latitude ELSE EXCLUDED.current_latitude END,
           current_longitude = CASE WHEN drivers.status = 'busy' THEN drivers.current_longitude ELSE EXCLUDED.current_longitude END
         RETURNING id, status, current_latitude, current_longitude`,
        [name, phone, passwordHash, `DL-${1000 + i}`, vehicleId, start.lat, start.lng,
          Math.round(rand(4.6, 5.0) * 10) / 10, model, color, plateFor(i)]
      );
      const row = rows[0];
      this.cars.set(row.id, {
        id: row.id,
        name,
        lat: row.current_latitude,
        lng: row.current_longitude,
        heading: rand(0, 360),
        speed: 0,
        landmark: row.status === 'busy' ? null : landmark, // index into KIGALI_PLACES when parked at one
        cruiseTo: null,
        cruise: rand(8, 12.5), // 29-45 km/h on open road
        path: null,
        s: 0,
        mode: 'cruise', // cruise | ride
        planning: false,
        pauseUntil: 0,
        rides: [],
        target: null, // { kind: 'pickup'|'dropoff', rideId }
        acceptAt: new Map(), // rideId -> epoch ms
        busyUntil: 0,
      });
    }
  }

  /**
   * Plans a road route for the car. OSRM calls are serialised (the public
   * server allows ~1 request/second); each request carries a generation so a
   * slow, superseded plan (e.g. a cruise route still in flight when a ride
   * arrives) can never overwrite the newer one.
   */
  planRoute(car, to, label, { from = null, cacheTtlMs } = {}) {
    const gen = (car.planGen = (car.planGen || 0) + 1);
    car.planning = true;
    car.path = null;
    this.routeQueue = this.routeQueue
      .then(async () => {
        if (gen !== car.planGen) return;
        const route = await getRoadRoute(from || { latitude: car.lat, longitude: car.lng }, to, { cacheTtlMs });
        await new Promise((r) => setTimeout(r, 350));
        if (gen !== car.planGen) return;
        car.path = buildPath(route.coordinates);
        car.s = 0;
        car.cruise = rand(8, 12.5);
        debug(car, `route to ${label}: ${Math.round(car.path.length)} m (${route.source})`);
      })
      .catch((err) => console.error('[fleet] route failed:', err.message))
      .finally(() => {
        if (gen === car.planGen) car.planning = false;
      });
  }

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
    const now = Date.now();
    if (this.tickCount % RIDE_POLL_EVERY_TICKS === 1) await this.syncRides();

    const idleUpdates = [];
    for (const car of this.cars.values()) {
      if (car.mode === 'ride') await this.driveRide(car, now);
      else this.cruise(car, now);

      this.advance(car, now);
      if (car.mode === 'ride' && car.rides.length) {
        await updateDriverLocation(car.id, { latitude: car.lat, longitude: car.lng, heading: car.heading })
          .catch(() => {});
      } else {
        recordSample(car.id, { latitude: car.lat, longitude: car.lng, heading: car.heading }, now);
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
  }

  /** Physics step: accelerate/brake toward the target speed along the path. */
  advance(car, now) {
    if (!car.path || car.pauseUntil > now) {
      car.speed = Math.max(0, car.speed - BRAKE);
      return;
    }
    const want = targetSpeed(car, car.path, car.s);
    car.speed = want > car.speed ? Math.min(want, car.speed + ACCEL) : Math.max(want, car.speed - BRAKE);
    car.s = Math.min(car.path.length, car.s + car.speed * (TICK_MS / 1000));
    if (car.s >= car.path.length) car.speed = 0; // arrived: come to a stop
    const p = pointAt(car.path, car.s);
    car.lat = p.lat;
    car.lng = p.lng;
    const h = headingAt(car.path, car.s);
    if (h != null) car.heading = h;

    // Occasional brief stop: traffic, a junction, a pedestrian.
    if (car.speed > 6 && Math.random() < 0.012) car.pauseUntil = now + rand(3000, 9000);
  }

  arrived(car) {
    return car.path && car.s >= car.path.length - 1;
  }

  /**
   * Idle cars drive landmark to landmark. Both ends being fixed points makes
   * the route cacheable (LANDMARK_ROUTE_TTL), so after warm-up cruising costs
   * no routing calls and OSRM capacity is left for riders' trips.
   */
  cruise(car, now) {
    if (car.planning || car.pauseUntil > now) return;
    if (car.path && this.arrived(car)) {
      // Park briefly at the landmark, then head somewhere new.
      car.landmark = car.cruiseTo;
      car.path = null;
      car.pauseUntil = now + rand(4000, 15000);
      return;
    }
    if (car.path) return;
    let next = Math.floor(Math.random() * KIGALI_PLACES.length);
    if (next === car.landmark) next = (next + 1) % KIGALI_PLACES.length;
    const [, lat, lng] = KIGALI_PLACES[next];
    const fromLandmark = car.landmark != null ? KIGALI_PLACES[car.landmark] : null;
    car.cruiseTo = next;
    this.planRoute(car, { latitude: lat, longitude: lng }, 'cruise', {
      from: fromLandmark ? { latitude: fromLandmark[1], longitude: fromLandmark[2] } : null,
      cacheTtlMs: fromLandmark ? LANDMARK_ROUTE_TTL : undefined,
    });
  }

  /** Loads active rides for every fleet car and switches modes accordingly. */
  async syncRides() {
    const ids = [...this.cars.keys()];
    const { rows } = await getPool().query(
      `SELECT id, driver_id, status, ride_pin, pickup_latitude, pickup_longitude,
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
        car.landmark = null;
        car.planGen = (car.planGen || 0) + 1; // drop any cruise plan in flight
        car.planning = false;
        car.path = null;
        car.target = null;
      } else if (!rides.length && hadRides) {
        debug(car, 'free again');
        car.mode = 'cruise';
        car.landmark = null;
        car.path = null;
        car.target = null;
        car.pauseUntil = Date.now() + rand(3000, 8000);
      }
    }
  }

  /** Works through the car's rides: pickups first, then drop-offs. */
  async driveRide(car, now) {
    if (!car.rides.length || car.busyUntil > now) return;

    // Accept new offers after a human-looking pause.
    for (const ride of car.rides.filter((r) => r.status === 'driverAssigned')) {
      if (!car.acceptAt.has(ride.id)) car.acceptAt.set(ride.id, now + rand(2500, 6000));
      if (car.acceptAt.get(ride.id) <= now) {
        car.acceptAt.delete(ride.id);
        await this.safely(car, () => acceptRide(car.id, ride.id));
        ride.status = 'driverArriving';
      }
    }

    // Rider is at the car: start the trip with the ride PIN.
    for (const ride of car.rides.filter((r) => r.status === 'driverArrived')) {
      if (!car.acceptAt.has(`pin:${ride.id}`)) car.acceptAt.set(`pin:${ride.id}`, now + rand(6000, 12000));
      if (car.acceptAt.get(`pin:${ride.id}`) <= now) {
        car.acceptAt.delete(`pin:${ride.id}`);
        const { rows } = await getPool().query('SELECT ride_pin FROM rides WHERE id = $1', [ride.id]);
        await this.safely(car, () => verifyPin(car.id, ride.id, rows[0]?.ride_pin));
        ride.status = 'inProgress';
        car.target = null;
      }
    }

    const nextPickup = car.rides.find((r) => r.status === 'driverArriving');
    const nextDropoff = car.rides.find((r) => r.status === 'inProgress');
    const goal = nextPickup
      ? { kind: 'pickup', ride: nextPickup, to: { latitude: nextPickup.pickup_latitude, longitude: nextPickup.pickup_longitude } }
      : nextDropoff
        ? { kind: 'dropoff', ride: nextDropoff, to: { latitude: nextDropoff.dest_latitude, longitude: nextDropoff.dest_longitude } }
        : null;

    if (!goal) {
      // Waiting for the rider to come out, or for payment to settle.
      car.path = null;
      return;
    }

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
      car.busyUntil = Date.now() + 1500;
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

module.exports = { startDemoFleet, KIGALI_PLACES, buildPath, pointAt };
