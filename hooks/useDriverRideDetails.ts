import { useEffect, useState } from 'react';

import { getDriverRideDetails } from '../services/driver-service';
import { Ride } from '../types/ride';

// Polls a single ride's details while [rideId] is set — the driver-side
// counterpart to hooks/useRideTracking.ts, used by the Journey screen for
// the one ride currently being driven. Same self-cancelling setTimeout
// chain (never setInterval) as every other poll loop in this app.
export function useDriverRideDetails(rideId: string | null) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!rideId) {
      setRide(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const details = await getDriverRideDetails(rideId!);
        if (cancelled) return;
        setRide(details);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('failed to load ride'));
      }
      if (!cancelled) {
        timer = setTimeout(poll, 3000);
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [rideId]);

  return { ride, error };
}
