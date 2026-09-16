import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants/app_constants.dart';
import '../models/passenger.dart';
import '../models/place.dart';
import '../models/saved_place.dart';
import 'api_client.dart';
import 'auth_service.dart';

/// Profile and local user-data management.
///
/// Saved places are stored on the backend when one is configured, otherwise
/// on-device (SharedPreferences) — real local storage, not a simulation.
/// Recent places always stay local to the device.
class UserService {
  UserService(this._auth);

  final AuthService _auth;

  Future<Passenger?> getCurrentPassenger() async => _auth.currentUser.value;

  Future<Passenger> updateProfile(Passenger updated) =>
      _auth.updateProfile(updated);

  Future<void> saveEmergencyContact({
    required String name,
    required String phone,
  }) async {
    final current = _auth.currentUser.value;
    if (current == null) return;
    await _auth.updateProfile(
      current.copyWith(
        emergencyContactName: name.trim(),
        emergencyContactPhone: phone.trim(),
      ),
    );
  }

  Future<List<SavedPlace>> getSavedPlaces() async {
    if (AppConstants.backendConnected) {
      final data = await apiClient.get('places/saved');
      return (data['savedPlaces'] as List<dynamic>? ?? [])
          .map((json) => SavedPlace.fromJson(json as Map<String, dynamic>))
          .toList();
    }
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(AppConstants.prefSavedPlacesKey) ?? [];
    return raw
        .map(SavedPlace.fromJsonString)
        .whereType<SavedPlace>()
        .toList();
  }

  Future<void> savePlace(SavedPlace place) async {
    if (AppConstants.backendConnected) {
      await apiClient.post(
        'places/saved',
        body: {
          'type': place.type.name,
          'name': place.name,
          'address': place.place.address,
          'latitude': place.place.latitude,
          'longitude': place.place.longitude,
        },
      );
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final all = await getSavedPlaces();
    all.removeWhere((p) => p.id == place.id);
    all.insert(0, place);
    await prefs.setStringList(
      AppConstants.prefSavedPlacesKey,
      all.map((p) => p.toJsonString()).toList(),
    );
  }

  Future<void> deletePlace(String id) async {
    if (AppConstants.backendConnected) {
      await apiClient.delete('places/saved/$id');
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final all = await getSavedPlaces();
    all.removeWhere((p) => p.id == id);
    await prefs.setStringList(
      AppConstants.prefSavedPlacesKey,
      all.map((p) => p.toJsonString()).toList(),
    );
  }

  Future<List<Place>> getRecentPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(AppConstants.prefRecentPlacesKey) ?? [];
    return raw.map(Place.fromJsonString).whereType<Place>().toList();
  }

  Future<void> addRecentPlace(Place place) async {
    final prefs = await SharedPreferences.getInstance();
    final all = await getRecentPlaces();
    all.removeWhere((p) => p.address == place.address);
    all.insert(0, place);
    final trimmed = all.take(AppConstants.maxRecentPlaces).toList();
    await prefs.setStringList(
      AppConstants.prefRecentPlacesKey,
      trimmed.map((p) => jsonEncode(p.toJson())).toList(),
    );
  }
}

/// App-wide user service instance.
final UserService userService = UserService(authService);