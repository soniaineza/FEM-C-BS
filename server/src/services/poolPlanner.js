const { getTravelMatrix } = require('./routing');

// Shared-ride stop planning. One pooled vehicle serves several bookings, so
// the driver needs a single ordered list of stops (pickups and drop-offs)
// and the matcher needs to know how much a new rider would delay everyone
// already in the pool. Both come from the same plan so they always agree.

// The most a shared trip may be lengthened by other riders — promised to the
// rider on the booking screen (quote.shared.maxAddedMinutes).
const MAX_ADDED_MINUTES = 8;
// A new rider is not added to a pool that cannot reach them within this.
const MAX_POOL_PICKUP_MINUTES = 15;
// Time spent stopped at each pickup/drop-off.
const STOP_DWELL_SECONDS = 60;
// Exhaustive ordering up to this many stops (4 bookings); greedy beyond.
const EXHAUSTIVE_MAX_STOPS = 8;

// Rides whose passenger is already in the car: only a drop-off remains.
const ONBOARD_STATUSES = new Set(['pinVerified', 'inProgress']);

function stopsForRide(ride) {
  const stops = [];
  if (!ONBOARD_STATUSES.has(ride.status)) {
    stops.push({
      type: 'pickup',
      rideId: ride.id,
      latitude: ride.pickup_latitude,
      longitude: ride.pickup_longitude,
      address: ride.pickup_address,
    });
  }
  stops.push({
    type: 'dropoff',
    rideId: ride.id,
    latitude: ride.dest_latitude,
    longitude: ride.dest_longitude,
    address: ride.dest_address,
  });
  return stops;
}

/** Arrival time (seconds from now) at each stop for one visiting order. */
function timeline(order, matrix) {
  const arrivals = [];
  let clock = 0;
  let at = 0; // matrix index 0 is the driver
  for (const idx of order) {
    clock += matrix[at][idx + 1];
    arrivals.push(clock);
    clock += STOP_DWELL_SECONDS;
    at = idx + 1;
  }
  return { arrivals, total: clock };
}

/** Cheapest order that never drops a rider off before picking them up. */
function bestOrder(stops, matrix) {
  const n = stops.length;
  const pickupIndex = new Map();
  stops.forEach((s, i) => {
    if (s.type === 'pickup') pickupIndex.set(s.rideId, i);
  });
  const allowed = (i, used) => {
    if (used[i]) return false;
    if (stops[i].type !== 'dropoff') return true;
    const p = pickupIndex.get(stops[i].rideId);
    return p === undefined || used[p];
  };

  if (n > EXHAUSTIVE_MAX_STOPS) {
    // Greedy nearest-allowed-stop: good enough for a rare, very full vehicle.
    const used = new Array(n).fill(false);
    const order = [];
    let at = 0;
    while (order.length < n) {
      let pick = -1;
      for (let i = 0; i < n; i++) {
        if (allowed(i, used) && (pick < 0 || matrix[at][i + 1] < matrix[at][pick + 1])) pick = i;
      }
      used[pick] = true;
      order.push(pick);
      at = pick + 1;
    }
    return order;
  }

  let best = null;
  let bestTotal = Infinity;
  const used = new Array(n).fill(false);
  const order = [];
  const walk = (at, clock) => {
    if (clock >= bestTotal) return;
    if (order.length === n) {
      best = order.slice();
      bestTotal = clock;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!allowed(i, used)) continue;
      used[i] = true;
      order.push(i);
      walk(i + 1, clock + matrix[at][i + 1] + STOP_DWELL_SECONDS);
      order.pop();
      used[i] = false;
    }
  };
  walk(0, 0);
  return best || [];
}

/**
 * Orders every remaining stop for [rides] starting from the driver's
 * position. Returns { stops: [{ type, rideId, address, latitude, longitude,
 * etaSeconds }], totalSeconds } using road travel times.
 */
async function planStops(driverPosition, rides) {
  const stops = rides.flatMap(stopsForRide);
  if (!stops.length) return { stops: [], totalSeconds: 0 };
  const matrix = await getTravelMatrix([driverPosition, ...stops]);
  const order = bestOrder(stops, matrix);
  const { arrivals, total } = timeline(order, matrix);
  return {
    stops: order.map((idx, i) => ({ ...stops[idx], etaSeconds: Math.round(arrivals[i]) })),
    totalSeconds: Math.round(total),
  };
}

function etaOf(plan, rideId, type) {
  const stop = plan.stops.find((s) => s.rideId === rideId && s.type === type);
  return stop ? stop.etaSeconds : null;
}

/**
 * Would adding [newRide] to a pool currently serving [members] keep every
 * rider within the promised extra time? Returns { ok, pickupSeconds,
 * worstAddedSeconds } — ok only when no existing rider is dropped off more
 * than MAX_ADDED_MINUTES later, the new rider's own trip is not stretched by
 * more than that, and the car can reach them soon enough.
 */
async function evaluatePoolJoin(driverPosition, members, newRide) {
  const [before, after] = await Promise.all([
    planStops(driverPosition, members),
    planStops(driverPosition, [...members, newRide]),
  ]);
  const limit = MAX_ADDED_MINUTES * 60;

  let worstAddedSeconds = 0;
  for (const member of members) {
    const added = etaOf(after, member.id, 'dropoff') - etaOf(before, member.id, 'dropoff');
    worstAddedSeconds = Math.max(worstAddedSeconds, added);
  }

  const pickupSeconds = etaOf(after, newRide.id, 'pickup');
  const rideSeconds = etaOf(after, newRide.id, 'dropoff') - pickupSeconds;
  const directSeconds = Number(newRide.duration_minutes || 0) * 60;
  worstAddedSeconds = Math.max(worstAddedSeconds, rideSeconds - directSeconds);

  return {
    ok: worstAddedSeconds <= limit && pickupSeconds <= MAX_POOL_PICKUP_MINUTES * 60,
    pickupSeconds,
    worstAddedSeconds,
  };
}

module.exports = { planStops, evaluatePoolJoin, MAX_ADDED_MINUTES };
