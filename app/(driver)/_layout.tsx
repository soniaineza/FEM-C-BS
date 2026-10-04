import { Stack } from 'expo-router';

import { useDriverPushRegistration } from '../../hooks/useDriverPushRegistration';
import { useDriverLocationReporting } from '../../hooks/useDriverLocationReporting';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';

export default function DriverLayout() {
  useDriverPushRegistration(true);
  const status = useDriverAuthStore((s) => s.currentDriver?.status);
  // Online: report position. On a trip, report it more often.
  useDriverLocationReporting(status === 'active' || status === 'busy', status === 'busy' ? 'trip' : 'idle');
  return <Stack screenOptions={{ headerShown: false }} />;
}
