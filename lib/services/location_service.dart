import 'package:geolocator/geolocator.dart';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/place.dart';

/// Location access, current position and (future) place search.
///
/// Permission is never requested by this service on its own — the UI decides
/// when the passenger needs location and explains why first. Location requests
/// on this service go through the real device GPS (geolocator).
class LocationService {
  Future<bool> isServiceEnabled() => Geolocator.isLocationServiceEnabled();

  Future<LocationPermission> checkPermission() =>
      Geolocator.checkPermission();

  Future<LocationPermission> requestPermission() =>
      Geolocator.requestPermission();

  Future<bool> openSettings() => Geolocator.openAppSettings();

  /// Reads the passenger's real current position.
  ///
  /// Throws an [AppException] with a safe message when permission or the
  /// location service is missing.
  Future<Place> getCurrentPlace() async {
    final permitted = await checkPermission();
    if (permitted == LocationPermission.denied) {
      throw const AppException(
        'Location permission is needed to find your pickup point.',
      );
    }
    if (permitted == LocationPermission.deniedForever) {
      throw const AppException(
        'Location permission was permanently denied. '
        'Enable it in your device settings to use automatic pickup.',
      );
    }
    if (!await isServiceEnabled()) {
      throw const AppException(
        'Location services are turned off. '
        'Enable them to find your pickup point, or enter it manually.',
      );
    }

    Position position;
    try {
      position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } on LocationServiceDisabledException {
      throw const AppException('Location services are turned off on this device.');
    } on PermissionDeniedException {
      throw const AppException('Location permission was not granted.');
    }

    return Place(
      address: 'Current location',
      latitude: position.latitude,
      longitude: position.longitude,
      isCurrentLocation: true,
    );
  }

  /// Place search (geocoding / autocomplete).
  ///
  /// The results are returned by the map provider configured in the backend.
  /// While no provider is connected this returns an empty result so the UI can
  /// show an honest "search coming soon" state.
  Future<List<Place>> searchLocations(String query) async {
    // TODO(backend): connect Google Places / Mapbox / a Supabase geocoder.
    return const [];
  }

  bool get hasSearchProvider => false;

  /// Human-readable coordinates used as a fallback address.
  String describePosition(double latitude, double longitude) {
    final ns = latitude >= 0 ? 'N' : 'S';
    final ew = longitude >= 0 ? 'E' : 'W';
    final lat = latitude.abs().toStringAsFixed(5);
    final lng = longitude.abs().toStringAsFixed(5);
    return '$lat° $ns, $lng° $ew';
  }
}

/// Default map centre used only when no real location is available yet.
/// This is a neutral starting view (Kigali) — never presented as the
/// passenger's position.
class MapDefaults {
  MapDefaults._();

  static double get latitude => AppConstants.fallbackLatitude;
  static double get longitude => AppConstants.fallbackLongitude;
  static double get zoom => AppConstants.defaultMapZoom;
}

/// App-wide location service instance.
final LocationService locationService = LocationService();