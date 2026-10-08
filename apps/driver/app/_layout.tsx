import '../global.css';

import { useEffect, useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DialogHost } from '@kimu/shared/components/DialogHost';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, BackHandler } from 'react-native';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { useDriverAuthStore } from '../stores/useDriverAuthStore';
import { useLocaleStore } from '@kimu/shared/stores/useLocaleStore';
import { configureNotificationHandler } from '@kimu/shared/utils/notifications';
import { useMapConfigStore } from '@kimu/shared/stores/useMapConfigStore';
import { setAppApiClient } from '@kimu/shared/services/http';
import { driverApiClient } from '../services/driver-api-client';
// Registers the driver's background location task at module scope, so the OS
// can run it when it wakes the app without any screen mounted.
import '../utils/driver-background-location';

SplashScreen.preventAutoHideAsync().catch(() => {});
setAppApiClient(driverApiClient);
configureNotificationHandler();

// Set Inter as the native body family. Large screen titles explicitly use
// Poppins through the font-display utility; controls and body text use Inter.
if (Platform.OS !== 'web') {
  const originalText = require('react-native').Text;
  if (originalText) {
    originalText.defaultProps = {
      ...originalText.defaultProps,
      allowFontScaling: false,
      style: [{ fontFamily: 'Inter_400Regular' }, ...(originalText.defaultProps?.style ?? [])],
    };
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const router = useRouter();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const isAuthHydrated = useDriverAuthStore((s) => s.isHydrated);
  const hydrateAuth = useDriverAuthStore((s) => s.hydrate);
  const isLocaleHydrated = useLocaleStore((s) => s.isHydrated);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);

  useEffect(() => {
    hydrateAuth();
    hydrateLocale();
    useMapConfigStore.getState().load();
  }, [hydrateAuth, hydrateLocale]);

  const ready = fontsLoaded && isAuthHydrated && isLocaleHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Location is requested by hooks/useDriverLocationReporting.ts when the
  // driver goes online, not here: this layout also renders the auth stack,
  // and prompting before sign-in burns the single OS prompt.

  // Handle Android hardware back button - navigate back in stack instead of exiting
  const handleBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    return false; // Allow default exit behavior only at root
  }, [router]);

  useEffect(() => {
    // Android only: react-native-web logs an error for BackHandler.
    if (Platform.OS !== 'android') return;
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/* Keyboard-aware scrolling/avoiding for every form screen (Android is
        edge-to-edge, so the window no longer resizes for the keyboard). */}
    <KeyboardProvider>
    {/* Default: dark clock/battery icons for the app's light screens.
        Screens with a dark or green header override it while focused. */}
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!currentDriver}>
        <Stack.Screen name="(driver-auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!currentDriver && !currentDriver.isProfileComplete}>
        <Stack.Screen name="driver-profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={!!currentDriver && currentDriver.isProfileComplete}>
        <Stack.Screen name="(driver)" />
      </Stack.Protected>
    </Stack>
    {/* appAlert() dialogs on web (react-native-web's Alert.alert is a no-op). */}
    <DialogHost />
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
