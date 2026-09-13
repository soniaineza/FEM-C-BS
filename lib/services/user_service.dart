import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants/app_constants.dart';
import '../models/passenger.dart';
import '../models/place.dart';
import '../models/saved_place.dart';
import 'auth_service.dart';

/// Profile and local user-data management.
///
/// Saved and recent places are stored on-device (SharedPreferences); this is
/// real local storage, not a simulation. Everything that requires a server
/// (profile row in a `users` / `passenger_profiles` table) belongs behind
/// `authService.updateProfile`.
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
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(AppConstants.prefSavedPlacesKey) ?? [];
    return raw
        .map(SavedPlace.fromJsonString)
        .whereType<SavedPlace>()
        .toList();
  }

  Future<void> savePlace(SavedPlace place) async {
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