import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerDeviceToken } from '../services/notification-service';
import { OFFLINE_DEMO } from '../services/offline/mode';

// Registers this device's Expo push token with the backend whenever a
// passenger is signed in. Web is skipped: Expo push tokens on web require
// VAPID keys + a service worker, which is separate web-push infrastructure
// this migration doesn't set up (the initial deploy target is the web
// export served statically — no push there yet). Native builds (Phase 5+)
// get real push once EAS project config is in place.
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      // The standalone build has no push server: permission is still requested
      // (for the local ride notifications), but there is no token to register.
      if (status !== 'granted' || cancelled || OFFLINE_DEMO) return;

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync();
        if (!cancelled) await registerDeviceToken(token, Platform.OS);
      } catch {
        // No EAS project id configured yet, or the request failed — not
        // fatal, push is a nice-to-have, never block the app on it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
