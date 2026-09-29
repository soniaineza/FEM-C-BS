import { apiClient } from './api-client';
import { BOOKABLE_PAYMENT_METHOD_IDS } from '../types/payment';

export interface AppConfig {
  /** Server runs with simulated payments (DEMO_PAYMENTS=1). */
  demoPayments: boolean;
  /** Payment method ids a ride can be booked with right now. */
  paymentMethods: string[];
}

const FALLBACK: AppConfig = { demoPayments: false, paymentMethods: BOOKABLE_PAYMENT_METHOD_IDS };
let pending: Promise<AppConfig> | null = null;

/** GET /api/config once per app session; failures fall back and retry next call. */
export function getAppConfig(): Promise<AppConfig> {
  if (!pending) {
    pending = apiClient
      .get<Partial<AppConfig>>('/config')
      .then((c) => ({
        demoPayments: Boolean(c.demoPayments),
        paymentMethods: Array.isArray(c.paymentMethods) && c.paymentMethods.length ? c.paymentMethods : FALLBACK.paymentMethods,
      }))
      .catch(() => {
        pending = null;
        return FALLBACK;
      });
  }
  return pending;
}
