import 'dart:convert';

import 'payment.dart';
import 'place.dart';
import 'ride_type.dart';
import 'vehicle.dart';
import '../core/localization/app_localizations.dart';

enum RideStatus {
  scheduled,
  searchingDriver,
  driverAssigned,
  driverArriving,
  driverArrived,
  pinVerified,
  inProgress,
  arrived,
  paymentPending,
  completed,
  cancelled;

  String get label => switch (this) {
        RideStatus.scheduled => 'Scheduled',
        RideStatus.searchingDriver => 'Searching for driver',
        RideStatus.driverAssigned => 'Driver assigned',
        RideStatus.driverArriving => 'Driver arriving',
        RideStatus.driverArrived => 'Driver arrived',
        RideStatus.pinVerified => 'Ride started',
        RideStatus.inProgress => 'In progress',
        RideStatus.arrived => 'Arrived',
        RideStatus.paymentPending => 'Waiting for payment',
        RideStatus.completed => 'Completed',
        RideStatus.cancelled => 'Cancelled',
      };

  String labelFor(AppLocalizations l10n) => switch (this) {
        RideStatus.scheduled => l10n.scheduled,
        RideStatus.searchingDriver => l10n.findingDriver,
        RideStatus.driverAssigned => l10n.driverFound,
        RideStatus.driverArriving => l10n.driverOnWay,
        RideStatus.driverArrived => l10n.driverArrived,
        RideStatus.pinVerified => l10n.tripInProgress,
        RideStatus.inProgress => l10n.tripInProgress,
        RideStatus.arrived => l10n.arrived,
        RideStatus.paymentPending => l10n.waitingForPayment,
        RideStatus.completed => l10n.completed,
        RideStatus.cancelled => l10n.cancelled,
      };

  /// Rides that can still be cancelled by the passenger.
  bool get canCancel =>
      this == RideStatus.scheduled ||
      this == RideStatus.searchingDriver ||
      this == RideStatus.driverAssigned ||
      this == RideStatus.driverArriving ||
      this == RideStatus.driverArrived;
}

/// A driver assigned to a ride by the backend.
///
/// Driver objects are ONLY created from real backend responses. Development
/// builds never fabricate a driver.
class Driver {
  const Driver({
    required this.name,
    required this.phone,
    required this.rating,
    required this.vehicleModel,
    required this.vehicleColor,
    required this.licensePlate,
    this.photoUrl,
    this.latitude,
    this.longitude,
    this.etaMinutes,
  });

  final String name;
  final String phone;
  final double rating;
  final String vehicleModel;
  final String vehicleColor;
  final String licensePlate;
  final String? photoUrl;

  /// Live driver position, when the backend shares it.
  final double? latitude;
  final double? longitude;

  /// Estimated minutes until the driver reaches the pickup.
  final int? etaMinutes;

  Driver copyWith({
    String? name,
    String? phone,
    double? rating,
    String? vehicleModel,
    String? vehicleColor,
    String? licensePlate,
    String? photoUrl,
    double? latitude,
    double? longitude,
    int? etaMinutes,
  }) {
    return Driver(
      name: name ?? this.name,
      phone: phone ?? this.phone,
      rating: rating ?? this.rating,
      vehicleModel: vehicleModel ?? this.vehicleModel,
      vehicleColor: vehicleColor ?? this.vehicleColor,
      licensePlate: licensePlate ?? this.licensePlate,
      photoUrl: photoUrl ?? this.photoUrl,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      etaMinutes: etaMinutes ?? this.etaMinutes,
    );
  }

  /// Parses a driver object from the backend ride payload.
  factory Driver.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? const {};
    return Driver(
      name: map['name'] as String? ?? 'Driver',
      phone: map['phone'] as String? ?? '',
      rating: (map['rating'] as num?)?.toDouble() ?? 0,
      vehicleModel: map['vehicleModel'] as String? ?? '',
      vehicleColor: map['vehicleColor'] as String? ?? '',
      licensePlate: map['licensePlate'] as String? ?? '',
      photoUrl: map['photoUrl'] as String?,
    );
  }
}

/// An estimate computed for display before a ride is confirmed.
///
/// [isEstimate] is always true for pre-trip amounts. The final fare is set by
/// the backend once the trip ends.
class FareEstimate {
  const FareEstimate({
    required this.vehicle,
    required this.distanceKm,
    required this.durationMinutes,
    required this.estimatedFare,
    this.rideType = RideType.private,
    this.isEstimate = true,
  });

