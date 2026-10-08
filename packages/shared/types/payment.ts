export type PaymentMethodType = 'cash' | 'mobileMoney' | 'card' | 'wallet';

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  detail: string;
}

// lib/models/payment.dart's PaymentMethod.defaults, plus 'wallet' — the
// backend's chargePayment() (server/src/services/payments.js) has a real
// wallet debit path, so Kimu Wallet is bookable as a ride payment method.
// 'card' is listed but the backend's PROVIDER_METHODS only routes
// mtn_momo/airtel_money through Paypack — card charges would stay pending,
// so it is filtered out by getBookablePaymentMethods() until a card
// processor exists.
export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', type: 'cash', detail: '' },
  { id: 'mtn_momo', name: 'MTN MoMo', type: 'mobileMoney', detail: '' },
  { id: 'airtel_money', name: 'Airtel Money', type: 'mobileMoney', detail: '' },
  { id: 'wallet', name: 'Kimu Wallet', type: 'wallet', detail: '' },
  { id: 'card', name: 'Card', type: 'card', detail: '' },
];

// Methods the backend can actually charge today. 'card' is excluded until a
// card processor is wired into server/src/services/payments.js.
export const BOOKABLE_PAYMENT_METHOD_IDS = ['cash', 'mtn_momo', 'airtel_money', 'wallet'];

// Mirrors server/src/services/paymentState.js. `refund_pending` is money the
// provider collected for an attempt that had already ended (or could not be
// applied): it is owed back to the rider and did not pay the fare.
export type PaymentStatus =
  | 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'refund_pending' | 'refunded';

const PAYMENT_STATUSES = ['pending', 'processing', 'succeeded', 'failed', 'expired', 'refund_pending', 'refunded'] as const;

export function paymentStatusFromId(id: string): PaymentStatus {
  return PAYMENT_STATUSES.includes(id as PaymentStatus) ? (id as PaymentStatus) : 'pending';
}

export function isPaymentSettled(status: PaymentStatus): boolean {
  return status === 'succeeded';
}

/** The attempt is over and did not pay the fare: retry or pay cash. */
export function isPaymentUnpaidFinal(status: PaymentStatus): boolean {
  return status === 'failed' || status === 'expired' || status === 'refund_pending' || status === 'refunded';
}

export interface PaymentRecord {
  id: string;
  rideId: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  createdAt: string;
  provider?: string;
  reference?: string;
  externalReference?: string;
  updatedAt?: string;
}

export function paymentRecordFromBackendJson(json: any): PaymentRecord {
  return {
    id: json.id,
    rideId: json.rideId ?? json.ride_id,
    amount: json.amount,
    method: json.method,
    status: paymentStatusFromId(json.status),
    createdAt: json.createdAt ?? json.created_at,
    provider: json.provider ?? undefined,
    reference: json.reference ?? undefined,
    externalReference: json.externalReference ?? json.external_reference ?? undefined,
    updatedAt: json.updatedAt ?? json.updated_at ?? undefined,
  };
}

export function isProviderNotConfigured(record: PaymentRecord): boolean {
  return record.provider === 'provider_not_configured';
}
