import { useEffect, useRef } from 'react';

import { useDriverActiveRide } from './useDriverActiveRide';
import { useDriverLocationStore } from '../stores/useDriverLocationStore';
import { getRoute } from '../services/location-service';
import { Path } from '../services/offline/geo';
import { OFFLINE_DEMO } from '../services/offline/mode';
import { TIMING, tripDurationMs } from '../services/offline/sim';

// Standalone demo build only. The driver's car is normally drawn from the
// phone's GPS, so someone trying the driver app at a desk saw it sit still
// through the whole job: no drive to the pickup, no trip, a meter stuck at
// zero. Here the car drives itself instead: along the road to the pickup once
// a request is accepted, then along the trip's route to the destination, at
// the same compressed pace the rider side of the demo uses. A server-backed
// build never runs this: there the position is always the real one.

const TICK_MS = 1000;
const MIN_APPROACH_MS = 12_000;
const MAX_APPROACH_MS = 45_000;

// When each ride's drive to the pickup began, so it continues (rather than
// restarting) if the route is fetched again.
const approachStartedAt = new Map<string, number>();

const smooth = (f: number) => {
  const c = Math.min(1, Math.max(0, f));
  return c * c * (3 - 2 * c); // pull away and brake gently
};

interface Leg {
  key: string;
  path: Path;
  startMs: number;
  durationMs: number;
}

export function useDemoDriverDrive(enabled: boolean) {
  const { rides } = useDriverActiveRide(OFFLINE_DEMO && enabled);
  const leg = useRef<Leg | null>(null);

  // One ride is driven at a time: a trip under way first, else the pickup run.
  const onTrip = rides.find((r) => r.status === 'pinVerified' || r.status === 'inProgress');
  const ride = onTrip ?? rides.find((r) => r.status === 'driverArriving') ?? null;
  const phase = onTrip ? 'trip' : 'approach';
  const key = ride ? `${ride.id}:${phase}` : '';
  const latest = useRef(ride);
  latest.current = ride;

  useEffect(() => {
    const current = latest.current;
    if (!OFFLINE_DEMO || !key || !current) return;
    const pickup = { latitude: current.pickup.latitude, longitude: current.pickup.longitude };
    const destination = { latitude: current.destination.latitude, longitude: current.destination.longitude };
    const here = useDriverLocationStore.getState().fix;
    const from = phase === 'trip' ? pickup : here ?? pickup;
    const to = phase === 'trip' ? destination : pickup;
    if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return;

    let cancelled = false;
    void getRoute({ from: { address: '', ...from }, to: { address: '', ...to } })
      .then((route) => {
        if (cancelled || !route || route.points.length < 2) return;
        const path = new Path(route.points.map((p) => [p.longitude, p.latitude] as [number, number]));
        const now = Date.now();
        let startMs: number;
        let durationMs: number;
        if (phase === 'trip') {
          const started = current.startedAt ? Date.parse(current.startedAt) : NaN;
          startMs = Number.isFinite(started) ? started : now;
          durationMs = tripDurationMs(path.lengthM / 1000);
        } else {
          startMs = approachStartedAt.get(current.id) ?? now;
          approachStartedAt.set(current.id, startMs);
          if (approachStartedAt.size > 20) approachStartedAt.delete(approachStartedAt.keys().next().value!);
          durationMs = Math.min(MAX_APPROACH_MS, Math.max(MIN_APPROACH_MS, (path.lengthM * 1000) / TIMING.tripSpeedMps));
        }
        leg.current = { key, path, startMs, durationMs };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!OFFLINE_DEMO || !key) return;
    let arrived = false;
    const timer = setInterval(() => {
      const current = leg.current;
      if (!current || current.key !== key || arrived) return;
      const f = (Date.now() - current.startMs) / current.durationMs;
      const p = current.path.at(smooth(f) * current.path.lengthM);
      useDriverLocationStore.getState().setSimulatedFix({ latitude: p.latitude, longitude: p.longitude, heading: p.heading });
      // Parked at the end of the leg: nothing more to publish until the next one.
      if (f >= 1) arrived = true;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [key]);
}
