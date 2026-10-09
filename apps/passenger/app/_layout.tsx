import '../global.css';

import { useEffect, useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DialogHost } from '@kimu/shared/components/DialogHost';
import { PerfOverlay } from '@kimu/shared/components/PerfOverlay';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, BackHandler } from 'react-native';
// Only the weights the styles use (see packages/shared/tailwind-preset.js):
// Poppins is the display face, Inter the body face.
import { useFonts, Poppins_700Bold } from '@expo-google-fonts/poppins';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { useAuthStore } from '../stores/useAuthStore';
import { useLocaleStore } from '@kimu/shared/stores/useLocaleStore';
import { configureNotificationHandler } from '@kimu/shared/utils/notifications';
import { useMapConfigStore } from '@kimu/shared/stores/useMapConfigStore';
import { setAppApiClient } from '@kimu/shared/services/http';
import { apiClient } from '../services/api-client';

SplashScreen.preventAutoHideAsync().catch(() => {});
setAppApiClient(apiClient);
configureNotificationHandler();

// The body font is not set here. React 19 removed defaultProps for function
// components and RN 0.86's Text is one, so the old Text.defaultProps block
// silently did nothing: unclassed text fell back to the phone's system font
// and the font-scaling lock never applied. Every <Text className="font-sans"> now carries an
// explicit font-* class instead (font-sans = Inter_400Regular).

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Poppins_700Bold,
  });

  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
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
      <Stack.Protected guard={!currentUser}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!currentUser && !currentUser.isProfileComplete}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={!!currentUser && currentUser.isProfileComplete}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>
    </Stack>
    {/* appAlert() dialogs on web (react-native-web's Alert.alert is a no-op). */}
    <DialogHost />
    {/* Frame-rate and slow-step readout; renders nothing unless switched on. */}
    <PerfOverlay />
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
