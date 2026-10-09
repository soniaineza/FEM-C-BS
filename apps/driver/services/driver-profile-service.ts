import { driverApiClient } from './driver-api-client';
import {
  DriverDocument,
  DriverEarningEntry,
  DriverBalance,
  DriverEarningsSummary,
  DriverSettlement,
  DriverPayout,
  DriverPayoutQuote,
  DriverRating,
  DriverRatingSummary,
  driverDocumentFromBackendJson,
} from '../types/driver';
import { NotificationItem, notificationFromBackendJson } from '@kimu/shared/types/notification';
import { SupportTicket, SupportMessage, supportTicketFromBackendJson, supportMessageFromBackendJson } from '@kimu/shared/types/support';

// Response envelopes verified against server/src/routes/driverProfile.routes.js.

// ---- Vehicle ----
export interface DriverVehicleInfo {
  currentVehicleId: string | null;
  make: string;
  model: string;
  year: number | null;
  color: string;
  plate: string;
  licenseNumber: string;
}

export async function getDriverVehicle(): Promise<DriverVehicleInfo> {
  const json = await driverApiClient.get<{ vehicle: DriverVehicleInfo }>('/driver/vehicle');
  return json.vehicle;
}

export async function updateDriverVehicle(patch: {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  vehiclePlate?: string;
  licenseNumber?: string;
}): Promise<void> {
  await driverApiClient.put('/driver/vehicle', patch);
}

// ---- Documents ----
export async function getDriverDocuments(): Promise<DriverDocument[]> {
  const json = await driverApiClient.get<{ documents: any[] }>('/driver/documents');
  return json.documents.map(driverDocumentFromBackendJson);
}

/**
 * Uploads the actual document file (multipart, field `file`). `file` is a
 * Blob/File on the web, or React Native's `{ uri, name, type }` file part on
 * Android/iOS — RN's FormData sends a local file from its URI and does not
 * serialise a Blob, so the two platforms hand over the file differently.
 */
export async function submitDriverDocument(params: {
  docType: DriverDocument['docType'];
  file: Blob | { uri: string; name: string; type: string };
  fileName: string;
  expiresAt?: string;
}): Promise<void> {
  const form = new FormData();
  form.append('docType', params.docType);
  form.append('fileName', params.fileName);
  if (params.expiresAt) form.append('expiresAt', params.expiresAt);
  if (typeof Blob !== 'undefined' && params.file instanceof Blob) {
    form.append('file', params.file, params.fileName);
  } else {
    // React Native file part; the web FormData typings do not know this shape.
    form.append('file', params.file as unknown as Blob);
  }
  await driverApiClient.post('/driver/documents', form);
}

// ---- Earnings ----
export async function getDriverEarningsSummary(): Promise<DriverEarningsSummary> {
  const json = await driverApiClient.get<{ earnings: DriverEarningsSummary }>('/driver/earnings');
  return json.earnings;
}

export async function getDriverEarningsHistory(): Promise<DriverEarningEntry[]> {
  const json = await driverApiClient.get<{ earnings: DriverEarningEntry[] }>('/driver/earnings/history');
  return json.earnings;
}

// ---- Payouts ----
export async function getDriverPayouts(): Promise<{ payouts: DriverPayout[]; balance: DriverBalance }> {
  return driverApiClient.get<{ payouts: DriverPayout[]; balance: DriverBalance }>('/driver/payouts');
}

/** The payout amount, provider fee and amount received for [amount]. */
export async function quoteDriverPayout(amount: number): Promise<DriverPayoutQuote> {
  const json = await driverApiClient.get<{ quote: DriverPayoutQuote }>(`/driver/payouts/quote?amount=${amount}`);
  return json.quote;
}

/** Asks for [amount] of the available balance to be paid out; an operator
 * approves it before the money is sent. */
export async function requestDriverPayout(amount: number): Promise<DriverPayout> {
  const json = await driverApiClient.post<{ payout: DriverPayout }>('/driver/payouts', { amount });
  return json.payout;
}

/** Pays the commission owed on cash trips from the driver's mobile money. */
export async function settleDriverCommission(): Promise<DriverSettlement> {
  const json = await driverApiClient.post<{ settlement: DriverSettlement }>('/driver/balance/settle', {});
  return json.settlement;
}

// ---- Ratings ----
export async function getDriverRatings(): Promise<{ ratings: DriverRating[]; summary: DriverRatingSummary }> {
  return driverApiClient.get<{ ratings: DriverRating[]; summary: DriverRatingSummary }>('/driver/ratings');
}

