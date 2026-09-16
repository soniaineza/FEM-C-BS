// Minimal in-process event hub used to fan out ride updates to SSE clients.
// Each ride keeps its own set of connected subscribers; a closed connection
// is removed lazily on the next publish.

const subscribers = new Map(); // rideId -> Set<callback(payload)>

function onRideEvent(rideId, callback) {
  let set = subscribers.get(rideId);
  if (!set) {
    set = new Set();
    subscribers.set(rideId, set);
  }
  set.add(callback);
  return () => set.delete(callback);
}

function publishRideEvent(rideId, event) {
  const set = subscribers.get(rideId);
  if (!set || set.size === 0) return;
  const payload = typeof event === 'string' ? JSON.stringify(event) : event;
  for (const cb of [...set]) {
    try {
      cb(payload);
    } catch (err) {
      // A broken subscriber must never take the ride transaction down.
      set.delete(cb);
    }
  }
}

function subscriberCount(rideId) {
  return subscribers.get(rideId)?.size || 0;
}

module.exports = { onRideEvent, publishRideEvent, subscriberCount };