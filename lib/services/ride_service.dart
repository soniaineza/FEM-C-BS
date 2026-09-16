import 'dart:async';
import 'dart:math';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/payment.dart';
import '../models/place.dart';
import '../models/ride.dart';
import '../models/ride_type.dart';
import '../models/vehicle.dart';
import 'api_client.dart';

/// Ride booking, estimation and history.
///
/// When a backend URL is configured ([AppConstants.backendConnected]) the
/// catalogue, estimates, requests and live status come from the FEM C@BS API.
/// Otherwise the development build returns clearly marked mock vehicles and
/// real straight-line estimates (computed from the passenger's actual
/// coordinates) so the booking screens stay previewable. It never fabricates a
/// driver or a completed ride.
class RideService {
  /// Development-only vehicle catalogue shown while the backend is offline.
  ///
  /// TODO(backend): Replace with the vehicle list served by the backend.
  List<Vehicle> getAvailableVehicles() => const [
        Vehicle(
          id: 'fem_economy',
          name: 'FEM Economy',
          description: 'Everyday rides at the best price.',
          capacity: 4,
          baseFare: 1200,
          farePerKm: 500,
          etaMinutes: 5,
          isMock: true,
        ),
        Vehicle(
          id: 'fem_comfort',
          name: 'FEM Comfort',
          description: 'Newer cars with extra legroom.',
          capacity: 4,
          baseFare: 1800,
          farePerKm: 700,
          etaMinutes: 6,
          isMock: true,
        ),
        Vehicle(
          id: 'fem_xl',
          name: 'FEM XL',
          description: 'Spacious vehicles for groups and luggage.',
          capacity: 6,
          baseFare: 2500,
          farePerKm: 900,
          etaMinutes: 8,
          isMock: true,
        ),
      ];

  /// Estimates distance, duration and fare for [vehicle] between [pickup] and
  /// [destination].
  ///
  /// Returns null when either place has no coordinates (typed address), in
  /// which case the UI explains that an estimate needs map-selected points.
  /// The distance is the real straight-line distance; the fare is an estimate
  /// and is always labeled as such. The backend sets final fares.
  ///
  /// Shared rides apply [RideType.fareFactor] so pooled trips are cheaper.
  FareEstimate? estimateFare({
    required Vehicle vehicle,
    required Place pickup,
    required Place destination,
    RideType rideType = RideType.private,
  }) {
    if (!pickup.hasCoordinates || !destination.hasCoordinates) return null;

    final distanceKm = straightLineKm(pickup, destination);
    return _buildEstimate(
      vehicle: vehicle,
      distanceKm: distanceKm,
      durationMinutes: _durationMinutes(distanceKm),
      rideType: rideType,
    );
  }

  /// Estimates the fare from a real road route computed by the routing service
  /// instead of the straight-line distance, so the amount matches the actual
  /// streets the driver will take. Like [estimateFare], the result is always
  /// labeled an estimate — the backend sets final fares.
  FareEstimate estimateFareWithRoute({
    required Vehicle vehicle,
    required double distanceMeters,
    required double durationSeconds,
    RideType rideType = RideType.private,
  }) {
    return _buildEstimate(
      vehicle: vehicle,
      distanceKm: distanceMeters / 1000,
      durationMinutes: (durationSeconds / 60).round().clamp(2, 600).toInt(),
      rideType: rideType,
    );
  }

  FareEstimate _buildEstimate({
    required Vehicle vehicle,
    required double distanceKm,
    required int durationMinutes,
    required RideType rideType,
  }) {
    final baseFare = vehicle.baseFare + (distanceKm * vehicle.farePerKm);
    final estimatedFare = baseFare * rideType.fareFactor;

    return FareEstimate(
      vehicle: vehicle,
      distanceKm: distanceKm,
      durationMinutes: durationMinutes,
      estimatedFare: estimatedFare,
      rideType: rideType,
      isEstimate: true,
    );
  }

  /// Great-circle distance between [from] and [to] in kilometres.
  double straightLineKm(Place from, Place to) {
    const earthRadiusKm = 6371.0;
    final lat1 = from.latitude! * pi / 180;
    final lat2 = to.latitude! * pi / 180;
    final dLat = (to.latitude! - from.latitude!) * pi / 180;
    final dLng = (to.longitude! - from.longitude!) * pi / 180;

    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return earthRadiusKm * c;
  }

  int _durationMinutes(double distanceKm) =>
      (distanceKm / AppConstants.estimateAverageSpeedKmh * 60)
          .round()
          .clamp(2, 600)
          .toInt();

