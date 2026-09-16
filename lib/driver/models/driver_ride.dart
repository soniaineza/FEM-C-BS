
/// A ride as seen from the driver's perspective.
class DriverRide {
  const DriverRide({
    required this.id,
    required this.pickupAddress,
    required this.pickupLatitude,
    required this.pickupLongitude,
    required this.destAddress,
    required this.destLatitude,
    required this.destLongitude,
    required this.distanceKm,
    required this.durationMinutes,
    required this.estimatedFare,
    required this.status,
    required this.paymentMethod,
    required this.rideType,
    this.passengerName,
    this.passengerPhone,
    this.finalFare,
    this.rating,
    this.pin,
    this.note,
    this.createdAt,
    this.acceptedAt,
    this.startedAt,
    this.completedAt,
    this.cancelledAt,
    this.cancellationReason,
    this.cancelledBy,
    this.appliedDiscount,
  });

  final String id;
  final String pickupAddress;
  final double pickupLatitude;
  final double pickupLongitude;
  final String destAddress;
  final double destLatitude;
  final double destLongitude;
  final double distanceKm;
  final int durationMinutes;
  final double estimatedFare;
  final String status;
  final String paymentMethod;
  final String rideType;
  final String? passengerName;
  final String? passengerPhone;
  final double? finalFare;
  final int? rating;
  final String? pin;
  final String? note;
  final DateTime? createdAt;
  final DateTime? acceptedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? cancelledAt;
  final String? cancellationReason;
  final String? cancelledBy;
  final double? appliedDiscount;

  bool get canArrive =>
      status == 'driverAssigned' || status == 'driverArriving';
  bool get canCompletePin =>
      status == 'driverArrived';
  bool get canCompleteTrip =>
      status == 'pinVerified' || status == 'inProgress';
  bool get canCancel =>
      status == 'driverAssigned' || status == 'driverArriving';
  bool get isActive =>
      status != 'completed' && status != 'cancelled' && status != 'searchingDriver';

  factory DriverRide.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? {};
    final pickup = map['pickup'] as Map<String, dynamic>? ?? {};
    final dest = map['destination'] as Map<String, dynamic>? ?? {};
    final driver = map['driver'] as Map<String, dynamic>?;

    return DriverRide(
      id: map['id'] as String? ?? '',
      pickupAddress: pickup['address'] as String? ?? '',
      pickupLatitude: (pickup['latitude'] as num?)?.toDouble() ?? 0,
      pickupLongitude: (pickup['longitude'] as num?)?.toDouble() ?? 0,
      destAddress: dest['address'] as String? ?? '',
      destLatitude: (dest['latitude'] as num?)?.toDouble() ?? 0,
      destLongitude: (dest['longitude'] as num?)?.toDouble() ?? 0,
      distanceKm: (map['distanceKm'] as num?)?.toDouble() ?? 0,
      durationMinutes: (map['durationMinutes'] as num?)?.toInt() ?? 0,
      estimatedFare: (map['estimatedFare'] as num?)?.toDouble() ?? 0,
      status: map['status'] as String? ?? 'searchingDriver',
      paymentMethod: map['paymentMethodId'] as String? ?? 'cash',
      rideType: map['rideType'] as String? ?? 'private',
      passengerName: driver?['name'] as String?,
      passengerPhone: driver?['phone'] as String?,
      finalFare: (map['finalFare'] as num?)?.toDouble(),
      rating: (map['rating'] as num?)?.toInt(),
      pin: map['pin'] as String?,
      note: map['note'] as String?,
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? ''),
      acceptedAt: DateTime.tryParse(map['acceptedAt'] as String? ?? ''),
      startedAt: DateTime.tryParse(map['startedAt'] as String? ?? ''),
      completedAt: DateTime.tryParse(map['completedAt'] as String? ?? ''),
      cancelledAt: DateTime.tryParse(map['cancelledAt'] as String? ?? ''),
      cancellationReason: map['cancellationReason'] as String?,
      cancelledBy: map['cancelledBy'] as String?,
      appliedDiscount: (map['appliedDiscount'] as num?)?.toDouble(),
    );
  }
}

/// A ride card shown to the driver in the history list.
class DriverRideHistory {
  const DriverRideHistory({
    required this.ride,
    required this.date,
  });

  final DriverRide ride;
  final DateTime date;
}
