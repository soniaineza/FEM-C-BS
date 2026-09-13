import 'dart:convert';

import 'payment.dart';
import 'place.dart';
import 'vehicle.dart';
import '../core/localization/app_localizations.dart';

enum RideStatus {
  searchingDriver,
  driverAssigned,
  driverArriving,
  inProgress,
  completed,
  cancelled;

  String get label => switch (this) {
        RideStatus.searchingDriver => 'Searching for driver',
        RideStatus.driverAssigned => 'Driver assigned',
        RideStatus.driverArriving => 'Driver arriving',
        RideStatus.inProgress => 'In progress',
        RideStatus.completed => 'Completed',
        RideStatus.cancelled => 'Cancelled',
      };

  String labelFor(AppLocalizations l10n) => switch (this) {
        RideStatus.searchingDriver => l10n.findingDriver,
        RideStatus.driverAssigned => l10n.driverFound,
        RideStatus.driverArriving => l10n.driverOnWay,
        RideStatus.inProgress => l10n.tripInProgress,
        RideStatus.completed => l10n.completed,
        RideStatus.cancelled => l10n.cancelled,
      };
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
    this.isEstimate = true,
  });

  final Vehicle vehicle;
  final double distanceKm;
  final int durationMinutes;
  final double estimatedFare;
  final bool isEstimate;

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
    this.driver,
    this.createdAt,
    this.startedAt,
    this.completedAt,
    this.finalFare,
    this.rating,
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
  final Driver? driver;
  final DateTime? createdAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final double? finalFare;
  final int? rating;

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
    Driver? driver,
    DateTime? createdAt,
    DateTime? startedAt,
    DateTime? completedAt,
    double? finalFare,
    int? rating,
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
      driver: driver ?? this.driver,
      createdAt: createdAt ?? this.createdAt,
      startedAt: startedAt ?? this.startedAt,
      completedAt: completedAt ?? this.completedAt,
      finalFare: finalFare ?? this.finalFare,
      rating: rating ?? this.rating,
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