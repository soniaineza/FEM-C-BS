import { apiClient } from './api-client';
import { PaymentRecord, paymentRecordFromBackendJson } from '../types/payment';

// Response envelopes verified against server/src/routes/payments.routes.js
// and rides.routes.js's payment/pay-cash endpoints. Never has a dev fallback
// — payments always hit the real API.

export async function initiatePayment(rideId: string): Promise<PaymentRecord> {
  const json = await apiClient.post<{ payment: any }>('/payments', { rideId });
  return paymentRecordFromBackendJson(json.payment);
}

export async function getPaymentForRide(rideId: string): Promise<PaymentRecord | null> {
  const json = await apiClient.get<{ payment: any | null }>(`/rides/${rideId}/payment`);
  return json.payment ? paymentRecordFromBackendJson(json.payment) : null;
}

export async function refreshPaymentStatus(paymentId: string): Promise<PaymentRecord> {
  const json = await apiClient.post<{ payment: any }>(`/payments/${paymentId}/refresh`);
  return paymentRecordFromBackendJson(json.payment);
}

export async function confirmCashPayment(rideId: string): Promise<PaymentRecord> {
  const json = await apiClient.post<{ payment: any }>(`/rides/${rideId}/pay-cash`);
  return paymentRecordFromBackendJson(json.payment);
}
