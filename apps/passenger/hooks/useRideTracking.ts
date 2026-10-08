import { useEffect, useState } from 'react';

import { getRideDetails, getDriverLocation, DriverLocation } from '../services/ride-service';
import { Ride } from '@kimu/shared/types/ride';
import { openRideStream } from '../utils/ride-stream';

// How long to wait between requests when the live stream is delivering
// updates (a safety net only) and when it is not (the only source).
const POLL_WITH_STREAM_MS = 15000;
const POLL_WITHOUT_STREAM_MS = 3000;
const STREAM_RETRY_MS = 15000;
// With no position for this long the driver's phone has stopped reporting;
// the map then says so instead of leaving the car frozen in place.
const LOCATION_SILENCE_MS = 50000;

// Follows one ride: its state and the driver's live position.
//
// The driver's position is pushed by the backend over the ride stream
// (driver GPS -> backend -> stream -> this hook), so the rider's map moves as
// the driver does without the app asking every second. A slow poll runs
// alongside as a safety net, and takes over at a faster rate whenever the
// stream cannot be opened or drops; the stream is then retried.
//
// Polling uses setTimeout chained after each response (never setInterval),
// with a `cancelled` flag checked before every state update, so requests
// cannot stack up and nothing fires after the screen is left.
export function useRideTracking(rideId: string | null) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [serverTimeOffsetMs, setOffset] = useState(0);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let streamRetry: ReturnType<typeof setTimeout> | null = null;
    let closeStream: (() => void) | null = null;
    let streamLive = false;
    let lastStatus: string | null = null;
    let lastLocationAt = 0;
    let offset: number | null = null;

    const noteServerTime = (serverTime: number | undefined, sentAt: number) => {
      if (!serverTime) return;
      // Smoothed server-minus-device clock offset for the map's animation.
      const sample = serverTime - (sentAt + Date.now()) / 2;
      offset = offset == null ? sample : offset * 0.8 + sample * 0.2;
      setOffset(Math.round(offset));
    };

    async function refreshRide() {
      const details = await getRideDetails(rideId!);
      if (cancelled) return;
      lastStatus = details.status;
      setRide(details);
    }

    async function poll() {
      const sentAt = Date.now();
      try {
        const [, location] = await Promise.all([refreshRide(), getDriverLocation(rideId!)]);
        if (cancelled) return;
        if (location) lastLocationAt = Date.now();
        // A fresher pushed position is not replaced by an older polled one.
        if (location || Date.now() - lastLocationAt > LOCATION_SILENCE_MS) setDriverLocation(location);
        noteServerTime(location?.serverTime, sentAt);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('tracking failed'));
      }
      if (!cancelled) timer = setTimeout(poll, streamLive ? POLL_WITH_STREAM_MS : POLL_WITHOUT_STREAM_MS);
    }

    function connect() {
      if (cancelled) return;
      closeStream = openRideStream(rideId!, {
        onEvent: (event) => {
          if (cancelled) return;
          streamLive = true;
          if (event.type === 'driverLocation' && event.location) {
            lastLocationAt = Date.now();
            setDriverLocation({ ...event.location, serverTime: event.serverTime });
            noteServerTime(event.serverTime, Date.now());
          } else if (event.type === 'ride') {
            // The stream repeats the ride every few seconds; only a change
            // of status is worth re-reading the full ride for.
            if (event.ride?.status && event.ride.status !== lastStatus) refreshRide().catch(() => {});
          } else {
            refreshRide().catch(() => {});
          }
        },
        onClose: (reason) => {
          streamLive = false;
          if (cancelled || reason === 'ended') return;
          streamRetry = setTimeout(connect, STREAM_RETRY_MS);
        },
      });
    }

    poll();
    connect();
    const silence = setInterval(() => {
      if (!cancelled && lastLocationAt && Date.now() - lastLocationAt > LOCATION_SILENCE_MS) setDriverLocation(null);
    }, 5000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (streamRetry) clearTimeout(streamRetry);
      clearInterval(silence);
      closeStream?.();
    };
  }, [rideId]);

  return { ride, driverLocation, error, serverTimeOffsetMs };
}
