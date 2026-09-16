import 'dart:convert';

import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/place.dart';
import 'api_client.dart';

/// Location access, current position, place search and road routing.
///
/// Permission is never requested by this service on its own — the UI decides
/// when the passenger needs location and explains why first. Location requests
/// on this service go through the real device GPS (geolocator).
///
/// While the FEM C@BS backend is connected, search, reverse geocoding and
/// routing go through the API. In the local development build the service
/// calls the free OpenStreetMap ecosystem directly (Photon geocoder + OSRM
/// router) so any typed place is still found and real road routes can be
/// drawn, with no API key required.
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
      address: await _currentAddressFor(position),
      latitude: position.latitude,
      longitude: position.longitude,
      isCurrentLocation: true,
    );
  }

  Future<String> _currentAddressFor(Position position) async {
    if (!AppConstants.backendConnected) return 'Current location';
    try {
      final data = await apiClient.get(
        'locations/reverse?lat=${position.latitude}&lng=${position.longitude}',
      );
      final address = data['address'] as String?;
      if (address != null && address.trim().isNotEmpty) {
        return address;
      }
    } catch (_) {
      // Fall back to a neutral label; GPS accuracy is unaffected.
    }
    return 'Current location';
  }

  static const String _photonGeocoderBase = 'https://photon.komoot.io/api/';
  static const String _photonReverseBase = 'https://photon.komoot.io/reverse';
  static const String _osmRouterBase = 'https://router.project-osrm.org';

  /// Place search (geocoding / autocomplete).
  ///
  /// When a backend is connected the FEM C@BS API proxies Nominatim. In the
  /// local development build the search runs directly against Photon (the
  /// OpenStreetMap geocoder), so any typed place is still found for free.
  Future<List<Place>> searchLocations(String query) async {
    final text = query.trim();
    if (text.length < 2) return const [];
    if (AppConstants.backendConnected) {
      final data = await apiClient.get(
        'locations/search?q=${Uri.encodeQueryComponent(text)}',
      );
      return (data['results'] as List<dynamic>? ?? []).map((r) {
        final map = r as Map<String, dynamic>;
        return Place(
          address: map['address'] as String? ?? text,
          latitude: (map['latitude'] as num?)?.toDouble(),
          longitude: (map['longitude'] as num?)?.toDouble(),
        );
      }).toList();
    }
    return _searchPhoton(text);
  }

  Future<List<Place>> _searchPhoton(String query) async {
    try {
      final uri = Uri.parse(_photonGeocoderBase).replace(queryParameters: {
        'q': query,
        'limit': '6',
        'lang': 'en',
      });
      final response =
          await http.get(uri).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) return const [];
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final features = body['features'] as List<dynamic>? ?? const [];
      return features.map((f) {
        final map = f as Map<String, dynamic>;
        final properties =
            map['properties'] as Map<String, dynamic>? ?? const {};
        final geometry = map['geometry'] as Map<String, dynamic>? ?? const {};
        final coords = geometry['coordinates'] as List<dynamic>? ?? const [];
        return Place(
          address: _photonLabel(properties),
          latitude: coords.length > 1 ? (coords[1] as num).toDouble() : null,
          longitude: coords.isNotEmpty ? (coords[0] as num).toDouble() : null,
        );
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  /// Resolves coordinates to a human-readable address.
  Future<Place> reverseGeocode({
    required double latitude,
    required double longitude,
  }) async {
    if (AppConstants.backendConnected) {
      final data = await apiClient.get(
        'locations/reverse?lat=$latitude&lng=$longitude',
      );
      return Place(
        address: data['address'] as String? ?? 'Current location',
        latitude: latitude,
        longitude: longitude,
      );
    }
    return Place(
      address: await _reversePhoton(latitude, longitude),
      latitude: latitude,
      longitude: longitude,
    );
  }

  Future<String> _reversePhoton(double latitude, double longitude) async {
    try {
      final uri = Uri.parse(_photonReverseBase).replace(queryParameters: {
        'lon': '$longitude',
        'lat': '$latitude',
        'limit': '1',
        'lang': 'en',
      });
      final response =
          await http.get(uri).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) {
        return describePosition(latitude, longitude);
      }
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final features = body['features'] as List<dynamic>? ?? const [];
      if (features.isEmpty) return describePosition(latitude, longitude);
      final properties =
          (features.first as Map<String, dynamic>)['properties']
                  as Map<String, dynamic>? ??
              const {};
      final label = _photonLabel(properties);
      return label.isEmpty ? describePosition(latitude, longitude) : label;
    } catch (_) {
      return describePosition(latitude, longitude);
    }
  }

  /// Builds a compact human-readable address label from Photon properties.
  String _photonLabel(Map<String, dynamic> properties) {
    final name = properties['name']?.toString().trim();
    final street = properties['street']?.toString().trim();
    final postcode = properties['postcode']?.toString().trim();
    final city = properties['city']?.toString().trim();
    final state = properties['state']?.toString().trim();
    final country = properties['country']?.toString().trim();

    final parts = <String>[
      if (name != null && name.isNotEmpty && name != street) name,
      if (street != null && street.isNotEmpty && street != name) street,
    ];
    final place = [
      if (postcode != null && postcode.isNotEmpty) postcode,
      if (city != null && city.isNotEmpty) city,
    ].join(' ');
    if (place.trim().isNotEmpty) parts.add(place.trim());
    if (state != null && state.isNotEmpty && state != city) parts.add(state);
    if (country != null && country.isNotEmpty) parts.add(country);
    return parts.join(', ');
  }

  /// Computes a real road route between two places.
  ///
  /// Uses the public OSRM (OpenStreetMap routing) server directly in the
  /// development build, or the backend endpoint when one is connected.
  /// Returns null when a route cannot be computed (missing coordinates,
  /// unreachable points or a network failure) so callers simply keep
  /// showing the pickup/destination markers.
  Future<RouteResult?> getRoute({
    required Place from,
    required Place to,
  }) async {
    if (!from.hasCoordinates || !to.hasCoordinates) return null;
    final uri = Uri.parse(
      '$_osmRouterBase/route/v1/driving/'
      '${from.longitude},${from.latitude};${to.longitude},${to.latitude}',
    ).replace(queryParameters: {
      'overview': 'full',
      'geometries': 'geojson',
    });
    try {
      final response =
          await http.get(uri).timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) return null;
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final routes = body['routes'] as List<dynamic>? ?? const [];
      if (routes.isEmpty) return null;
      final route = routes.first as Map<String, dynamic>;
      final geometry = route['geometry'] as Map<String, dynamic>? ?? const {};
      final coords = geometry['coordinates'] as List<dynamic>? ?? const [];
      final points = coords
          .whereType<List<dynamic>>()
          .map((pair) => LatLng(
                (pair[1] as num).toDouble(),
                (pair[0] as num).toDouble(),
              ))
          .toList();
      if (points.length < 2) return null;
      return RouteResult(
        points: points,
        distanceMeters: (route['distance'] as num?)?.toDouble() ?? 0,
        durationSeconds: (route['duration'] as num?)?.toDouble() ?? 0,
      );
    } catch (_) {
      return null;
    }
  }

  bool get hasSearchProvider => true;

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

/// A computed road route between a pickup and a destination.
class RouteResult {
  const RouteResult({
    required this.points,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  /// Polyline points in travel order (the path shown on the map).
  final List<LatLng> points;

  /// Route length in metres.
  final double distanceMeters;

  /// Estimated driving time in seconds.
  final double durationSeconds;
}