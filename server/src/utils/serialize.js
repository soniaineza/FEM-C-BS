/** Maps DB rows to the JSON shapes the client models expect. */

function passengerToJson(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    photoUrl: row.photo_url,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    isProfileComplete: row.is_profile_complete,
  };
}

function vehicleToJson(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    baseFare: Number(row.base_fare),
    farePerKm: Number(row.fare_per_km),
    etaMinutes: row.eta_minutes,
    isMock: false,
  };
}

function savedPlaceToJson(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    place: {
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      isCurrentLocation: false,
    },
  };
}

function driverToJson(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    licenseNumber: row.license_number,
    verified: row.verified,
    status: row.status,
    vehicleId: row.current_vehicle_id,
    rating: row.rating == null ? null : Number(row.rating),
    totalTrips: row.total_trips,
  };
}

function driverFromRide(row) {
  if (!row.driver_name) return null;
  return {
    name: row.driver_name,
    phone: row.driver_phone,
    rating: row.driver_rating == null ? null : Number(row.driver_rating),
    vehicleModel: row.driver_vehicle_model,
    vehicleColor: row.driver_vehicle_color,
    licensePlate: row.driver_license_plate,
  };
}

function rideToJson(row) {
  return {
    id: row.id,
    rideType: row.ride_type || 'private',
    note: row.ride_note || null,
    pickup: {
      address: row.pickup_address,
      latitude: row.pickup_latitude,
      longitude: row.pickup_longitude,
    },
    destination: {
      address: row.dest_address,
      latitude: row.dest_latitude,
      longitude: row.dest_longitude,
    },
    vehicleId: row.vehicle_id,
    paymentMethodId: row.payment_method,
    status: row.status,
    distanceKm: Number(row.distance_km),
    durationMinutes: row.duration_minutes,
    estimatedFare: Number(row.estimated_fare),
    finalFare: row.final_fare == null ? null : Number(row.final_fare),
    driver: driverFromRide(row),
    pin: row.ride_pin || null,
    cancellationReason: row.cancellation_reason || null,
    cancelledBy: row.cancelled_by || null,
    scheduledFor: row.scheduled_for || null,
    appliedDiscount: row.applied_discount == null ? null : Number(row.applied_discount),
    poolGroupId: row.pool_group_id || null,
    isPooled: !!row.pool_group_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    arrivedAt: row.arrived_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    rating: row.rating,
    ratingComment: row.rating_comment,
  };
}

function paymentToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    rideId: row.ride_id,
    amount: Number(row.amount),
    method: row.method,
    status: row.status,
    state: row.state || row.status,
    provider: row.provider || null,
    reference: row.reference,
    externalReference: row.external_reference || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function receiptToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    paymentId: row.payment_id,
    rideId: row.ride_id,
    amount: Number(row.amount),
    method: row.method,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function promotionToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    minFare: Number(row.min_fare),
    maxDiscount: row.max_discount == null ? null : Number(row.max_discount),
    endsAt: row.ends_at,
  };
}

function notificationToJson(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type || 'general',
    createdAt: row.created_at,
    read: row.read,
  };
}

module.exports = {
  passengerToJson,
  vehicleToJson,
  savedPlaceToJson,
  driverToJson,
  rideToJson,
  notificationToJson,
  paymentToJson,
  receiptToJson,
  promotionToJson,
};
