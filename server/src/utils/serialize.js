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
  rideToJson,
  notificationToJson,
};
