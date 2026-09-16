import 'dart:async';

import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';
import '../../services/api_client.dart';
import '../models/driver_ride.dart';
import 'driver_api_client.dart';

/// Ride management for the driver side.
class DriverRideService {
  /// The driver's current active ride (if any).
  Future<DriverRide?> getActiveRide() async {
    if (!AppConstants.backendConnected) return null;
    try {
      final data = await driverApiClient.get('drivers/ride');
      final ride = data['ride'];
      if (ride == null) return null;
      return DriverRide.fromBackendJson(ride);
    } catch (_) {
      return null;
    }
  }

  /// Accepts a ride request.
  Future<void> acceptRide(String rideId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Ride acceptance');
    }
    await driverApiClient.post('drivers/rides/$rideId/accept');
  }

  /// Declines a ride (simulated for now; the driver simply does nothing).
  Future<void> declineRide(String rideId) async {
    // The backend releases drivers who don't accept within the timeout.
    // No explicit decline endpoint is needed — the scheduler handles it.
  }

  /// Marks the driver as arrived at the pickup point.
  Future<String> markArrived(String rideId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Arrival');
    }
    final data = await driverApiClient.post('drivers/rides/$rideId/arrived');
    return data['pin'] as String? ?? '';
  }

  /// Verifies the ride PIN to start the trip.
  Future<void> verifyPin(String rideId, String pin) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('PIN verification');
    }
    await driverApiClient.post(
      'drivers/rides/$rideId/verify-pin',
      body: {'pin': pin},
    );
  }

  /// Completes the trip (driver marks arrival at destination).
  Future<Map<String, dynamic>> completeTrip(String rideId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Trip completion');
    }
    return await driverApiClient.post('drivers/rides/$rideId/complete-trip');
  }

  /// Cancels the ride (before trip starts).
  Future<void> cancelRide(String rideId, {String? reason}) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Ride cancellation');
    }
    await driverApiClient.post(
      'drivers/rides/$rideId/cancel',
      body: {'reason': reason},
    );
  }

  /// Updates driver's GPS location on the backend.
  Future<void> updateLocation({
    required double latitude,
    required double longitude,
    double? heading,
  }) async {
    if (!AppConstants.backendConnected) return;
    try {
      await driverApiClient.post(
        'drivers/location',
        body: {
          'latitude': latitude,
          'longitude': longitude,
          if (heading != null) 'heading': heading,
        },
      );
    } catch (_) {
      // Location update failure should not crash the app.
    }
  }

  /// Ride history for the driver.
  Future<List<DriverRide>> getRideHistory() async {
    if (!AppConstants.backendConnected) return [];
    final data = await driverApiClient.get('driver/rides');
    return (data['rides'] as List<dynamic>? ?? [])
        .map(DriverRide.fromBackendJson)
        .toList();
  }

  /// Details of a specific ride.
  Future<DriverRide> getRideDetails(String rideId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Ride details');
    }
    final data = await driverApiClient.get('driver/rides/$rideId');
    return DriverRide.fromBackendJson(data['ride']);
  }

  /// Subscribe to ride updates via polling.
  Stream<DriverRide> subscribeToRide(String rideId) {
    if (!AppConstants.backendConnected) {
      return const Stream.empty();
    }

    Timer? timer;
    DriverRide? last;
    final controller = StreamController<DriverRide>();

    Future<void> poll() async {
      try {
        final data = await driverApiClient.get('drivers/ride');
        final ride = data['ride'];
        if (ride != null) {
          final current = DriverRide.fromBackendJson(ride);
          if (last == null || current.status != last!.status) {
            last = current;
            if (!controller.isClosed) controller.add(current);
          }
          if (['completed', 'cancelled'].contains(current.status)) {
            timer?.cancel();
            if (!controller.isClosed) controller.close();
          }
        }
      } catch (_) {}
    }

    controller.onListen = () {
      timer = Timer.periodic(const Duration(seconds: 3), (_) => poll());
      poll();
    };
    controller.onCancel = () {
      timer?.cancel();
      controller.close();
    };

    return controller.stream;
  }
}

final DriverRideService driverRideService = DriverRideService();
