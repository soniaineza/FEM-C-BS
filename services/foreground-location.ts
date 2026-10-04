import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { acquirePosition } from './location-service';
import { locationReport, usableFix } from '../utils/location-quality';
export type LocationReport = ReturnType<typeof locationReport>;

export function watchForegroundLocation(report: (fix: LocationReport) => Promise<void>,
  onFix: (fix: LocationReport) => void, onError: () => void): () => void {
  let stopped = false;
  let watch: Location.LocationSubscription | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: LocationReport | undefined;
  let uploading = false;
  let latestTimestamp = 0;
  async function drain() {
    if (uploading) return;
    uploading = true;
    try {
      while (!stopped && pending) {
        const fix = pending;
        pending = undefined;
        if (Date.now() - fix.measuredAt > 30_000) continue;
        try { await report(fix); } catch { if (!stopped) onError(); }
      }
    } finally { uploading = false; }
  }
  function accept(position: Location.LocationObject) {
    if (stopped || !usableFix(position) || position.timestamp <= latestTimestamp) return;
    latestTimestamp = position.timestamp;
    pending = locationReport(position);
    onFix(pending);
    void drain();
  }
  async function heartbeat() {
    if (stopped) return;
    if (AppState.currentState === 'active') {
      try {
        const position = await acquirePosition();
        if (position) accept(position);
        else if (!stopped) onError();
      } catch { if (!stopped) onError(); }
    }
    if (!stopped) timer = setTimeout(heartbeat, 20_000);
  }
  void (async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    if (stopped) return;
    if (permission.status !== 'granted') { onError(); return; }
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 }, accept,
      () => { if (!stopped) onError(); }
    );
    if (stopped) subscription.remove();
    else { watch = subscription; void heartbeat(); }
  })().catch(() => { if (!stopped) onError(); });
  return () => { stopped = true; pending = undefined; clearTimeout(timer); watch?.remove(); };
}
