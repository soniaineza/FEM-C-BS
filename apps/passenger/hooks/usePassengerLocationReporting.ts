import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';

import { reportPassengerLocation } from '../services/ride-service';

// Passenger-side counterpart to hooks/useDriverLocationReporting.ts —
// streams the rider's live GPS to the backend while [enabled] (an active,
// pre-pickup ride) so their assigned driver can see where they actually are
// instead of only the static pickup pin (they may have walked since
// requesting). Same watchPositionAsync throttling as the driver hook.
export function usePassengerLocationReporting(enabled: boolean) {
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 6000, distanceInterval: 25 },
        (position) => {
          if (cancelled) return;
          const { latitude, longitude, heading } = position.coords;
          reportPassengerLocation({ latitude, longitude, heading: heading ?? undefined }).catch(() => {});
        }
      );
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled]);
}
