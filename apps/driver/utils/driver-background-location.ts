import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { reportDriverLocation } from '../services/driver-service';
import { useDriverPositionStore } from '../stores/useDriverPositionStore';

// Keeps an online driver's GPS flowing to the backend while the app is in
// the background or the phone is locked (Android foreground service / iOS
// background location). Without it the driver's position goes stale within
// seconds of leaving the app and the matcher stops offering them rides.
//
// The task must be defined at module scope and this module imported from the
// root layout, so the OS can run it when it wakes the app with no screen.
const DRIVER_LOCATION_TASK = 'kimu-driver-location';

// How often the driver's position is sent: often on a trip (the rider is
// watching the car move), less often while waiting for a ride (enough to
// stay available for matching without draining the battery).
export type DriverLocationMode = 'idle' | 'trip';
export const DRIVER_LOCATION_INTERVAL_MS: Record<DriverLocationMode, number> = { idle: 15000, trip: 4000 };

// Slower than walking pace the phone's direction is noise.
const MIN_HEADING_SPEED_MPS = 0.5;

/**
 * A phone fix in the shape the server wants: with its accuracy and the
 * moment the phone took it, so the server can judge whether to trust it.
 * Also becomes the driver's latest known position for the app's own map.
 *
 * Phones report "no direction" as a number — iOS sends course -1, Android
 * sends bearing 0 when it has none (typically when standing still) — and a
 * car drawn with it turns to face north. Those are sent as no heading.
 */
export function driverFixOf(position: Location.LocationObject) {
  const { latitude, longitude, heading, accuracy, speed } = position.coords;
  const moving = speed == null || speed >= MIN_HEADING_SPEED_MPS;
  const direction = heading != null && Number.isFinite(heading) && heading >= 0 && moving ? heading % 360 : undefined;
  useDriverPositionStore.getState().setFix({ latitude, longitude, heading: direction ?? null, recordedAt: position.timestamp });
  return { latitude, longitude, heading: direction, accuracy: accuracy ?? undefined, recordedAt: position.timestamp };
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const latest = data?.locations?.[data.locations.length - 1];
    if (!latest) return;
    // A dropped report is not fatal — the next fix retries. With no driver
    // session (signed out) the request is rejected and nothing is recorded.
    await reportDriverLocation(driverFixOf(latest)).catch(() => {});
  });
}

/** True when the OS already lets the app read location in the background. */
export async function hasBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** Asks for "allow all the time". Foreground permission must already be granted. */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Starts background location reporting. Returns false when it cannot run
 * (web, permission missing, or a build without the native module) so the
 * caller can fall back to foreground-only reporting.
 */
export async function startDriverBackgroundLocation(
  notification: { title: string; body: string },
  mode: DriverLocationMode = 'idle'
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await hasBackgroundLocationPermission())) return false;
    // Restarted on every call so a change of mode (idle <-> trip) takes effect.
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: mode === 'trip' ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
      // Time-based, with no distance filter: a parked driver must keep
      // reporting or the server would treat them as gone.
      timeInterval: DRIVER_LOCATION_INTERVAL_MS[mode],
      distanceInterval: 0,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: notification.title,
        notificationBody: notification.body,
        notificationColor: '#0E7C4A',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // Nothing was running.
  }
}
