import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registerDeviceToken } from '../services/notification-service';
import { getPushToken } from '../utils/notifications';

// Registers this device's Expo push token with the backend whenever a
// passenger is signed in. Web is skipped: Expo push tokens on web require
// VAPID keys + a service worker, which is separate web-push infrastructure
// this app doesn't set up.
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      const token = await getPushToken();
      if (!token || cancelled) return;
      // Not fatal — push is a nice-to-have, never block the app on it.
      await registerDeviceToken(token, Platform.OS).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
