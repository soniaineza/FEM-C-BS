// Shared pieces of the on-device backend: JSON serializers (the same shapes as
// server/src/utils/serialize.js), notifications and validation helpers.

import {
  iso,
  uid,
  type Db,
  type DriverRec,
  type NotificationRec,
  type PassengerRec,
  type PaymentRec,
  type RideRec,
  type TicketRec,
} from './db';
import { HttpError } from './http';

export const CALL_CENTER_PHONE = '112'; // Rwanda's national emergency number

export function passengerToJson(p: PassengerRec) {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    email: p.email,
    photoUrl: p.photoUrl,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    isProfileComplete: p.isProfileComplete,
    isVerified: Boolean(p.verifiedAt),
  };
}

export function driverToJson(d: DriverRec) {
  return {
    id: d.id,
    fullName: d.fullName,
    phone: d.phone,
    email: d.email,
    photoUrl: d.photoUrl,
    licenseNumber: d.licenseNumber,
    verified: d.verified,
    status: d.status,
    vehicleId: d.vehicleId,
    rating: d.rating,
    totalTrips: d.totalTrips,
    isProfileComplete: d.isProfileComplete,
    emergencyContactName: d.emergencyContactName,
    emergencyContactPhone: d.emergencyContactPhone,
    preferredLanguage: d.preferredLanguage,
    vehicleMake: d.vehicleMake,
    vehicleModel: d.vehicleModel,
    vehicleYear: d.vehicleYear,
    vehicleColor: d.vehicleColor,
    vehiclePlate: d.vehiclePlate,
  };
}

export function rideToJson(r: RideRec, opts: { passengerView?: boolean } = {}) {
  return {
    id: r.id,
    rideType: r.rideType,
    note: r.note,
    pickup: { address: r.pickup.address, latitude: r.pickup.latitude, longitude: r.pickup.longitude },
    destination: { address: r.destination.address, latitude: r.destination.latitude, longitude: r.destination.longitude },
    vehicleId: r.vehicleId,
    paymentMethodId: r.paymentMethodId,
    status: r.status,
    distanceKm: r.distanceKm,
    durationMinutes: r.durationMinutes,
    estimatedFare: r.estimatedFare,
    fareBreakdown: r.fareBreakdown,
    surgeMultiplier: r.surgeMultiplier,
    finalFare: r.finalFare,
    driver: r.driver,
    // The driver app shows who it is picking up; a simulated rider waits at the pickup point.
    rider: r.riderName ? { name: r.riderName, latitude: r.pickup.latitude, longitude: r.pickup.longitude } : null,
    // The trip PIN is a passenger-held secret; driver views never carry it.
    pin: opts.passengerView ? r.pin : null,
    cancellationReason: r.cancellationReason,
    cancelledBy: r.cancelledBy,
    scheduledFor: r.scheduledFor,
    appliedDiscount: r.appliedDiscount,
    poolGroupId: null,
    isPooled: r.rideType === 'shared',
    createdAt: r.createdAt,
    acceptedAt: r.acceptedAt,
    arrivedAt: r.arrivedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    rating: r.rating,
    ratingComment: r.ratingComment,
  };
}

export function paymentToJson(p: PaymentRec | null) {
  if (!p) return null;
  return {
    id: p.id,
    rideId: p.rideId,
    amount: p.amount,
    method: p.method,
    status: p.status,
    state: p.state,
    provider: p.provider,
    reference: p.reference,
    externalReference: null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function ticketToJson(t: TicketRec) {
  return {
    id: t.id,
    rideId: t.rideId,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function notificationToJson(n: NotificationRec) {
  return { id: n.id, title: n.title, body: n.body, type: n.type, rideId: n.rideId, createdAt: n.createdAt, read: n.read };
}

export function notify(
  db: Db,
  role: 'passenger' | 'driver',
  ownerId: string,
  n: { title: string; body: string; type?: string; rideId?: string | null; at?: number }
): void {
  db.notifications.push({
    id: uid('ntf', db),
    role,
    ownerId,
    title: n.title,
    body: n.body,
    type: n.type ?? 'general',
    rideId: n.rideId ?? null,
    read: false,
    createdAt: iso(n.at ?? Date.now()),
  });
  // Keep the on-device store bounded.
  if (db.notifications.length > 600) db.notifications.splice(0, db.notifications.length - 600);
}

export function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, message);
  return value.trim();
}

export function parseLatLng(value: unknown): { latitude: number; longitude: number } | null {
  const [lat, lng] = String(value ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
}

export const formatRwf = (n: number) => `RWF ${Math.round(n).toLocaleString('en-US')}`;
