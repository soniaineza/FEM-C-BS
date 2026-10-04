import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapCar, MapPadding, MapScene } from '../components/map/map-types';
import { distanceM, projectOnRoute } from '../components/map/trackInterpolation';
import { CAR_COLOR_NAMES } from '../components/map/map-types';
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
  const generation = useRef(0);
  const latestDriver = useRef(driverLocation);
  latestDriver.current = driverLocation;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ride) return;
    const timer = setInterval(() => setTick((n) => n + 1), REPLAN_MIN_MS);
    return () => clearInterval(timer);
  }, [ride?.id]);
  const key = ride ? `${ride.id}:${phase}:${ride.pickup.latitude}:${ride.pickup.longitude}:${ride.destination.latitude}:${ride.destination.longitude}` : '';
  const plannedKey = useRef('');
  useEffect(() => {
    const id = ++generation.current;
    if (!ride) { setRoute(null); plannedKey.current = ''; return; }
    const driverLocation = latestDriver.current;
    const from = phase === 'toPickup' ? driverLocation : ride.pickup;
    const to = phase === 'toPickup' ? ride.pickup : ride.destination;
    if (!from || from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return;
    const stale = plannedKey.current !== key || !route;
    // Only the approach is planned from the driver's position, so only it can be
    // re-planned when they stray; the trip leg runs pickup to destination either way.
    const proj = phase === 'toPickup' && route && driverLocation ? projectOnRoute(route.coords, driverLocation.latitude, driverLocation.longitude) : null;
    const offRoute = proj && driverLocation && distanceM(proj.point[1], proj.point[0], driverLocation.latitude, driverLocation.longitude) > OFF_ROUTE_M;
    if (!stale && !(offRoute && Date.now() - plannedAt.current > REPLAN_MIN_MS)) return;
    if (plannedKey.current !== key) setRoute(null);
    let cancelled = false;
    void getRoute({ from: { address: '', ...from }, to }).then((r) => {
      if (!r || cancelled || id !== generation.current) return;
      plannedAt.current = Date.now();
      plannedKey.current = key;
      const coords = r.points.map((p) => [p.longitude, p.latitude] as [number, number]);
      setRoute({ coords, durationS: r.durationSeconds, lengthM: lengthM(coords), phase });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [key, Boolean(driverLocation), tick]);

  // Remaining time: the route's own duration, scaled by how much is left.
  const etaMinutes = useMemo(() => {
    if (!route || plannedKey.current !== key || !driverLocation || route.lengthM <= 0) return null;
    const proj = projectOnRoute(route.coords, driverLocation.latitude, driverLocation.longitude);
    if (!proj) return null;
    const rest: [number, number][] = [proj.point, ...route.coords.slice(proj.index + 1)];
    const fraction = Math.min(1, lengthM(rest) / route.lengthM);
    return Math.max(1, Math.round((route.durationS * fraction) / 60));
  }, [route, driverLocation, key]);

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
      routes: route && plannedKey.current === key && route.phase === phase ? [{ coordinates: route.coords, trimBehindCarId: car ? 'driver' : undefined, animateIn: true }] : [],
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
  }, [ride, phase, route, driverLocation, serverTimeOffsetMs, padding, key]);

  return { scene, etaMinutes, phase };
}
