export interface Passenger {
  id?: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  isProfileComplete: boolean;
  isVerified: boolean;
}

export function passengerHasEmergencyContact(p: Passenger): boolean {
  return Boolean(p.emergencyContactName && p.emergencyContactPhone);
}

export function passengerFromBackendJson(json: any): Passenger {
  return {
    id: json.id,
    fullName: json.fullName ?? json.full_name ?? '',
    phone: json.phone ?? '',
    email: json.email ?? '',
    photoUrl: json.photoUrl ?? json.photo_url ?? undefined,
    emergencyContactName: json.emergencyContactName ?? json.emergency_contact_name ?? undefined,
    emergencyContactPhone: json.emergencyContactPhone ?? json.emergency_contact_phone ?? undefined,
    isProfileComplete: Boolean(json.isProfileComplete ?? json.is_profile_complete ?? false),
    isVerified: Boolean(json.isVerified ?? json.verified_at),
  };
}
