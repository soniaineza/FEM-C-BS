import '../global.css';

import { useEffect, useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DialogHost } from '../components/DialogHost';
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

import { useAuthStore } from '../stores/useAuthStore';
import { useLocaleStore } from '../stores/useLocaleStore';
import { useAppModeStore } from '../stores/useAppModeStore';
import { useDriverAuthStore } from '../stores/useDriverAuthStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  // Location is requested by app/(main)/_layout.tsx once a rider is signed in,
  // not here: this layout also renders the auth stack, and prompting before
  // sign-in burns the single OS prompt on a screen with no map.

  // Handle Android hardware back button - navigate back in stack instead of exiting
  const handleBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    return false; // Allow default exit behavior only at root
  }, [router]);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/* Keyboard-aware scrolling/avoiding for every form screen (Android is
        edge-to-edge, so the window no longer resizes for the keyboard). */}
    <KeyboardProvider>
    {/* Default: dark clock/battery icons for the app's light screens.
        Screens with a dark or green header override it while focused. */}
    <StatusBar style="dark" />
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
    {/* appAlert() dialogs on web (react-native-web's Alert.alert is a no-op). */}
    <DialogHost />
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
