import { Stack } from 'expo-router';

import { useDriverPushRegistration } from '../../hooks/useDriverPushRegistration';
import { useDriverLocationReporting } from '../../hooks/useDriverLocationReporting';
import { useDemoDriverDrive } from '../../hooks/useDemoDriverDrive';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';

export default function DriverLayout() {
  useDriverPushRegistration(true);
  const status = useDriverAuthStore((s) => s.currentDriver?.status);
  const working = status === 'active' || status === 'busy';
  useDriverLocationReporting(working);
  // Standalone demo build: the car drives itself to the pickup and along the trip.
  useDemoDriverDrive(working);
  return <Stack screenOptions={{ headerShown: false }} />;
}
