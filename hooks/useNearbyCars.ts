import { useEffect, useRef, useState } from 'react';

import type { MapCar } from '../components/map/map-types';
import { getNearbyDrivers } from '../services/ride-service';

const POLL_MS = 2000;

/**
 * Live cars around a point, polled every 2s while `enabled`. Returns the
 * cars (with their recent road trail for smooth animation) and the offset
 * between the server clock and this device's clock.
 *
 * Same polling discipline as useRideTracking: the next request is scheduled
 * only after the previous one settles, and nothing updates after unmount.
 */
export function useNearbyCars(center: { latitude: number; longitude: number } | null, enabled = true) {
  const [cars, setCars] = useState<MapCar[]>([]);
  const [serverTimeOffsetMs, setOffset] = useState(0);
  const offsetRef = useRef<number | null>(null);
  const lat = center?.latitude;
  const lng = center?.longitude;

  useEffect(() => {
    if (!enabled || lat == null || lng == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const sentAt = Date.now();
      try {
        const { drivers, serverTime } = await getNearbyDrivers({ latitude: lat!, longitude: lng! });
        if (cancelled) return;
        // serverTime was taken mid-flight; smooth it so one slow response
        // doesn't make every car jump.
        const receivedAt = Date.now();
        const sample = serverTime - (sentAt + receivedAt) / 2;
        offsetRef.current = offsetRef.current == null ? sample : offsetRef.current * 0.8 + sample * 0.2;
        setOffset(Math.round(offsetRef.current));
        setCars(
          drivers.map((d) => ({
            id: d.id,
            latitude: d.latitude,
            longitude: d.longitude,
            heading: d.heading,
            vehicleClass: d.vehicleId,
            trail: d.trail,
          }))
        );
      } catch {
        if (!cancelled) setCars([]);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, lat, lng]);

  return { cars, serverTimeOffsetMs };
}
