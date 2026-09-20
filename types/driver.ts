// Driver-side counterpart to types/passenger.ts. Field names verified
// against server/src/utils/serialize.js's driverToJson() (server/src/routes/
// driverProfile.routes.js and drivers.routes.js both return this shape).
export type DriverStatus = 'offline' | 'active' | 'busy' | 'suspended';

export interface DriverProfile {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  photoUrl?: string;
  licenseNumber?: string;
  verified: boolean;
  status: DriverStatus;
  vehicleId?: string;
  rating: number | null;
  totalTrips: number;
  isProfileComplete: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  vehiclePlate?: string;
}

export function driverFromBackendJson(json: any): DriverProfile {
  return {
    id: json.id,
    fullName: json.fullName ?? json.full_name ?? '',
    phone: json.phone ?? '',
    email: json.email ?? undefined,
    photoUrl: json.photoUrl ?? json.photo_url ?? undefined,
    licenseNumber: json.licenseNumber ?? json.license_number ?? undefined,
    verified: Boolean(json.verified),
    status: (json.status ?? 'offline') as DriverStatus,
    vehicleId: json.vehicleId ?? json.vehicle_id ?? undefined,
    rating: json.rating ?? null,
    totalTrips: json.totalTrips ?? json.total_trips ?? 0,
    isProfileComplete: Boolean(json.isProfileComplete ?? json.is_profile_complete ?? false),
    emergencyContactName: json.emergencyContactName ?? undefined,
    emergencyContactPhone: json.emergencyContactPhone ?? undefined,
    preferredLanguage: json.preferredLanguage ?? 'en',
    vehicleMake: json.vehicleMake ?? undefined,
    vehicleModel: json.vehicleModel ?? undefined,
    vehicleYear: json.vehicleYear ?? undefined,
    vehicleColor: json.vehicleColor ?? undefined,
    vehiclePlate: json.vehiclePlate ?? undefined,
  };
}

export function driverCanGoActive(driver: DriverProfile): boolean {
  // Matches the backend's own gate: findNearestDriver() (driverMatcher.js)
  // only ever matches verified=TRUE drivers, so an unverified driver going
  // "active" would just sit online without ever being offered a ride.
  return driver.verified;
}

export interface DriverDocument {
  id: string;
  docType: 'license' | 'national_id' | 'vehicle_registration' | 'insurance' | 'profile_photo' | 'vehicle_photo' | 'other';
  fileUrl?: string;
  fileName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejectionReason?: string;
  expiresAt?: string;
  uploadedAt: string;
  reviewedAt?: string;
}

export function driverDocumentFromBackendJson(json: any): DriverDocument {
  return {
    id: json.id,
    docType: json.docType,
    fileUrl: json.fileUrl ?? undefined,
    fileName: json.fileName ?? undefined,
    status: json.status,
    rejectionReason: json.rejectionReason ?? undefined,
    expiresAt: json.expiresAt ?? undefined,
    uploadedAt: json.uploadedAt,
    reviewedAt: json.reviewedAt ?? undefined,
  };
}

export interface DriverEarningsSummary {
  today: { amount: number; rides: number };
  week: { amount: number; rides: number };
  month: { amount: number; rides: number };
  total: { amount: number; rides: number };
  pendingBalance: number;
  rating: number | null;
  totalTrips: number;
}

export interface DriverEarningEntry {
  id: string;
  rideId: string;
  grossAmount: number;
  commission: number;
  netAmount: number;
  paymentMethod: string;
  status: 'pending' | 'settled' | 'refunded';
  pickupAddress: string;
  destAddress: string;
  distanceKm: number;
  rideType: string;
  createdAt: string;
  settledAt?: string;
}

export interface DriverPayout {
  id: string;
  amount: number;
  method: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';
  reference?: string;
  createdAt: string;
  processedAt?: string;
}

export interface DriverRating {
  rating: number;
  comment?: string;
  passengerName: string;
  createdAt: string;
}

export interface DriverRatingSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number }[];
}
