import { useEffect, useState } from 'react';
import { reportDriverLocation } from '../services/driver-service';
import { useDriverLocationStore } from '../stores/useDriverLocationStore';
import { watchForegroundLocation } from '../services/foreground-location';
import { syncDriverBackgroundLocation } from '../services/driver-background-location';
export function useDriverLocationReporting(enabled: boolean) {
  const [lastLocation, setLastLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    void syncDriverBackgroundLocation(enabled).catch(() => {
      if (!stopped) setError('Background location is unavailable.');
    });
    if (!enabled) { setLastLocation(null); setError(null); return; }
    const stop = watchForegroundLocation(reportDriverLocation, (fix) => {
      setLastLocation(fix);
      useDriverLocationStore.getState().setFix(fix);
      setError(null);
    }, () => setError('Unable to report an accurate location.'));
    return () => { stopped = true; stop(); };
  }, [enabled]);
  return { lastLocation, error };
}
