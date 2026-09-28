import { Stack } from 'expo-router';

import { useDriverPushRegistration } from '../../hooks/useDriverPushRegistration';
import { useDriverLocationReporting } from '../../hooks/useDriverLocationReporting';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';

export default function DriverLayout() {
  useDriverPushRegistration(true);
  const status = useDriverAuthStore((s) => s.currentDriver?.status);
  useDriverLocationReporting(status === 'active' || status === 'busy');
  return <Stack screenOptions={{ headerShown: false }} />;
}
