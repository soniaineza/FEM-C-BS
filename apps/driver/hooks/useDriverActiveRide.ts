import { useEffect, useState } from 'react';

import { getActiveDriverRides } from '../services/driver-service';
import { Ride } from '@kimu/shared/types/ride';

// Polls GET /drivers/rides/active while [enabled] — the driver-side
// equivalent of a "new ride request" feed. There is no push/SSE channel for
// drivers yet (server/src/services/driverNotify.js only persists + FCM-
// pushes; nothing calls it when a ride is assigned — see
// driverMatcher.js's assignDriver()), so this is a deliberate poll, using
// the same self-cancelling setTimeout chain as hooks/useRideTracking.ts
// (never setInterval — see that file's comment on why).
export function useDriverActiveRide(enabled: boolean) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRides([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const active = await getActiveDriverRides();
        if (cancelled) return;
        setRides(active);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('failed to load active rides'));
      }
      if (!cancelled) {
        setLoading(false);
        timer = setTimeout(poll, 4000);
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return { rides, primaryRide: rides[rides.length - 1] ?? null, loading, error };
}
