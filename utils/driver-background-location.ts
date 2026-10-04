import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { reportDriverLocation } from '../services/driver-service';

// Keeps an online driver's GPS flowing to the backend while the app is in
// the background or the phone is locked (Android foreground service / iOS
// background location). Without it the driver's position goes stale within
// seconds of leaving the app and the matcher stops offering them rides.
//
// The task must be defined at module scope and this module imported from the
// root layout, so the OS can run it when it wakes the app with no screen.
const DRIVER_LOCATION_TASK = 'kimu-driver-location';

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const latest = data?.locations?.[data.locations.length - 1];
    if (!latest) return;
    const { latitude, longitude, heading } = latest.coords;
    // A dropped report is not fatal — the next fix retries. With no driver
    // session (signed out) the request is rejected and nothing is recorded.
    await reportDriverLocation({ latitude, longitude, heading: heading ?? undefined }).catch(() => {});
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
export async function startDriverBackgroundLocation(notification: { title: string; body: string }): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await hasBackgroundLocationPermission())) return false;
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      // Same throttling as the foreground watcher in useDriverLocationReporting.
      timeInterval: 5000,
      distanceInterval: 25,
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
