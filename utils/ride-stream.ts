import { getToken } from '../storage/session';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export interface RideStreamEvent {
  type: string;
  [key: string]: any;
}

// Opens the backend's live ride stream (GET /rides/:id/stream, Server-Sent
// Events): the ride's state and the driver's position are pushed as they
// change, instead of the app asking every couple of seconds.
//
// EventSource cannot send the Authorization header this API requires, so the
// stream is read with XMLHttpRequest, whose responseText grows as events
// arrive (this works both in React Native and in the browser build).
// Returns a function that closes the stream.
export function openRideStream(
  rideId: string,
  handlers: { onEvent: (event: RideStreamEvent) => void; onClose: (reason: 'ended' | 'error') => void }
): () => void {
  let closed = false;
  let xhr: XMLHttpRequest | null = null;

  const finish = (reason: 'ended' | 'error') => {
    if (closed) return;
    closed = true;
    handlers.onClose(reason);
  };

  getToken()
    .then((token) => {
      if (closed) return;
      xhr = new XMLHttpRequest();
      let read = 0;
      xhr.open('GET', `${BASE_URL}/rides/${rideId}/stream`);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onprogress = () => {
        if (closed || !xhr) return;
        // Only complete events (terminated by a blank line) are consumed;
        // a partial one waits for the next chunk.
        const text = xhr.responseText;
        const end = text.lastIndexOf('\n\n');
        if (end < read) return;
        const chunk = text.slice(read, end);
        read = end + 2;
        for (const block of chunk.split('\n\n')) {
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('');
          if (!data) continue;
          try {
            handlers.onEvent(JSON.parse(data));
          } catch {
            // A malformed event is skipped; the next one carries fresh state.
          }
        }
      };
      xhr.onerror = () => finish('error');
      xhr.ontimeout = () => finish('error');
      xhr.onload = () => finish(xhr && xhr.status >= 200 && xhr.status < 300 ? 'ended' : 'error');
      xhr.send();
    })
    .catch(() => finish('error'));

  return () => {
    closed = true;
    try {
      xhr?.abort();
    } catch {
      // already closed
    }
  };
}
