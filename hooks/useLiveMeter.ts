import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { RideType, rideTypeFareFactor } from '../types/ride';

// Builds the running trip meter for the driver live-meter screen: it watches
// GPS and accumulates travelled distance (Haversine between successive fixes),
// tracks elapsed time from when the meter was started, and prices the fare the
// same way the rest of the app estimates it — (baseFare + km × farePerKm)
// scaled by the ride-type factor. The meter is a local instrument: the
// authoritative final fare still comes from the backend on completion.
export interface MeterParams {
  baseFare: number;
  farePerKm: number;
  rideType: RideType;
}

export function useLiveMeter(params: MeterParams | null) {
  const [metering, setMetering] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startRef = useRef<number>(0);
  const lastFixRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Watch GPS while the meter is running, accumulating distance.
  useEffect(() => {
    if (!metering) return;

    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      subscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (position) => {
          if (cancelled) return;
          const { latitude, longitude } = position.coords;
          const prev = lastFixRef.current;
          if (prev && prev.latitude !== latitude && prev.longitude !== longitude) {
            const delta = haversineKm(prev.latitude, prev.longitude, latitude, longitude);
            setDistanceKm((d) => d + delta);
          }
          lastFixRef.current = { latitude, longitude };
        }
      );
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [metering]);

  // One-second elapsed-time ticker while the meter runs.
  useEffect(() => {
    if (!metering) return;
    tickerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
    };
  }, [metering]);

  function startMeter() {
    lastFixRef.current = null;
    startRef.current = Date.now();
    setDistanceKm(0);
    setElapsedSeconds(0);
    setMetering(true);
  }

  function stopMeter() {
    setMetering(false);
  }

  function resetMeter() {
    stopMeter();
    setDistanceKm(0);
    setElapsedSeconds(0);
  }

  const factor = params ? rideTypeFareFactor(params.rideType) : 0;
  const fare =
    params && metering
      ? Math.max(0, (params.baseFare || 0) + distanceKm * (params.farePerKm || 0)) * factor
      : 0;

  return { metering, startMeter, stopMeter, resetMeter, distanceKm, elapsedSeconds, fare };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}