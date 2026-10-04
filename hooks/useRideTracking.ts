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
const snapshots = new Map<string, { ride: Ride; driverLocation: DriverLocation | null; offset: number; savedAt: number }>();

// How long a polled driver position may be shown without a newer one.
const LIVE_MAX_AGE_MS = 30_000;

export function clearRideSnapshots() { snapshots.clear(); }

/** The most recent ride state seen by any tracking screen (for instant first paint). */
export function getCachedRide(rideId: string | null | undefined): Ride | null {
  const snapshot = rideId ? snapshots.get(rideId) : undefined;
  return snapshot && Date.now() - snapshot.savedAt < 300_000 ? snapshot.ride : null;
}

/** The driver position from the last poll, while it is still recent enough to show. */
function liveSnapshot(rideId: string | null | undefined) {
  const snapshot = rideId ? snapshots.get(rideId) : undefined;
  return snapshot && Date.now() - snapshot.savedAt < LIVE_MAX_AGE_MS ? snapshot : undefined;
}

export function useRideTracking(rideId: string | null) {
  const [ride, setRide] = useState<Ride | null>(() => getCachedRide(rideId));
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(() => liveSnapshot(rideId)?.driverLocation ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [serverTimeOffsetMs, setOffset] = useState(() => liveSnapshot(rideId)?.offset ?? 0);

  useEffect(() => {
    // A screen hand-off seconds after the last poll continues from it (same car,
    // same clock offset) instead of blanking the map; anything older starts empty.
    const live = liveSnapshot(rideId);
    setRide(getCachedRide(rideId));
    setError(null);
    setOffset(live?.offset ?? 0);
    setDriverLocation(live?.driverLocation ?? null);
    if (!rideId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    let offset: number | null = live ? live.offset : null;
    let lastSuccess = live?.savedAt ?? Date.now();
    const expiry = setInterval(() => { if (!cancelled && Date.now() - lastSuccess > LIVE_MAX_AGE_MS) setDriverLocation(null); }, 1000);

    async function poll() {
      const sentAt = Date.now();
      try {
        const [details, location] = await Promise.all([getRideDetails(rideId!), getDriverLocation(rideId!)]);
        if (cancelled) return;
        lastSuccess = Date.now();
        setRide(details);
        setDriverLocation(location);
        if (location?.serverTime) {
          // Smoothed server-minus-device clock offset for the map's animation.
          const sample = location.serverTime - (sentAt + Date.now()) / 2;
          offset = offset == null ? sample : offset * 0.8 + sample * 0.2;
          setOffset(Math.round(offset));
        }
        snapshots.set(rideId!, { ride: details, driverLocation: location, offset: Math.round(offset ?? 0), savedAt: Date.now() });
        for (const [id, snapshot] of snapshots) if (Date.now() - snapshot.savedAt > 300_000 || snapshots.size > 20) snapshots.delete(id);
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
      clearInterval(expiry);
      if (timer) clearTimeout(timer);
    };
  }, [rideId]);

  return { ride: ride?.id === rideId ? ride : null, driverLocation: ride?.id === rideId ? driverLocation : null, error, serverTimeOffsetMs };
}
