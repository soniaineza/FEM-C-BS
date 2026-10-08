import { getToken } from '../storage/session';
import { createApiClient } from '@kimu/shared/services/http';

// The rider app's client: every domain service module (auth-service.ts,
// ride-service.ts, ...) goes through this, with the rider's stored token.
export { ApiError } from '@kimu/shared/services/http';

export const apiClient = createApiClient(getToken);
