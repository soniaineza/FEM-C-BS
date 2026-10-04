import { useEffect, useState } from 'react';

import { useDriverLocationStore } from '../stores/useDriverLocationStore';
import { RideType, rideTypeFareFactor } from '../types/ride';
import { tariffFare } from '../utils/tariff';

// The running trip meter on the driver's trip screen: distance travelled (from
// the driver's GPS fixes), time since the trip started, time spent standing
// still (waiting), and the fare those add up to under the Kimu tariff
// (utils/tariff.ts) scaled by the ride-type factor. It is a local instrument:
// the authoritative final fare still comes from the backend on completion.
export interface MeterParams {
  rideId: string;
  rideType: RideType;
  /** When the trip started (ISO); the clock runs from here, not from when the screen opened. */
  startedAt?: string;
}

interface MeterState {
  startMs: number;
  distanceKm: number;
  waitingMs: number;
  lastTickAt: number;
  distanceAtLastTick: number;
  lastFix: { latitude: number; longitude: number } | null;
}

// Kept per ride outside the component, so leaving the trip screen and coming
// back continues the same meter instead of starting again from zero.
const meters = new Map<string, MeterState>();

const MIN_STEP_KM = 0.003; // ignore GPS jitter below ~3 m
const MAX_STEP_KM = 0.5; // ignore jumps (a lost fix, a relaunch)

function meterFor(params: MeterParams): MeterState {
  let m = meters.get(params.rideId);
  if (!m) {
    const now = Date.now();
    const started = params.startedAt ? Date.parse(params.startedAt) : NaN;
    m = { startMs: Number.isFinite(started) ? started : now, distanceKm: 0, waitingMs: 0, lastTickAt: now, distanceAtLastTick: 0, lastFix: null };
    meters.set(params.rideId, m);
  }
  return m;
}

/** Pass the trip's params while it is under way, or null when no trip is running. */
export function useLiveMeter(params: MeterParams | null) {
  const rideId = params?.rideId ?? null;
  const [, setTick] = useState(0);
  const fix = useDriverLocationStore((s) => s.fix);

  // Distance: add each new GPS fix's step.
  useEffect(() => {
    if (!params || !fix) return;
    const m = meterFor(params);
    if (m.lastFix) {
      const step = haversineKm(m.lastFix.latitude, m.lastFix.longitude, fix.latitude, fix.longitude);
      if (step < MIN_STEP_KM) return; // keep the old anchor so slow creeping still adds up
      if (step <= MAX_STEP_KM) m.distanceKm += step;
    }
    m.lastFix = { latitude: fix.latitude, longitude: fix.longitude };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, fix?.latitude, fix?.longitude]);

  // Clock: once a second, count the time since the last tick as waiting if the
  // car has not moved. Uses real elapsed time, so a delayed or doubled timer
  // cannot over-count.
  useEffect(() => {
    if (!params) return;
    const m = meterFor(params);
    m.lastTickAt = Date.now();
    m.distanceAtLastTick = m.distanceKm;
    const timer = setInterval(() => {
      const now = Date.now();
      if (m.distanceKm - m.distanceAtLastTick < MIN_STEP_KM) m.waitingMs += now - m.lastTickAt;
      m.lastTickAt = now;
      m.distanceAtLastTick = m.distanceKm;
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  if (!params) return { metering: false, distanceKm: 0, elapsedSeconds: 0, waitingSeconds: 0, fare: 0 };
  const m = meterFor(params);
  const waitingSeconds = Math.floor(m.waitingMs / 1000);
  return {
    metering: true,
    distanceKm: m.distanceKm,
    elapsedSeconds: Math.max(0, Math.floor((Date.now() - m.startMs) / 1000)),
    waitingSeconds,
    fare: tariffFare(m.distanceKm, waitingSeconds / 60).total * rideTypeFareFactor(params.rideType),
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
