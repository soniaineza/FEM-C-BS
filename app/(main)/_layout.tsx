import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { usePushRegistration } from '../../hooks/usePushRegistration';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { useTranslation } from '../../hooks/useTranslation';

export default function MainLayout() {
  usePushRegistration(true);
  const { ensureInitialized, permissionStatus } = useLocationPermission();
  const { t } = useTranslation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Only check location permission for passenger mode
      // If already determined (granted/denied), skip the check
      if (permissionStatus !== null) {
        if (mounted) setIsChecking(false);
        return;
      }
      await ensureInitialized();
      if (mounted) setIsChecking(false);
    })();
    return () => { mounted = false; };
  }, [ensureInitialized, permissionStatus]);

  // Render immediately, don't block on permission check
  return <Stack screenOptions={{ headerShown: false }} />;
}