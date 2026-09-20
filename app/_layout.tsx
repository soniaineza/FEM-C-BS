import '../global.css';

import { useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, Alert, BackHandler } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { useAuthStore } from '../stores/useAuthStore';
import { useLocaleStore } from '../stores/useLocaleStore';
import { useAppModeStore } from '../stores/useAppModeStore';
import { useDriverAuthStore } from '../stores/useDriverAuthStore';
import { useLocationPermission } from '../hooks/useLocationPermission';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Disable font scaling globally for consistent UI
if (Platform.OS !== 'web') {
  // Use a global approach to disable font scaling
  const originalText = require('react-native').Text;
  if (originalText) {
    originalText.defaultProps = { ...originalText.defaultProps, allowFontScaling: false };
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const isLocaleHydrated = useLocaleStore((s) => s.isHydrated);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);

  const mode = useAppModeStore((s) => s.mode);
  const isModeHydrated = useAppModeStore((s) => s.isHydrated);
  const hydrateMode = useAppModeStore((s) => s.hydrate);

  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const isDriverAuthHydrated = useDriverAuthStore((s) => s.isHydrated);
  const hydrateDriverAuth = useDriverAuthStore((s) => s.hydrate);

  const { ensurePermission } = useLocationPermission();

  useEffect(() => {
    hydrateAuth();
    hydrateLocale();
    hydrateMode();
    hydrateDriverAuth();
  }, [hydrateAuth, hydrateLocale, hydrateMode, hydrateDriverAuth]);

  const ready = fontsLoaded && isAuthHydrated && isLocaleHydrated && isModeHydrated && isDriverAuthHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Handle Android hardware back button with exit confirmation
  const handleBackPress = useCallback(() => {
    Alert.alert(
      'Exit App',
      'Are you sure you want to exit?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => false },
        { text: 'Exit', onPress: () => BackHandler.exitApp() },
      ],
      { cancelable: false }
    );
    return true; // Prevent default back behavior
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [handleBackPress]);

  if (!ready) return null;

  // Three-way split, replacing root_router.dart's ValueListenableBuilder:
  // not signed in -> auth stack; signed in but profile incomplete ->
  // profile-setup; signed in + complete -> main app. Stack.Protected
  // reacts to currentUser/isProfileComplete changing, so login/logout/
  // completing a profile swap groups automatically with no manual
  // navigation calls at the transition points themselves.
  //
  // Passenger and driver are two independent experiences sharing this one
  // Expo project (see stores/useAppModeStore.ts) — `mode` gates which half
  // is even considered, then each half runs its own three-way auth split.
  // Switching mode (a link on either welcome screen) re-evaluates these
  // guards the same automatic way login/logout already does.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={mode === 'passenger' && !currentUser}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={mode === 'passenger' && !!currentUser && !currentUser.isProfileComplete}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={mode === 'passenger' && !!currentUser && currentUser.isProfileComplete}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>

      <Stack.Protected guard={mode === 'driver' && !currentDriver}>
        <Stack.Screen name="(driver-auth)" />
      </Stack.Protected>
      <Stack.Protected guard={mode === 'driver' && !!currentDriver && !currentDriver.isProfileComplete}>
        <Stack.Screen name="driver-profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={mode === 'driver' && !!currentDriver && currentDriver.isProfileComplete}>
        <Stack.Screen name="(driver)" />
      </Stack.Protected>
    </Stack>
  );
}
