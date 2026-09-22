import { useState, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from './useTranslation';

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

  // Pre-prompt: on the FIRST ask (status still 'undetermined'), show a plain
  // explanation of WHY the app wants location before the OS dialog appears —
  // the OS itself only offers Allow/Deny with no context, which reads as
  // invasive and drives denials. Skipped when already granted/denied.
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    await ensureInitialized();
    const enabled = await checkLocationServices();
    if (!enabled) {
      Alert.alert(
        t('locationServicesOffTitle'),
        t('locationServicesOffMessage'),
        [{ text: t('openSettings'), onPress: openSettings }, { text: t('cancel'), style: 'cancel' }]
      );
      return false;
    }

    let status = await checkPermission();
    if (status === Location.PermissionStatus.UNDETERMINED) {
      await new Promise<void>((resolve) => {
        Alert.alert(
          t('locationPrePromptTitle'),
          t('locationPrePromptBody'),
          [
            { text: t('notNow'), style: 'cancel', onPress: () => resolve() },
            { text: t('continueLabel'), onPress: () => resolve() },
          ],
          { cancelable: false }
        );
      });
      status = await checkPermission();
    }

    if (status === Location.PermissionStatus.GRANTED) {
      return true;
    }

    if (status === Location.PermissionStatus.DENIED) {
      const requestedStatus = await requestPermission();
      if (requestedStatus === Location.PermissionStatus.GRANTED) {
        return true;
      }
    }

    // Denied (or permanently denied via BLOCKED): the app never freezes —
    // manual pickup selection works everywhere, and this dialog points to
    // Settings for users who want to enable it.
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
    ensureInitialized,
    openSettings,
  };
}