import { Redirect, Stack, usePathname } from 'expo-router';

import { useDriverPushRegistration } from '../../hooks/useDriverPushRegistration';
import { useDriverLocationReporting } from '../../hooks/useDriverLocationReporting';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';

export default function DriverLayout() {
  const pathname = usePathname();
  const driver = useDriverAuthStore((s) => s.currentDriver);
  const approved = Boolean(driver?.verified);
  useDriverPushRegistration(Boolean(driver));
  const status = useDriverAuthStore((s) => s.currentDriver?.status);
  // Online: report position. On a trip, report it more often.
  useDriverLocationReporting(approved && (status === 'active' || status === 'busy'), status === 'busy' ? 'trip' : 'idle');
  if (driver && !approved && pathname !== '/account/documents') {
    return <Redirect href="/(driver)/account/documents" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
