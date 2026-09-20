import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { usePushRegistration } from '../../hooks/usePushRegistration';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { useTranslation } from '../../hooks/useTranslation';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    color: '#111',
  },
});

export default function MainLayout() {
  usePushRegistration(true);
  const { ensurePermission } = useLocationPermission();
  const { t } = useTranslation();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Only request location permission for passenger mode
      const granted = await ensurePermission();
      if (mounted) {
        setPermissionGranted(granted);
        setIsChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [ensurePermission, t]);

  if (isChecking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={styles.text}>{t('gettingLocationPermission')}</Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}