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
export function useRideTracking(rideId: string | null) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const [details, location] = await Promise.all([getRideDetails(rideId!), getDriverLocation(rideId!)]);
        if (cancelled) return;
        setRide(details);
        setDriverLocation(location);
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

  return { ride, driverLocation, error };
}
