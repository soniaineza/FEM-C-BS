import { getDriverToken } from '../storage/driverSession';
import { createApiClient } from '@kimu/shared/services/http';

// The driver app's client, with the driver's stored token (see
// storage/driverSession.ts).
export { ApiError } from '@kimu/shared/services/http';

export const driverApiClient = createApiClient(getDriverToken);
