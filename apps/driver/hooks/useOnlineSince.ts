import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kimu_driver_online_since';
/** Refresh often enough that the reading never looks stuck, cheaply. */
const TICK_MS = 30000;

/**
 * How long the driver has been online, in whole minutes, or null when offline.
 *
 * The timestamp is kept on the device rather than derived from the server:
 * the shift continues across an app restart, and the server only records the
 * current status, not when it was set.
 */
export function useOnlineSince(isOnline: boolean): number | null {
  const [since, setSince] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const stamp = raw ? Number(raw) : NaN;
        if (Number.isFinite(stamp)) setSince(stamp);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait for the stored stamp, or going online would overwrite a shift that
    // is already running with the time the app happened to be reopened.
    if (!hydrated) return;
    if (isOnline && since == null) {
      const stamp = Date.now();
      setSince(stamp);
      setNow(stamp);
      AsyncStorage.setItem(STORAGE_KEY, String(stamp)).catch(() => {});
    } else if (!isOnline && since != null) {
      setSince(null);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, [hydrated, isOnline, since]);

  useEffect(() => {
    if (!isOnline || since == null) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [isOnline, since]);

  if (!isOnline || since == null) return null;
  return Math.max(0, Math.floor((now - since) / 60000));
}
