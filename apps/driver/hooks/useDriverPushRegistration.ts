import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registerDriverDeviceToken } from '../services/driver-profile-service';
import { getPushToken } from '@kimu/shared/utils/notifications';

// Driver-side counterpart to hooks/usePushRegistration.ts — same web/native
// split rationale (see that file's comment).
export function useDriverPushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      const token = await getPushToken();
      if (!token || cancelled) return;
      // Not fatal — push is a nice-to-have, never block the app on it.
      await registerDriverDeviceToken(token, Platform.OS).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
