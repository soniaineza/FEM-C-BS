import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { reportDriverLocation } from '../services/driver-service';

// Streams the driver's live GPS to the backend (POST /api/drivers/location)
// while [enabled] — used whenever the driver is online (matches them to new
// rides via driverMatcher.js's current_latitude/longitude) or has an active
// ride (feeds the passenger's live tracking map + route breadcrumbs, see
// rideDriverOps.js's updateDriverLocation()). Uses watchPositionAsync rather
// than a manual poll loop so updates are driven by real movement, throttled
// to at most one report every 5s / 25m to avoid hammering the API while
// stationary.
export function useDriverLocationReporting(enabled: boolean) {
  const [lastLocation, setLastLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setError('Location permission is required to go online.');
        return;
      }

      subscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 25 },
        (position) => {
          if (cancelled) return;
          const { latitude, longitude, heading } = position.coords;
          setLastLocation({ latitude, longitude });
          reportDriverLocation({ latitude, longitude, heading: heading ?? undefined }).catch(() => {
            // A single dropped GPS tick is not fatal — the next one retries.
          });
        }
      );
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled]);

  return { lastLocation, error };
}
