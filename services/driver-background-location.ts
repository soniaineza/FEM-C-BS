import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { driverApiClient } from './driver-api-client';
import { usableFix, locationReport } from '../utils/location-quality';
import { getDriverToken } from '../storage/driverSession';

const TASK = 'kimu-driver-location';
const ENABLED = 'kimu-driver-tracking-enabled';
let synchronization = Promise.resolve();

// Must be defined in the global bundle, including a headless task launch.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data || await AsyncStorage.getItem(ENABLED) !== '1' || !(await getDriverToken())) return;
  const fix = data.locations.filter((p) => usableFix(p)).sort((a, b) => b.timestamp - a.timestamp)[0];
  // sentAt: the server measures the fix's age on this device's clock (see reportDriverLocation).
  if (fix) await driverApiClient.post('/drivers/location', { ...locationReport(fix), sentAt: Date.now() });
});

export async function requestDriverBackgroundPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  if (!(await TaskManager.isAvailableAsync())) return false;
  const current = await Location.getBackgroundPermissionsAsync();
  return current.granted || (await Location.requestBackgroundPermissionsAsync()).granted;
}

export function syncDriverBackgroundLocation(enabled: boolean): Promise<void> {
  synchronization = synchronization.catch(() => {}).then(async () => {
    if (Platform.OS === 'web') return;
    await AsyncStorage.setItem(ENABLED, enabled ? '1' : '0');
    if (!(await TaskManager.isAvailableAsync())) {
      if (enabled) throw new Error('Background tracking needs a native development or release build.');
      return;
    }
    const started = await Location.hasStartedLocationUpdatesAsync(TASK);
    if (!enabled) {
      if (started) await Location.stopLocationUpdatesAsync(TASK);
      return;
    }
    if (!(await Location.getBackgroundPermissionsAsync()).granted) throw new Error('Background permission is required.');
    if (!started) await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 0,
      deferredUpdatesInterval: 10_000, pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: 'Kimu Transport driver location',
        notificationBody: 'Sharing your location while you are online or on a trip.', killServiceOnDestroy: true },
    });
  });
  return synchronization;
}
