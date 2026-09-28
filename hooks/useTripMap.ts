import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapCar, MapPadding, MapScene } from '../components/map/map-types';
import { distanceM, projectOnRoute } from '../components/map/trackInterpolation';
import { CAR_COLOR_NAMES } from '../components/map/carModel';
import { getRoute } from '../services/location-service';
import type { DriverLocation } from '../services/ride-service';
import type { Ride } from '../types/ride';

const OFF_ROUTE_M = 150; // re-plan the approach route if the driver strays this far
const REPLAN_MIN_MS = 20_000;

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
  const planning = useRef(false);

  // (Re)plan the road route for the current phase.
  useEffect(() => {
    if (!ride) return;
    const from = phase === 'toPickup' ? driverLocation : ride.pickup;
    const to = phase === 'toPickup' ? ride.pickup : ride.destination;
    if (!from || from.latitude == null || from.longitude == null || to.latitude == null) return;

    const stale = !route || route.phase !== phase;
    let offRoute = false;
    if (!stale && phase === 'toPickup' && driverLocation) {
      const proj = projectOnRoute(route!.coords, driverLocation.latitude, driverLocation.longitude);
      offRoute = !!proj && distanceM(proj.point[1], proj.point[0], driverLocation.latitude, driverLocation.longitude) > OFF_ROUTE_M;
    }
    if (!stale && !(offRoute && Date.now() - plannedAt.current > REPLAN_MIN_MS)) return;
    if (planning.current) return;
    planning.current = true;
    plannedAt.current = Date.now();
    getRoute({ from: { address: '', ...from }, to })
      .then((r) => {
        if (!r) return;
        const coords = r.points.map((p) => [p.longitude, p.latitude] as [number, number]);
        setRoute({ coords, durationS: r.durationSeconds, lengthM: lengthM(coords), phase });
      })
      .finally(() => {
        planning.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, phase, driverLocation?.latitude, driverLocation?.longitude]);

  // Remaining time: the route's own duration, scaled by how much is left.
  const etaMinutes = useMemo(() => {
    if (!route || !driverLocation || route.lengthM <= 0) return null;
    const proj = projectOnRoute(route.coords, driverLocation.latitude, driverLocation.longitude);
    if (!proj) return null;
    const rest: [number, number][] = [proj.point, ...route.coords.slice(proj.index + 1)];
    const fraction = Math.min(1, lengthM(rest) / route.lengthM);
    return Math.max(1, Math.round((route.durationS * fraction) / 60));
  }, [route, driverLocation]);

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
