import { useEffect, useState, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from './useTranslation';

export function useLocationPermission() {
  const { t } = useTranslation();
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);

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

  useEffect(() => {
    let mounted = true;
    
    (async () => {
      await checkLocationServices();
      if (mounted) {
        await checkPermission();
      }
    })();

    return () => { mounted = false; };
  }, [checkLocationServices, checkPermission]);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const enabled = await checkLocationServices();
    if (!enabled) {
      Alert.alert(
        t('locationServicesOffTitle'),
        t('locationServicesOffMessage'),
        [{ text: t('openSettings'), onPress: openSettings }, { text: t('cancel'), style: 'cancel' }]
      );
      return false;
    }

    const status = await checkPermission();
    if (status === Location.PermissionStatus.GRANTED) {
      return true;
    }

    if (status === Location.PermissionStatus.DENIED) {
      const requestedStatus = await requestPermission();
      if (requestedStatus === Location.PermissionStatus.GRANTED) {
        return true;
      }
    }

    Alert.alert(
      t('locationPermissionDeniedTitle'),
      t('locationPermissionDeniedMessage'),
      [{ text: t('openSettings'), onPress: openSettings }, { text: t('cancel'), style: 'cancel' }]
    );
    return false;
  }, [checkLocationServices, checkPermission, requestPermission, openSettings, t]);

  return {
    permissionStatus,
    isRequesting,
    locationServicesEnabled,
    checkPermission,
    requestPermission,
    ensurePermission,
    openSettings,
  };
}