// ---- Notifications ----
export async function getDriverNotifications(): Promise<NotificationItem[]> {
  const json = await driverApiClient.get<{ notifications: any[] }>('/driver/notifications');
  return json.notifications.map(notificationFromBackendJson);
}

export async function markDriverNotificationRead(id: string): Promise<void> {
  await driverApiClient.post(`/driver/notifications/${id}/read`);
}

export async function markAllDriverNotificationsRead(): Promise<void> {
  await driverApiClient.post('/driver/notifications/read-all');
}

export async function getDriverUnreadNotificationCount(): Promise<number> {
  const json = await driverApiClient.get<{ count: number }>('/driver/notifications/unread-count');
  return json.count;
}

export async function registerDriverDeviceToken(token: string, platform?: string): Promise<void> {
  await driverApiClient.post('/driver/device-token', { token, platform });
}

// ---- Support ----
const DRIVER_SUPPORT_CATEGORIES = {
  general: 'general',
  payment: 'payment',
  reportPassenger: 'report_passenger',
  appIssue: 'app_issue',
  billing: 'billing',
  vehicleIssue: 'vehicle_issue',
  lostItem: 'lost_item',
} as const;

export async function submitDriverSupportRequest(params: {
  category: keyof typeof DRIVER_SUPPORT_CATEGORIES;
  subject: string;
  message: string;
  rideId?: string;
}): Promise<SupportTicket> {
  const json = await driverApiClient.post<{ ticket: any }>('/driver/support', {
    category: DRIVER_SUPPORT_CATEGORIES[params.category],
    subject: params.subject,
    message: params.message,
    rideId: params.rideId,
  });
  return supportTicketFromBackendJson(json.ticket);
}

export async function getDriverSupportTickets(): Promise<SupportTicket[]> {
  const json = await driverApiClient.get<{ tickets: any[] }>('/driver/support');
  return json.tickets.map(supportTicketFromBackendJson);
}

export async function getDriverTicketWithMessages(
  ticketId: string
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
  const json = await driverApiClient.get<{ ticket: any; messages: any[] }>(`/driver/support/${ticketId}`);
  return {
    ticket: supportTicketFromBackendJson(json.ticket),
    messages: json.messages.map(supportMessageFromBackendJson),
  };
}

export async function replyToDriverTicket(ticketId: string, message: string): Promise<SupportMessage> {
  const json = await driverApiClient.post<{ message: any }>(`/driver/support/${ticketId}/messages`, { message });
  return supportMessageFromBackendJson(json.message);
}

export { DRIVER_SUPPORT_CATEGORIES };

// ---- Emergency ----
export interface EmergencyResult {
  id: string;
  status: string;
  reference: string;
  // The Kimu Transport call-center number the app dials with the OS dialer —
  // served by the backend (EMERGENCY_CALL_CENTER_PHONE in server/.env) so it
  // can be rotated without an app release.
  callCenterPhone?: string;
}

export async function reportDriverEmergency(params: {
  rideId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  details?: string;
}): Promise<EmergencyResult> {
  const json = await driverApiClient.post<{ emergency: EmergencyResult }>('/driver/emergency', params);
  return json.emergency;
}

export interface DriverTripShare {
  token: string;
  expiresAt: string;
  url: string;
}

// The share page is served from the same origin as the API (see
// server/src/index.js), so the link is derived from the configured base URL
// rather than hardcoded to one deployment.
function apiOrigin(): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
  return new URL(base).origin;
}

/** A live link the driver can send to someone they trust for this trip. */
export async function createDriverTripShare(rideId: string): Promise<DriverTripShare> {
  const json = await driverApiClient.post<{ share: { token: string; expires_at: string } }>(
    '/driver/share',
    { rideId }
  );
  return {
    token: json.share.token,
    expiresAt: json.share.expires_at,
    url: `${apiOrigin()}/share/${json.share.token}`,
  };
}

export type IncidentCategory = 'unsafe_passenger' | 'threat' | 'damage' | 'accident' | 'other';

/** A safety report about a trip, read by an operator. */
export async function reportDriverIncident(params: {
  rideId?: string;
  category: IncidentCategory;
  details?: string;
}): Promise<{ id: string; status: string }> {
  const json = await driverApiClient.post<{ report: { id: string; status: string } }>(
    '/driver/incidents',
    params
  );
  return json.report;
}
