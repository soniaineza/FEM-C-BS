import { useState, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from './useTranslation';
import { ensureLocationAccess } from '../utils/location-access';

export function useLocationPermission() {
  const { t } = useTranslation();
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  const checkLocationServices = useCallback(async () => {
    const enabled = await Location.hasServicesEnabledAsync();
    setLocationServicesEnabled(enabled);
    return enabled;
  }, []);

  const checkPermission = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setPermissionStatus(status);
    return status;
  }, []);

  const requestPermission = useCallback(async () => {
    setIsRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  // Lazy check - only runs once, when first needed
  const ensureInitialized = useCallback(async () => {
    if (hasChecked) return;
    setHasChecked(true);
    await checkLocationServices();
    await checkPermission();
  }, [hasChecked, checkLocationServices, checkPermission]);

  // Walks the rider through approving location (see utils/location-access.ts).
  // `interactive` also shows the denied / services-off dialogs.
  const ensurePermission = useCallback(
    async (interactive = false): Promise<boolean> => {
      await ensureInitialized();
      const result = await ensureLocationAccess(t, { interactive });
      await checkPermission();
      setLocationServicesEnabled(result !== 'services-off');
      return result === 'granted';
    },
    [ensureInitialized, checkPermission, t]
  );

  return {
    permissionStatus,
    isRequesting,
    locationServicesEnabled,
    checkPermission,
    requestPermission,
    ensurePermission,
    ensureInitialized,
    openSettings,
  };
}