import { useEffect, useState } from 'react';

import { getRideDetails, getDriverLocation, DriverLocation } from '../services/ride-service';
import { Ride } from '../types/ride';

// NOTE: the backend actually exposes GET /rides/:id/stream (real
// Server-Sent Events, see rides.routes.js) — better than polling in
// principle. It isn't used here because browser EventSource cannot send a
// custom Authorization header, and requireAuth (middleware/auth.js) only
// reads that header (no ?token= fallback) — wiring SSE up would need an
// additional backend change beyond the two already agreed for this
// migration. Left as a documented future improvement, not done silently.
//
// This hook is the direct replacement for subscribeToRide() in the old
// ride_tracking_screen.dart, where a just-fixed bug (commit 5fd55b6) had
// the Timer.periodic's cancellation discarded, orphaning a polling loop on
// every screen visit. Two things here specifically close that bug class:
//   1. setTimeout chained AFTER each response resolves, not setInterval —
//      only one request is ever in flight, so nothing can stack even if a
//      response is slow (e.g. a cold-starting backend).
//   2. A `cancelled` flag checked before every setState AND before
//      scheduling the next tick — clearing the timer stops FUTURE ticks;
//      the flag stops a response already in flight at unmount time from
//      updating state or scheduling one more tick.
// Last known state per ride, shared across the ride-flow screens. Each screen
// (searching -> driver -> trip -> completed) mounts its own copy of this hook;
// without the cache every hand-off started from an empty state, flashing a
// loading spinner and resetting the map camera and route — the ride seemed to
// "start all over" when it began and again when it finished.
const snapshots = new Map<string, { ride: Ride; driverLocation: DriverLocation | null; offset: number }>();

/** The most recent ride state seen by any tracking screen (for instant first paint). */
export function getCachedRide(rideId: string | null | undefined): Ride | null {
  return (rideId && snapshots.get(rideId)?.ride) || null;
}

export function useRideTracking(rideId: string | null) {
  const cached = rideId ? snapshots.get(rideId) : undefined;
  const [ride, setRide] = useState<Ride | null>(cached?.ride ?? null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(cached?.driverLocation ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [serverTimeOffsetMs, setOffset] = useState(cached?.offset ?? 0);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    let offset: number | null = null;

    async function poll() {
      const sentAt = Date.now();
      try {
        const [details, location] = await Promise.all([getRideDetails(rideId!), getDriverLocation(rideId!)]);
        if (cancelled) return;
        setRide(details);
        setDriverLocation(location);
        snapshots.set(rideId!, { ride: details, driverLocation: location, offset: offset ?? 0 });
        if (location?.serverTime) {
          // Smoothed server-minus-device clock offset for the map's animation.
          const sample = location.serverTime - (sentAt + Date.now()) / 2;
          offset = offset == null ? sample : offset * 0.8 + sample * 0.2;
          setOffset(Math.round(offset));
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('tracking failed'));
      }
      if (!cancelled) {
        timer = setTimeout(poll, 2000);
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [rideId]);

  return { ride, driverLocation, error, serverTimeOffsetMs };
}
