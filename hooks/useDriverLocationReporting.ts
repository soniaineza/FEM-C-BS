import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';

import { reportDriverLocation } from '../services/driver-service';
import { useLocationPermissionStore } from '../stores/useLocationPermissionStore';
import { useTranslation } from './useTranslation';
import { appAlert } from '../utils/dialog';
import {
  hasBackgroundLocationPermission,
  requestBackgroundLocationPermission,
  startDriverBackgroundLocation,
  stopDriverBackgroundLocation,
} from '../utils/driver-background-location';

// The "allow all the time" explanation is shown at most once per launch — a
// driver who said "Not now" keeps working with foreground-only reporting.
let backgroundPromptShown = false;

// Streams the driver's live GPS to the backend (POST /api/drivers/location)
// while [enabled] — used whenever the driver is online (matches them to new
// rides via driverMatcher.js's current_latitude/longitude) or has an active
// ride (feeds the passenger's live tracking map + route breadcrumbs, see
// rideDriverOps.js's updateDriverLocation()).
//
// With "allow all the time" granted, reporting runs as a background task
// (utils/driver-background-location.ts) and so keeps going when the phone is
// locked or the driver switches apps. Otherwise it falls back to a
// foreground watchPositionAsync. Both are throttled to at most one report
// every 5s / 25m to avoid hammering the API while stationary.
export function useDriverLocationReporting(enabled: boolean) {
  const { t } = useTranslation();
  const [lastLocation, setLastLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      stopDriverBackgroundLocation();
      return;
    }

    let cancelled = false;

    (async () => {
      // Via the shared store so this cannot open a second OS dialog while
      // another screen's request is already on screen.
      const { status } = await useLocationPermissionStore.getState().request();
      if (status !== 'granted') {
        if (!cancelled) setError('Location permission is required to go online.');
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (cancelled) return;
      const initialCoords = { latitude: initial.coords.latitude, longitude: initial.coords.longitude, heading: initial.coords.heading ?? undefined };
      setLastLocation(initialCoords);
      await reportDriverLocation(initialCoords);

      if (Platform.OS !== 'web' && !(await hasBackgroundLocationPermission()) && !backgroundPromptShown) {
        backgroundPromptShown = true;
        const agreed = await new Promise<boolean>((resolve) => {
          appAlert(
            t('driverBackgroundLocationPromptTitle'),
            t('driverBackgroundLocationPromptBody'),
            [
              { text: t('notNow'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('continueLabel'), onPress: () => resolve(true) },
            ],
            { cancelable: false, onDismiss: () => resolve(false) }
          );
        });
        if (agreed) await requestBackgroundLocationPermission();
      }
      if (cancelled) return;

      const inBackground = await startDriverBackgroundLocation({
        title: t('driverLocationNotificationTitle'),
        body: t('driverLocationNotificationBody'),
      });
      if (cancelled) {
        if (inBackground) stopDriverBackgroundLocation();
        return;
      }
      // The background task also delivers fixes while the app is open, so the
      // foreground watcher is only needed when it could not start.
      if (inBackground) return;

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
    })().catch(() => { if (!cancelled) setError('Unable to report location.'); });

    // A stationary phone may not emit distance-filtered GPS updates. Ask the
    // OS for a fresh fix; never re-report an old coordinate as current.
    const heartbeat = setInterval(async () => {
      if (cancelled || AppState.currentState !== 'active') return;
      try {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (cancelled) return;
        const coords = { latitude: fix.coords.latitude, longitude: fix.coords.longitude, heading: fix.coords.heading ?? undefined };
        setLastLocation(coords);
        await reportDriverLocation(coords);
      } catch { setError('Unable to report location.'); }
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      stopDriverBackgroundLocation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { lastLocation, error };
}
