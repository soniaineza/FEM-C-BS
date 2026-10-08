import { useEffect, useState } from 'react';

import { DriverStop, getDriverStops } from '../services/driver-service';

// Polls GET /drivers/rides/stops while [enabled] — the ordered pickups and
// drop-offs across every ride the driver is carrying. Same self-cancelling
// setTimeout chain as hooks/useDriverActiveRide.ts.
export function useDriverStops(enabled: boolean) {
  const [stops, setStops] = useState<DriverStop[]>([]);

  useEffect(() => {
    if (!enabled) {
      setStops([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const next = await getDriverStops();
        if (!cancelled) setStops(next);
      } catch {
        // Keep the last known order; the next poll retries.
      }
      if (!cancelled) timer = setTimeout(poll, 6000);
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return stops;
}
