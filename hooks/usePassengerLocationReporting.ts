import { useEffect } from 'react';
import { reportPassengerLocation } from '../services/ride-service';
import { watchForegroundLocation } from '../services/foreground-location';
export function usePassengerLocationReporting(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return watchForegroundLocation(reportPassengerLocation, () => {}, () => {});
  }, [enabled]);
}