  final Vehicle vehicle;
  final double distanceKm;
  final int durationMinutes;
  final double estimatedFare;
  final RideType rideType;
  final bool isEstimate;

  /// The amount saved compared with the same private trip (0 for private).
  double get savings =>
      (estimatedFare / rideType.fareFactor) - estimatedFare;

  String get formattedDistance => '${distanceKm.toStringAsFixed(1)} km';
}

/// A passenger ride request and, once assigned, its live state.
class Ride {
  const Ride({
    required this.id,
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.paymentMethod,
    required this.status,
    required this.estimatedFare,
    required this.distanceKm,
    required this.durationMinutes,
    this.rideType = RideType.private,
    this.note,
    this.driver,
    this.createdAt,
    this.startedAt,
    this.completedAt,
    this.finalFare,
    this.rating,
    this.pin,
    this.scheduledFor,
    this.appliedDiscount,
    this.isPooled = false,
  });

  final String id;
  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final PaymentMethod paymentMethod;
  final RideStatus status;
  final double estimatedFare;
  final double distanceKm;
  final int durationMinutes;
  final RideType rideType;

  /// Optional note from the passenger to the driver (e.g. "at the main gate").
  final String? note;
  final Driver? driver;
  final DateTime? createdAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final double? finalFare;
  final int? rating;

  /// The 4-digit ride PIN the passenger shows the driver at pickup (only set
  /// once the driver reports arrival).
  final String? pin;

  /// When the ride was scheduled for, if it was booked in advance.
  final DateTime? scheduledFor;

  /// Promotion discount applied server-side to the estimated fare.
  final double? appliedDiscount;

  /// Set once this shared ride has actually been pooled with another
  /// passenger in the same vehicle (real pooling, not just a discount).
  final bool isPooled;

  bool get hasDriver => driver != null;

