import { useEffect, useRef, useState } from 'react';

import { carColorHex, type MapCar } from '../components/map/map-types';
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
    if (!enabled || lat == null || lng == null) {
      setCars([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastServerTime: number | undefined;
    let lastSuccess = Date.now();
    const expiry = setInterval(() => { if (!cancelled && Date.now() - lastSuccess > 30_000) setCars([]); }, 1000);

    async function poll() {
      const sentAt = Date.now();
      try {
        // Ask only for trail samples newer than the last poll (with 1.5 s of
        // overlap for jitter): about a third of the payload of a full trail.
        const { drivers, serverTime } = await getNearbyDrivers({
          latitude: lat!,
          longitude: lng!,
          since: lastServerTime != null ? lastServerTime - 1500 : undefined,
        });
        lastServerTime = serverTime;
        if (cancelled) return;
        // serverTime was taken mid-flight; smooth it so one slow response
        // doesn't make every car jump.
        const receivedAt = Date.now();
        lastSuccess = receivedAt;
        const sample = serverTime - (sentAt + receivedAt) / 2;
        offsetRef.current = offsetRef.current == null ? sample : offsetRef.current * 0.8 + sample * 0.2;
        // Only re-render for a meaningful clock change (not every poll's jitter).
        const next = Math.round(offsetRef.current);
        setOffset((prev) => (Math.abs(prev - next) > 40 ? next : prev));
        setCars(
          drivers.map((d) => ({
            id: d.id,
            latitude: d.latitude,
            longitude: d.longitude,
            heading: d.heading,
            vehicleClass: d.vehicleId,
            color: carColorHex(d.color),
            trail: d.trail,
          }))
        );
      } catch {
        // Keep showing the last known cars; the next poll retries.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      clearInterval(expiry);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, lat, lng]);

  return { cars, serverTimeOffsetMs };
}
