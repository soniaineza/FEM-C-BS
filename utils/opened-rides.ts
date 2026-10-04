// Rides whose screen the rider has already been taken to (or opened
// themselves) this session. Home opens a live ride once, e.g. after an app
// restart; after that the rider may come back to Home and look around while
// the trip carries on, and returns through the banner.
const openedRides = new Set<string>();

export function markRideOpened(rideId: string | null | undefined) {
  if (!rideId) return;
  openedRides.add(rideId);
  if (openedRides.size > 20) openedRides.delete(openedRides.values().next().value!);
}

export function wasRideOpened(rideId: string): boolean {
  return openedRides.has(rideId);
}