  Ride copyWith({
    String? id,
    Place? pickup,
    Place? destination,
    Vehicle? vehicle,
    PaymentMethod? paymentMethod,
    RideStatus? status,
    double? estimatedFare,
    double? distanceKm,
    int? durationMinutes,
    RideType? rideType,
    String? note,
    Driver? driver,
    DateTime? createdAt,
    DateTime? startedAt,
    DateTime? completedAt,
    double? finalFare,
    int? rating,
    String? pin,
    DateTime? scheduledFor,
    double? appliedDiscount,
    bool? isPooled,
  }) {
    return Ride(
      id: id ?? this.id,
      pickup: pickup ?? this.pickup,
      destination: destination ?? this.destination,
      vehicle: vehicle ?? this.vehicle,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      status: status ?? this.status,
      estimatedFare: estimatedFare ?? this.estimatedFare,
      distanceKm: distanceKm ?? this.distanceKm,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      rideType: rideType ?? this.rideType,
      note: note ?? this.note,
      driver: driver ?? this.driver,
      createdAt: createdAt ?? this.createdAt,
      startedAt: startedAt ?? this.startedAt,
      completedAt: completedAt ?? this.completedAt,
      finalFare: finalFare ?? this.finalFare,
      rating: rating ?? this.rating,
      pin: pin ?? this.pin,
      scheduledFor: scheduledFor ?? this.scheduledFor,
      appliedDiscount: appliedDiscount ?? this.appliedDiscount,
      isPooled: isPooled ?? this.isPooled,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'pickup': pickup.toJson(),
        'destination': destination.toJson(),
        'vehicle': {
          'id': vehicle.id,
          'name': vehicle.name,
        },
        'rideType': rideType.id,
        'note': note,
        'paymentMethodId': paymentMethod.id,
        'status': status.name,
        'estimatedFare': estimatedFare,
        'distanceKm': distanceKm,
        'durationMinutes': durationMinutes,
        'driver': driver == null
            ? null
            : {
                'name': driver!.name,
                'vehicleModel': driver!.vehicleModel,
                'vehicleColor': driver!.vehicleColor,
                'licensePlate': driver!.licensePlate,
              },
        'createdAt': createdAt?.toIso8601String(),
        'startedAt': startedAt?.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'finalFare': finalFare,
        'rating': rating,
      };

  String toJsonString() => jsonEncode(toJson());

  /// Parses a ride returned by the FEM C@BS backend.
  ///
  /// [vehicle] is the catalogue vehicle this ride uses (the backend returns
  /// only the vehicle id). [fallbackMethod] supplies the payment method when
  /// the id is not one of the known defaults.
  factory Ride.fromBackendJson(
    Object? json, {
    required Vehicle vehicle,
    PaymentMethod? fallbackMethod,
  }) {
    final map = json as Map<String, dynamic>;

    Place readPlace(Map<String, dynamic>? place) => Place(
          address: place?['address'] as String? ?? '',
          latitude: (place?['latitude'] as num?)?.toDouble(),
          longitude: (place?['longitude'] as num?)?.toDouble(),
        );

    final methodId = map['paymentMethodId'] as String? ?? 'cash';
    PaymentMethod method;
    try {
      method = PaymentMethod.defaults.firstWhere((m) => m.id == methodId);
    } catch (_) {
      method = fallbackMethod ?? PaymentMethod.defaults.first;
    }

    final status = switch (map['status'] as String? ?? 'searchingDriver') {
      'scheduled' => RideStatus.scheduled,
      'searchingDriver' => RideStatus.searchingDriver,
      'driverAssigned' => RideStatus.driverAssigned,
      'driverArriving' => RideStatus.driverArriving,
      'driverArrived' => RideStatus.driverArrived,
      'pinVerified' => RideStatus.pinVerified,
      'inProgress' => RideStatus.inProgress,
      'arrived' => RideStatus.arrived,
      'paymentPending' => RideStatus.paymentPending,
      'completed' => RideStatus.completed,
      'cancelled' => RideStatus.cancelled,
      _ => RideStatus.searchingDriver,
    };

    return Ride(
      id: map['id'] as String? ?? '',
      pickup: readPlace(map['pickup'] as Map<String, dynamic>?),
      destination: readPlace(map['destination'] as Map<String, dynamic>?),
      vehicle: vehicle,
      paymentMethod: method,
      status: status,
      estimatedFare: (map['estimatedFare'] as num?)?.toDouble() ?? 0,
      distanceKm: (map['distanceKm'] as num?)?.toDouble() ?? 0,
      durationMinutes: (map['durationMinutes'] as num?)?.toInt() ?? 0,
      rideType: RideType.fromId(map['rideType'] as String?),
      note: map['note'] as String?,
      driver: map['driver'] == null
          ? null
          : Driver.fromBackendJson(map['driver']),
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? ''),
      startedAt: DateTime.tryParse(map['startedAt'] as String? ?? ''),
      completedAt: DateTime.tryParse(map['completedAt'] as String? ?? ''),
      finalFare: (map['finalFare'] as num?)?.toDouble(),
      rating: (map['rating'] as num?)?.toInt(),
      pin: map['pin'] as String?,
      scheduledFor: DateTime.tryParse(map['scheduledFor'] as String? ?? ''),
      appliedDiscount: (map['appliedDiscount'] as num?)?.toDouble(),
      isPooled: map['isPooled'] as bool? ?? false,
    );
  }
}

/// A first name only, for privacy — another passenger sharing this pooled
/// ride in the same vehicle right now.
class RideCompanion {
  const RideCompanion({required this.firstName, required this.status});

  final String firstName;
  final String status;

  factory RideCompanion.fromBackendJson(Map<String, dynamic> json) {
    return RideCompanion(
      firstName: json['firstName'] as String? ?? 'Passenger',
      status: json['status'] as String? ?? '',
    );
  }
}

/// A single GPS breadcrumb recorded while a driver was actively driving a
/// ride, used to draw the real path the ride took once it's over.
class RoutePoint {
  const RoutePoint({
    required this.latitude,
    required this.longitude,
    this.recordedAt,
  });

  final double latitude;
  final double longitude;
  final DateTime? recordedAt;

  factory RoutePoint.fromBackendJson(Map<String, dynamic> json) {
    return RoutePoint(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      recordedAt: DateTime.tryParse(json['recordedAt'] as String? ?? ''),
    );
  }
}

/// Formats RWF amounts for display.
String formatFare(double amount) {
  final rounded = amount.round();
  final digits = rounded.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    buffer.write(digits[i]);
    final remaining = digits.length - i - 1;
    if (remaining > 0 && remaining % 3 == 0) buffer.write(',');
  }
  return '$buffer RWF';
}