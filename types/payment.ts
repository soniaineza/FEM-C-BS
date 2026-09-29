export type PaymentMethodType = 'cash' | 'mobileMoney' | 'card' | 'wallet';

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  detail: string;
}

// lib/models/payment.dart's PaymentMethod.defaults, plus 'wallet' — the
// backend's chargePayment() (server/src/services/payments.js) has a real
// wallet debit path, so FEM Wallet is bookable as a ride payment method.
// 'card' is listed but the backend's PROVIDER_METHODS only routes
// mtn_momo/airtel_money through Paypack — card charges would stay pending,
// so it is filtered out by getBookablePaymentMethods() until a card
// processor exists.
export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', type: 'cash', detail: '' },
  { id: 'mtn_momo', name: 'MTN MoMo', type: 'mobileMoney', detail: '' },
  { id: 'airtel_money', name: 'Airtel Money', type: 'mobileMoney', detail: '' },
  { id: 'wallet', name: 'FEM Wallet', type: 'wallet', detail: '' },
  { id: 'card', name: 'Card', type: 'card', detail: '' },
];

// Methods the backend can charge without asking it. The live list comes from
// GET /api/config (services/app-config.ts): 'card' is added there when the
// server runs with DEMO_PAYMENTS=1.
export const BOOKABLE_PAYMENT_METHOD_IDS = ['cash', 'mtn_momo', 'airtel_money', 'wallet'];

/** How each method is presented: icon, brand tile and a one-line explainer key. */
export const PAYMENT_METHOD_META: Record<string, { icon: string; tile: string; fg: string; description: string }> = {
  cash: { icon: 'cash-outline', tile: '#DCFCE7', fg: '#15803D', description: 'payMethodCashDesc' },
  mtn_momo: { icon: 'phone-portrait-outline', tile: '#FFCC00', fg: '#101828', description: 'payMethodMomoDesc' },
  airtel_money: { icon: 'phone-portrait-outline', tile: '#E40000', fg: '#FFFFFF', description: 'payMethodMomoDesc' },
  wallet: { icon: 'wallet-outline', tile: '#101828', fg: '#FFFFFF', description: 'payMethodWalletDesc' },
  card: { icon: 'card-outline', tile: '#1570EF', fg: '#FFFFFF', description: 'payMethodCardDesc' },
};

export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';

export function paymentStatusFromId(id: string): PaymentStatus {
  return (['pending', 'processing', 'succeeded', 'failed', 'refunded'] as const).includes(id as PaymentStatus)
    ? (id as PaymentStatus)
    : 'pending';
}

export function isPaymentSettled(status: PaymentStatus): boolean {
  return status === 'succeeded' || status === 'refunded';
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
