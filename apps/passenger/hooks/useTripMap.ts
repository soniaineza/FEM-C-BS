import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapCar, MapPadding, MapScene } from '@kimu/shared/components/map/map-types';
import { distanceM, projectOnRoute } from '@kimu/shared/components/map/trackInterpolation';
import { CAR_COLOR_NAMES } from '@kimu/shared/components/map/carColors';
import { getRoute } from '@kimu/shared/services/location-service';
import type { DriverLocation } from '../services/ride-service';
import type { Ride } from '@kimu/shared/types/ride';

const OFF_ROUTE_M = 150; // re-plan the approach route if the driver strays this far
const REPLAN_MIN_MS = 20_000;
const RETRY_AFTER_FAILURE_MS = 10_000; // a route the server could not give is asked for again, not on every fix

type Phase = 'toPickup' | 'onTrip';

function phaseOf(ride: Ride | null): Phase {
  const onTrip = ride && ['pinVerified', 'inProgress', 'arrived', 'paymentPending', 'completed'].includes(ride.status);
  return onTrip ? 'onTrip' : 'toPickup';
}

function lengthM(coords: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distanceM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  return m;
}

/**
 * Map scene + live ETA for a matched ride: the assigned car on the road
 * route to the pickup (then to the destination), with the route trimmed
 * behind the car, a following camera and remaining-time estimate.
 */
export function useTripMap(
  ride: Ride | null,
  driverLocation: DriverLocation | null,
  serverTimeOffsetMs: number,
  padding: MapPadding
) {
  const phase = phaseOf(ride);
  const [route, setRoute] = useState<{ coords: [number, number][]; durationS: number; lengthM: number; phase: Phase } | null>(null);
  const plannedAt = useRef(0);
  const failedAt = useRef(0);
  const planning = useRef(false);
  // Bumped a while after a failed request so the plan is retried even while
  // the driver stands still (no new position would trigger it otherwise).
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // (Re)plan the road route for the current phase.
  useEffect(() => {
    if (!ride) return;
    const from = phase === 'toPickup' ? driverLocation : ride.pickup;
    const to = phase === 'toPickup' ? ride.pickup : ride.destination;
    if (!from || from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return;

    const stale = !route || route.phase !== phase;
    let offRoute = false;
    if (!stale && phase === 'toPickup' && driverLocation) {
      const proj = projectOnRoute(route!.coords, driverLocation.latitude, driverLocation.longitude);
      offRoute = !!proj && distanceM(proj.point[1], proj.point[0], driverLocation.latitude, driverLocation.longitude) > OFF_ROUTE_M;
    }
    if (!stale && !(offRoute && Date.now() - plannedAt.current > REPLAN_MIN_MS)) return;
    if (planning.current || Date.now() - failedAt.current < RETRY_AFTER_FAILURE_MS) return;
    planning.current = true;
    plannedAt.current = Date.now();
    getRoute({ from: { address: '', ...from }, to })
      .then((r) => {
        if (!r) {
          failedAt.current = Date.now();
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_AFTER_FAILURE_MS);
          return;
        }
        failedAt.current = 0;
        const coords = r.points.map((p) => [p.longitude, p.latitude] as [number, number]);
        setRoute({ coords, durationS: r.durationSeconds, lengthM: lengthM(coords), phase });
      })
      .finally(() => {
        planning.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, phase, driverLocation?.latitude, driverLocation?.longitude, retry]);

  // Remaining time: the route's own duration, scaled by how much is left.
  // Only from this leg's route: right after pickup the approach route is
  // still held until the trip route arrives, and measuring the trip against
  // it would say "1 min" (or keep saying it, if the trip route never comes).
  const etaMinutes = useMemo(() => {
    if (!route || route.phase !== phase || !driverLocation || route.lengthM <= 0) return null;
    const proj = projectOnRoute(route.coords, driverLocation.latitude, driverLocation.longitude);
    if (!proj) return null;
    const rest: [number, number][] = [proj.point, ...route.coords.slice(proj.index + 1)];
    const fraction = Math.min(1, lengthM(rest) / route.lengthM);
    return Math.max(1, Math.round((route.durationS * fraction) / 60));
  }, [route, phase, driverLocation]);

  const scene = useMemo<MapScene | null>(() => {
    if (!ride || ride.pickup.latitude == null || ride.destination.latitude == null) return null;
    const car: MapCar | null = driverLocation
      ? {
          id: 'driver',
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
          heading: driverLocation.heading,
          trail: driverLocation.trail,
          vehicleClass: ride.vehicle.id,
          assigned: true,
          color: CAR_COLOR_NAMES[(ride.driver?.vehicleColor ?? '').trim().toLowerCase()] ?? null,
        }
      : null;
    const target = phase === 'toPickup' ? ride.pickup : ride.destination;
    return {
      camera: { mode: car ? 'follow' : 'fit', pitch: 45, zoom: 17, padding },
      routes: route && route.phase === phase ? [{ coordinates: route.coords, trimBehindCarId: car ? 'driver' : undefined, animateIn: true }] : [],
      markers: [
        {
          id: phase === 'toPickup' ? 'pickup' : 'destination',
          kind: phase === 'toPickup' ? 'pickup' : 'destination',
          latitude: target.latitude!,
          longitude: target.longitude!,
          label: target.address.split(',')[0],
        },
      ],
      cars: car ? [car] : [],
      serverTimeOffsetMs,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, ride?.status, phase, route, driverLocation, serverTimeOffsetMs]);

  return { scene, etaMinutes, phase };
}
