import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/app_constants.dart';
import '../models/driver.dart';
import 'driver_api_client.dart';

/// Authentication for the FEM C@BS driver app.
class DriverAuthService {
  final ValueNotifier<Driver?> currentDriver = ValueNotifier<Driver?>(null);

  bool get isBackendConnected => AppConstants.backendConnected;

  Future<void> initialize() async {
    if (!isBackendConnected) {
      // Dev preview mode: restore from local storage
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_devSessionKey);
      if (raw != null) {
        final map = Map<String, dynamic>.from(
          Map<String, dynamic>.from(
            (raw.isNotEmpty ? {} : {}) as Map,
          ),
        );
        try {
          final decoded = Map<String, dynamic>.from(
            __importJsonDecode(raw) as Map,
          );
          currentDriver.value = Driver(
            id: decoded['id'] as String?,
            fullName: decoded['fullName'] as String? ?? '',
            phone: decoded['phone'] as String? ?? '',
            email: decoded['email'] as String?,
            status: decoded['status'] as String? ?? 'offline',
            isProfileComplete: decoded['isProfileComplete'] as bool? ?? false,
            isDevPreview: true,
          );
        } catch (_) {}
      }
      return;
    }

    // Backend mode: restore session
    final token = await driverApiClient.readToken();
    if (token != null && token.isNotEmpty) {
      try {
        final data = await driverApiClient.get('driver/me');
        final driver = Driver.fromBackendJson(data['driver']);
        currentDriver.value = driver;
      } catch (_) {
        await _clearSession();
      }
    }
  }

  /// Logs in with phone + password against the backend.
  Future<Driver> logIn({required String phone, required String password}) async {
    if (isBackendConnected) {
      final data = await driverApiClient.post(
        'drivers/login',
        body: {'phone': phone.trim(), 'password': password},
      );
      final driver = Driver.fromBackendJson(data['driver']);
      await driverApiClient.saveSession(
        token: data['token'] as String,
        driverId: driver.id!,
      );
      currentDriver.value = driver;
      return driver;
    }

    // Dev preview mode
    final driver = Driver(
      id: 'dev_driver_${DateTime.now().millisecondsSinceEpoch}',
      fullName: 'Dev Driver',
      phone: phone.trim(),
      status: 'active',
      isProfileComplete: true,
      isDevPreview: true,
    );
    currentDriver.value = driver;
    await _persistDevSession(driver);
    return driver;
  }

  /// Registers a new driver account.
  Future<Driver> register({
    required String fullName,
    required String phone,
    required String email,
    required String password,
  }) async {
    if (isBackendConnected) {
      final data = await driverApiClient.post(
        'drivers/login',
        body: {'phone': phone.trim(), 'password': password},
      );
      final driver = Driver.fromBackendJson(data['driver']);
      await driverApiClient.saveSession(
        token: data['token'] as String,
        driverId: driver.id!,
      );
      currentDriver.value = driver;
      return driver;
    }

    final driver = Driver(
      id: 'dev_driver_${DateTime.now().millisecondsSinceEpoch}',
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      status: 'active',
      isProfileComplete: true,
      isDevPreview: true,
    );
    currentDriver.value = driver;
    await _persistDevSession(driver);
    return driver;
  }

  Future<Driver> updateProfile(Driver updated) async {
    if (isBackendConnected) {
      final data = await driverApiClient.put(
        'driver/me',
        body: {
          'fullName': updated.fullName,
          'email': updated.email,
          'photoUrl': updated.photoUrl,
          'emergencyContactName': updated.emergencyContactName,
          'emergencyContactPhone': updated.emergencyContactPhone,
          'preferredLanguage': updated.preferredLanguage,
          'vehicleMake': updated.vehicleMake,
          'vehicleModel': updated.vehicleModel,
          'vehicleYear': updated.vehicleYear,
          'vehicleColor': updated.vehicleColor,
          'vehiclePlate': updated.vehiclePlate,
        },
      );
      final driver = Driver.fromBackendJson(data['driver']);
      currentDriver.value = driver;
      return driver;
    }

    final base = currentDriver.value ?? updated;
    final driver = base.copyWith(
      fullName: updated.fullName,
      email: updated.email,
      photoUrl: updated.photoUrl,
      emergencyContactName: updated.emergencyContactName,
      emergencyContactPhone: updated.emergencyContactPhone,
      isProfileComplete: true,
    );
    currentDriver.value = driver;
    await _persistDevSession(driver);
    return driver;
  }

  Future<void> updateDriverStatus(String status) async {
    if (isBackendConnected) {
      final data = await driverApiClient.put(
        'driver/status',
        body: {'status': status},
      );
      final driver = Driver.fromBackendJson(data['driver']);
      currentDriver.value = driver;
      return;
    }
    final current = currentDriver.value;
    if (current != null) {
      final updated = current.copyWith(status: status);
      currentDriver.value = updated;
      await _persistDevSession(updated);
    }
  }

  Future<void> logout() async {
    if (isBackendConnected) {
      await driverApiClient.clearSession();
      currentDriver.value = null;
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_devSessionKey);
    currentDriver.value = null;
  }

  Future<void> _clearSession() async {
    await driverApiClient.clearSession();
    currentDriver.value = null;
  }

  Future<void> _persistDevSession(Driver driver) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_devSessionKey, driver.fullName);
  }

  static const _devSessionKey = 'dev_driver_session';
}

final DriverAuthService driverAuthService = DriverAuthService();

// Minimal JSON decode helper to avoid import issues.
dynamic __importJsonDecode(String s) {
  // Use the dart:convert library directly
  return Map<String, dynamic>.from(
    Map.from(
      (() {
        try {
          return Map<String, dynamic>.from(
            const JsonDecoder().convert(s) as Map,
          );
        } catch (_) {
          return {};
        }
      })(),
    ),
  );
}
