import { useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';

import { useAuthStore } from '../stores/useAuthStore';
import { getCurrentRide, cancelRide } from '../services/ride-service';
import { canCancelRide, Ride } from '../types/ride';
import { markRideOpened, wasRideOpened } from '../utils/opened-rides';
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

const SEARCH_GIVE_UP_MS = 10 * 60 * 1000;

export function screenForRide(ride: Ride) {
  if (ride.status === 'searchingDriver' || ride.status === 'scheduled') {
    return { pathname: '/(main)/ride/searching-driver', params: { rideId: ride.id } } as const;
  }
  if (ride.status === 'driverAssigned' || ride.status === 'driverArriving' || ride.status === 'driverArrived') {
    return { pathname: '/(main)/ride/driver-accepted', params: { rideId: ride.id } } as const;
  }
  // pinVerified, inProgress, arrived, paymentPending
  return { pathname: '/(main)/ride/tracking', params: { rideId: ride.id } } as const;
}
export function useActiveRideRestore() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [checking, setChecking] = useState(true);

  // Live pathname without re-running the effect (and resetting the 15s
  // cadence) on every navigation.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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
        .then(async (ride) => {
          if (cancelled) return;
          if (
            ride &&
            ride.status === 'searchingDriver' &&
            ride.createdAt &&
            Date.now() - new Date(ride.createdAt).getTime() > SEARCH_GIVE_UP_MS
          ) {
            try {
              await cancelRide(ride.id, 'No driver available nearby');
            } catch {
              // Server may have already cancelled it — treat as cancelled.
            }
            if (cancelled) return;
            setActiveRide(null);
            return;
          }

          const isActive = ride && ACTIVE_STATUSES.has(ride.status);
          setActiveRide(isActive ? ride : null);
            
          const p = pathnameRef.current ?? '';
          const onHomeRoot = p === '/' || p === '(main)/(tabs)' || p.endsWith('/(main)/(tabs)') || p.endsWith('/(tabs)');
          if (isActive && ride && onHomeRoot && !wasRideOpened(ride.id)) {
            markRideOpened(ride.id);
            router.push(screenForRide(ride));
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
    // pathname intentionally excluded — read via pathnameRef inside the
    // interval closure so navigation doesn't reset the polling timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const canRequestRide = !activeRide && !checking;

  return {
    activeRide,
    checking,
    canRequestRide,
    cancellable: activeRide ? canCancelRide(activeRide.status) : false,
  };
}
