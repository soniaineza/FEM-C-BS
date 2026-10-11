import { useEffect, useRef, useState } from 'react';

import { getRoute } from '@kimu/shared/services/location-service';
import { distanceM, projectOnRoute } from '@kimu/shared/components/map/trackInterpolation';
import type { Place } from '@kimu/shared/types/place';
import type { RoutePoint } from '@kimu/shared/types/ride';
import type { DriverFix } from '../stores/useDriverPositionStore';

const OFF_ROUTE_M = 150; // re-plan the approach if the driver strays this far
const REPLAN_MIN_MS = 20_000;
const RETRY_AFTER_FAILURE_MS = 10_000;

type Leg = 'toPickup' | 'trip';

/**
 * The road route the driver's trip map draws: from the driver to the pickup
 * while they are on their way there (re-planned if they take another road),
 * then the booked pickup → destination route the fare was priced on.
 */
export function useDriverJourneyRoute(
  rideId: string | null,
  pickup: Place | null,
  destination: Place | null,
  toPickup: boolean,
  fix: DriverFix | null
): RoutePoint[] {
  const leg: Leg = toPickup ? 'toPickup' : 'trip';
  const [route, setRoute] = useState<{ leg: Leg; rideId: string; points: RoutePoint[] } | null>(null);
  const plannedAt = useRef(0);
  const failedAt = useRef(0);
  const planning = useRef(false);
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // The approach is planned from where the driver is; the trip leg is static.
  const from = leg === 'toPickup' ? fix : pickup;
  const to = leg === 'toPickup' ? pickup : destination;

  useEffect(() => {
    if (!rideId || from?.latitude == null || from?.longitude == null || to?.latitude == null || to?.longitude == null) return;
    const stale = !route || route.leg !== leg || route.rideId !== rideId;
    let offRoute = false;
    if (!stale && leg === 'toPickup' && fix && route!.points.length > 1) {
      const coords = route!.points.map((p) => [p.longitude, p.latitude] as [number, number]);
      const proj = projectOnRoute(coords, fix.latitude, fix.longitude);
      offRoute = !!proj && distanceM(proj.point[1], proj.point[0], fix.latitude, fix.longitude) > OFF_ROUTE_M;
    }
    if (!stale && !(offRoute && Date.now() - plannedAt.current > REPLAN_MIN_MS)) return;
    if (planning.current || Date.now() - failedAt.current < RETRY_AFTER_FAILURE_MS) return;
    planning.current = true;
    plannedAt.current = Date.now();
    const plannedLeg = leg;
    getRoute({ from: { address: '', latitude: from.latitude, longitude: from.longitude }, to })
      .then((r) => {
        if (!r) {
          failedAt.current = Date.now();
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_AFTER_FAILURE_MS);
          return;
        }
        failedAt.current = 0;
        setRoute({ leg: plannedLeg, rideId, points: r.points });
      })
      .finally(() => {
        planning.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, leg, from?.latitude, from?.longitude, to?.latitude, to?.longitude, retry]);

  // Never draw the other leg's route while this one is being planned.
  return route && route.leg === leg && route.rideId === rideId ? route.points : [];
}
