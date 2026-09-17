import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { useAuthStore } from '../stores/useAuthStore';
import { getCurrentRide } from '../services/ride-service';
import { canCancelRide, Ride } from '../types/ride';

// Non-terminal statuses that mean the passenger still has a live ride to
// return to after closing and reopening the app. Matches the backend's
// GET /rides/current ("most recent NON terminal ride").
const ACTIVE_STATUSES = new Set([
  'scheduled',
  'searchingDriver',
  'driverAssigned',
  'driverArriving',
  'driverArrived',
  'pinVerified',
  'inProgress',
  'arrived',
  'paymentPending',
]);

function screenForRide(ride: Ride) {
  if (ride.status === 'searchingDriver' || ride.status === 'scheduled') {
    return { pathname: '/(main)/ride/searching-driver', params: { rideId: ride.id } } as const;
  }
  if (ride.status === 'driverAssigned' || ride.status === 'driverArriving' || ride.status === 'driverArrived') {
    return { pathname: '/(main)/ride/driver-accepted', params: { rideId: ride.id } } as const;
  }
  // pinVerified, inProgress, arrived, paymentPending
  return { pathname: '/(main)/ride/tracking', params: { rideId: ride.id } } as const;
}

// Restores the active-ride experience when the app is (re)opened while a ride
// is live — spec: "the application must recover correctly if the app is
// closed and reopened during an active ride." Polls GET /rides/current on
// focus and, when a non-terminal ride exists, routes to its matching screen.
// The ride screens themselves then track the ride to completion. Also covers
// the "passenger must not request a second ride while one is active" rule:
// callers surface hasActiveRide to block the booking flow.
export function useActiveRideRestore() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setActiveRide(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function check() {
      getCurrentRide()
        .then((ride) => {
          if (cancelled) return;
          const isActive = ride && ACTIVE_STATUSES.has(ride.status);
          setActiveRide(isActive ? ride : null);
          if (isActive && ride) {
            router.replace(screenForRide(ride));
          }
        })
        .catch(() => {
          // Backend unreachable — keep whatever state we had; the offline
          // banner and the screens' own error handling cover the UX.
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }

    check();
    // Periodic re-check while Home is visible. Rides move quickly; a light
    // 15s cadence is enough because the ride screens run their own 2s
    // tracking loop — this only exists to catch rides started elsewhere
    // (e.g. support/operator booking) and post-restart restoration.
    timer = setInterval(check, 15_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [currentUser?.id]);

  const canRequestRide = !activeRide && !checking;

  return {
    activeRide,
    checking,
    canRequestRide,
    cancellable: activeRide ? canCancelRide(activeRide.status) : false,
  };
}