  /// Requests a ride and waits for the backend to match a driver.
  ///
  /// In preview mode ([AppConstants.backendConnected] is false) this throws
  /// [BackendNotConnectedException] so the UI never pretends a ride was
  /// created. With a backend configured it POSTs the ride and returns the real
  /// created ride (driver still pending).
  Future<Ride> requestRide({
    required Place pickup,
    required Place destination,
    required Vehicle vehicle,
    required PaymentMethod paymentMethod,
    required FareEstimate estimate,
    RideType rideType = RideType.private,
    String? note,
    String? promotionCode,
    DateTime? scheduledFor,
  }) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Ride booking');
    }
    final data = await apiClient.post(
      'rides',
      body: {
        'pickup': {
          'address': pickup.address,
          'latitude': pickup.latitude,
          'longitude': pickup.longitude,
        },
        'destination': {
          'address': destination.address,
          'latitude': destination.latitude,
          'longitude': destination.longitude,
        },
        'vehicleId': vehicle.id,
        'paymentMethodId': paymentMethod.id,
        'rideType': rideType.id,
        'rideNote': note,
        'promotionCode': promotionCode,
        'scheduledFor': scheduledFor?.toIso8601String(),
      },
    );
    return Ride.fromBackendJson(
      data['ride'],
      vehicle: vehicle,
      fallbackMethod: paymentMethod,
    );
  }

  /// The passenger's most recent non-terminal ride, if one is still active
  /// (used to restore the ride screen after the app restarts).
  Future<Ride?> getCurrentRide() async {
    if (!AppConstants.backendConnected) return null;
    final data = await apiClient.get('rides/current');
    final ride = data['ride'];
    if (ride == null) return null;
    final catalog = await fetchVehicles();
    return Ride.fromBackendJson(
      ride,
      vehicle: _matchVehicle(
        (ride as Map<String, dynamic>)['vehicleId'] as String?,
        catalog,
      ),
    );
  }

  /// Changes the destination while the driver has not picked the passenger up.
  Future<Ride> changeDestination(String rideId, Place destination) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Destination change');
    }
    final data = await apiClient.post(
      'rides/$rideId/change-destination',
      body: {
        'destination': {
          'address': destination.address,
          'latitude': destination.latitude,
          'longitude': destination.longitude,
        },
      },
    );
    final catalog = await fetchVehicles();
    return Ride.fromBackendJson(
      data['ride'],
      vehicle: _matchVehicle(
        (data['ride'] as Map<String, dynamic>)['vehicleId'] as String?,
        catalog,
      ),
    );
  }

  /// The live driver position (delivered by the backend from real GPS).
  Future<({double latitude, double longitude})?> getDriverLocation(
    String rideId,
  ) async {
    if (!AppConstants.backendConnected) return null;
    final data = await apiClient.get('rides/$rideId/driver-location');
    final location = data['location'] as Map<String, dynamic>?;
    if (location == null) return null;
    final lat = (location['latitude'] as num?)?.toDouble();
    final lng = (location['longitude'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return (latitude: lat, longitude: lng);
  }

  /// The actual GPS breadcrumbs recorded while the driver drove this ride, in
  /// chronological order. Used to draw the real road path travelled (rather
  /// than a straight pickup -> destination line) once the trip has ended.
  /// Returns an empty list in preview mode or when nothing was recorded.
  Future<List<RoutePoint>> getRideRoute(String rideId) async {
    if (!AppConstants.backendConnected) return const [];
    final data = await apiClient.get('rides/$rideId/route');
    final points = (data['points'] as List<dynamic>? ?? []);
    return points
        .map((p) => RoutePoint.fromBackendJson(p as Map<String, dynamic>))
        .toList();
  }

  /// Other passengers actually pooled into the same vehicle right now (only
  /// non-empty for a shared ride that has really been matched with someone
  /// else — see [Ride.isPooled]).
  Future<List<RideCompanion>> getRideCompanions(String rideId) async {
    if (!AppConstants.backendConnected) return const [];
    final data = await apiClient.get('rides/$rideId/companions');
    final companions = (data['companions'] as List<dynamic>? ?? []);
    return companions
        .map((c) => RideCompanion.fromBackendJson(c as Map<String, dynamic>))
        .toList();
  }

  /// Approximate positions of online drivers near [latitude]/[longitude], for
  /// the home map's "cars near you" decoration. Real backend data — never a
  /// fabricated list — so it comes back empty rather than invented when no
  /// backend is configured or no driver is currently online nearby.
  Future<List<({double latitude, double longitude})>> getNearbyDrivers({
    required double latitude,
    required double longitude,
  }) async {
    if (!AppConstants.backendConnected) return const [];
    final data = await apiClient.get(
      'drivers/nearby?lat=$latitude&lng=$longitude',
    );
    final drivers = (data['drivers'] as List<dynamic>? ?? []);
    return drivers
        .map((d) {
          final map = d as Map<String, dynamic>;
          final lat = (map['latitude'] as num?)?.toDouble();
          final lng = (map['longitude'] as num?)?.toDouble();
          return (lat, lng);
        })
        .where((p) => p.$1 != null && p.$2 != null)
        .map((p) => (latitude: p.$1!, longitude: p.$2!))
        .toList();
  }

  /// Cancels a requested or active ride.
  Future<void> cancelRide(String rideId) async {
    if (!AppConstants.backendConnected) return;
    await apiClient.post('rides/$rideId/cancel');
  }

  /// Past rides for the passenger.
  Future<List<Ride>> getRideHistory() async {
    if (!AppConstants.backendConnected) return [];
    final data = await apiClient.get('rides');
    final rides = (data['rides'] as List<dynamic>? ?? []);
    final catalog = await fetchVehicles();
    return rides.map(
      (ride) => Ride.fromBackendJson(
        ride,
        vehicle: _matchVehicle(
          (ride as Map<String, dynamic>)['vehicleId'] as String?,
          catalog,
        ),
      ),
    ).toList();
  }

  Future<Ride> getRideDetails(String rideId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Ride details');
    }
    final data = await apiClient.get('rides/$rideId');
    final catalog = await fetchVehicles();
    return Ride.fromBackendJson(
      data['ride'],
      vehicle: _matchVehicle(
        (data['ride'] as Map<String, dynamic>)['vehicleId'] as String?,
        catalog,
      ),
    );
  }

  Future<void> rateRide({
    required String rideId,
    required int rating,
    String? comment,
  }) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Rating');
    }
    await apiClient.post(
      'rides/$rideId/rate',
      body: {'rating': rating, 'comment': comment},
    );
  }

  /// Real-time ride updates.
  ///
  /// Against the live backend this polls the ride endpoint (the API exposes a
  /// Server-Sent Events stream; polling keeps the client light and works
  /// everywhere). In preview mode an empty stream is returned so listening
  /// screens stay in their loading state instead of inventing events.
  Stream<Ride> subscribeToRide(String rideId) {
    if (!AppConstants.backendConnected) {
      return const Stream.empty();
    }

    Timer? timer;
    Ride? last;
    ({double latitude, double longitude})? lastLocation;
    final rideIdForLocation = rideId;
    late final StreamController<Ride> controller;
    controller = StreamController<Ride>(
      onListen: () {
        Future<void> poll() async {
          try {
            final ride = await getRideDetails(rideId);
            final changed = last == null || ride.status != last!.status ||
                ride.driver?.name != last!.driver?.name;
            if (changed) {
              last = ride;
              if (!controller.isClosed) {
                try {
                  controller.add(ride);
                } catch (_) {
                  // Listener may have cancelled in the meantime.
                }
              }
            }
          } catch (_) {
            // Transient failure: keep trying; the UI keeps its loading state.
          }

          // Merge the live driver GPS so the map marker moves in real time.
          if (controller.isClosed) {
            return;
          }
          try {
            final location = await getDriverLocation(rideIdForLocation);
            if (location != null &&
                (lastLocation == null ||
                    (location.latitude - lastLocation!.latitude).abs() > 0.00001 ||
                    (location.longitude - lastLocation!.longitude).abs() >
                        0.00001)) {
              lastLocation = location;
              if (last != null && !controller.isClosed) {
                try {
                  controller.add(
                    last!.copyWith(
                      driver: last!.driver?.copyWith(
                              latitude: location.latitude,
                              longitude: location.longitude,
                            ),
                    ),
                  );
                } catch (_) {
                  // Listener may have cancelled in the meantime.
                }
              }
            }
          } catch (_) {
            // Driver may not have reported a position yet.
          }
        }

        timer = Timer.periodic(const Duration(seconds: 2), (_) => poll());
        poll();
      },
      onCancel: () {
        timer?.cancel();
        timer = null;
        controller.close();
      },
    );
    return controller.stream;
  }

  /// Fetches the vehicle catalogue from the backend when one is configured.
  Future<List<Vehicle>> fetchVehicles() async {
    if (!AppConstants.backendConnected) return getAvailableVehicles();
    final data = await apiClient.get('vehicles');
    return (data['vehicles'] as List<dynamic>? ?? [])
        .map(Vehicle.fromBackendJson)
        .toList();
  }

  Vehicle _matchVehicle(String? id, List<Vehicle> catalog) {
    if (id == null) {
      return catalog.isNotEmpty ? catalog.first : getAvailableVehicles().first;
    }
    return catalog.firstWhere(
      (v) => v.id == id,
      orElse: () => getAvailableVehicles().first,
    );
  }
}

/// App-wide ride service instance.
final RideService rideService = RideService();