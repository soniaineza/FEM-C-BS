import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider, useLocalSearchParams } from 'expo-router';
import { MapStage } from '../../components/map/MapStage';
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

  // Render immediately, don't block on permission check. The shared ride
  // map lives behind the stack (mounted once, so it's warm and never
  // reloads between ride-flow steps); only the screens that show it are
  // transparent.
  return (
    <View style={{ flex: 1 }}>
      <MapStage />
      {/* The navigator's own background must be transparent for the map to
          show through; every screen then paints the usual opaque background
          itself unless it is one of the map screens. */}
      <ThemeProvider value={TRANSPARENT_THEME}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: DefaultTheme.colors.background } }}>
          {MAP_SCREENS.map((name) => (
            <Stack.Screen key={name} name={name} options={{ contentStyle: { backgroundColor: 'transparent' } }} />
          ))}
        </Stack>
      </ThemeProvider>
    </View>
  );
}

const TRANSPARENT_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent' } };

// Ride-flow screens drawn over the shared map (see hooks/useMapScene.ts).
const MAP_SCREENS = [
  'request/vehicle-selection',
  'request/fare-estimate',
  'ride/searching-driver',
  'ride/driver-accepted',
  'ride/tracking',
];