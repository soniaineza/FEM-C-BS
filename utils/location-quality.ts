import type { LocationObject } from 'expo-location';

export const FIX_MAX_AGE_MS = 30_000;
export const FIX_MAX_ACCURACY_M = 100;

export function usableFix(position: LocationObject, maxAge = FIX_MAX_AGE_MS): boolean {
  const { latitude, longitude, accuracy } = position.coords;
  const age = Date.now() - position.timestamp;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180 &&
    accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= FIX_MAX_ACCURACY_M &&
    Number.isFinite(age) && age >= -5000 && age <= maxAge;
}

export function locationReport(position: LocationObject) {
  const { latitude, longitude, heading, accuracy } = position.coords;
  return { latitude, longitude, heading: heading != null && heading >= 0 ? heading : undefined,
    accuracy: accuracy!, measuredAt: position.timestamp };
}
