import 'dart:math';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/payment.dart';
import '../models/place.dart';
import '../models/ride.dart';
import '../models/vehicle.dart';

/// Ride booking, estimation and history.
///
/// Planned integration:
///  * `requestRide`     -> Supabase Edge Function (creates a `rides` row).
///  * live status        -> Supabase Realtime subscription on the ride.
///  * fares & vehicles   -> served by the backend.
///
/// The development build returns clearly marked mock vehicles and real
/// straight-line estimates (computed from the passenger's actual coordinates)
/// so the booking screens are previewable. It never fabricates a driver or a
/// completed ride.
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
  FareEstimate? estimateFare({
    required Vehicle vehicle,
    required Place pickup,
    required Place destination,
  }) {
    if (!pickup.hasCoordinates || !destination.hasCoordinates) return null;

    const earthRadiusKm = 6371.0;
    final lat1 = pickup.latitude! * pi / 180;
    final lat2 = destination.latitude! * pi / 180;
    final dLat = (destination.latitude! - pickup.latitude!) * pi / 180;
    final dLng = (destination.longitude! - pickup.longitude!) * pi / 180;

    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    final distanceKm = earthRadiusKm * c;

    final durationMinutes = (distanceKm /
                AppConstants.estimateAverageSpeedKmh *
                60)
            .round()
        .clamp(2, 600);

    final estimatedFare = vehicle.baseFare + (distanceKm * vehicle.farePerKm);

    return FareEstimate(
      vehicle: vehicle,
      distanceKm: distanceKm,
      durationMinutes: durationMinutes,
      estimatedFare: estimatedFare,
      isEstimate: true,
    );
  }

  /// Requests a ride and waits for the backend to match a driver.
  Future<Ride> requestRide({
    required Place pickup,
    required Place destination,
    required Vehicle vehicle,
    required PaymentMethod paymentMethod,
    required FareEstimate estimate,
  }) async {
    // TODO(backend): create the `rides` + `ride_locations` rows here.
    throw BackendNotConnectedException('Ride booking');
  }

  /// Cancels a requested or active ride.
  Future<void> cancelRide(String rideId) async {
    if (AppConstants.backendConnected) {
      // TODO(backend): call the cancel endpoint / update the ride status.
      throw BackendNotConnectedException('Cancelling your ride');
    }
    // Development build: there is no backend ride to cancel.
  }

  /// Past rides for the passenger. Empty until the backend serves history.
  Future<List<Ride>> getRideHistory() async {
    if (AppConstants.backendConnected) {
      // TODO(backend): query rides where passenger_id = current user.
      throw BackendNotConnectedException('Ride history');
    }
    return [];
  }

  Future<Ride> getRideDetails(String rideId) async {
    if (AppConstants.backendConnected) {
      // TODO(backend): fetch a single ride with locations + driver + rating.
      throw BackendNotConnectedException('Ride details');
    }
    throw BackendNotConnectedException('Ride details');
  }

  Future<void> rateRide({
    required String rideId,
    required int rating,
    String? comment,
  }) async {
    if (AppConstants.backendConnected) {
      // TODO(backend): insert into `ratings`.
      throw BackendNotConnectedException('Rating');
    }
    throw BackendNotConnectedException('Rating');
  }

  /// Real-time ride updates.
  ///
  /// The backend will expose this as a Supabase Realtime channel. Until then
  /// an empty stream is returned so listening screens stay in their loading
  /// state instead of inventing events.
  Stream<Ride> subscribeToRide(String rideId) {
    // TODO(backend): `supabase.from('rides').stream(...)` for this ride.
    return const Stream.empty();
  }
}

/// App-wide ride service instance.
final RideService rideService = RideService();