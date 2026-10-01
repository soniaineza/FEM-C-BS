// Entry point of the on-device backend. Importing this file registers every
// route (account, rides, driver) with the in-process router; the API clients
// then call `offlineRequest` instead of fetch when OFFLINE_DEMO is on.

import './account';
import './rides';
import './driver';

import { dispatch, type OfflineResponse } from './http';

/** Pause before answering, so spinners and disabled buttons behave as they do over a network. */
const LATENCY_MS = 120;

export async function offlineRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  token: string | null
): Promise<OfflineResponse> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  return dispatch(method, path, body, token);
}

export { flushDb } from './db';
