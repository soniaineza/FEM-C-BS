import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerDriverDeviceToken } from '../services/driver-profile-service';
import { OFFLINE_DEMO } from '../services/offline/mode';

// Driver-side counterpart to hooks/usePushRegistration.ts — same web/native
// split rationale (see that file's comment).
export function useDriverPushRegistration(enabled: boolean) {
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
        if (!cancelled) await registerDriverDeviceToken(token, Platform.OS);
      } catch {
        // Not fatal — push is a nice-to-have, never block the app on it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
