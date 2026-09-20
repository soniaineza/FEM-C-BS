import { useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';

import { useAuthStore } from '../stores/useAuthStore';
import { getCurrentRide, cancelRide } from '../services/ride-service';
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

// A search that has found no driver for this long is never going to (the
// matcher only considers drivers within 5 km of the pickup — see server
// driverMatcher.js). Rather than trapping the passenger behind an eternal
// "Finding your driver…" that also blocks every new booking (the backend's
// duplicate-ride guard rejects with 409), the client gives up on it:
// auto-cancel (always free — no driver was ever assigned) and clear the way.
// The server's scheduler now runs the same sweep globally; this client-side
// guard also covers rides created before that server change deploys.
const SEARCH_GIVE_UP_MS = 10 * 60 * 1000;

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
//
// Redirect discipline: the auto-redirect only ever fires while Home is the
// visible screen. Previously a mid-wizard user (picking a vehicle, entering a
// destination…) got router.replace()d out of their screen by the 15s poll
// whenever a stale ride existed — the reported "buttons stop working /
// crashing" behavior. Stale searches past the give-up window are cancelled
// instead of redirecting, so Home becomes usable again with no user action.
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

          // A search nobody accepted within the give-up window is dead
          // weight — cancel it and move on. Never touches rides with a
          // driver involved (those need the driver-side flow) or scheduled
          // rides (they haven't started searching yet).
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
          // Only yank the user when they are actually sitting on Home —
          // never mid-wizard, never on a ride screen that is already
          // tracking this ride.
          const p = pathnameRef.current ?? '';
          const onHomeRoot = p === '/' || p === '(main)/(tabs)' || p.endsWith('/(main)/(tabs)') || p.endsWith('/(tabs)');
          if (isActive && ride && onHomeRoot) {
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
