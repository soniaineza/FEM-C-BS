import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../core/localization/app_localizations.dart';
import '../models/passenger.dart';
import 'api_client.dart';

/// Authentication for passengers.
///
/// When a backend URL is configured ([AppConstants.backendConnected]) every
/// auth action hits the FEM C@BS API (Express + PostgreSQL): accounts are
/// created and verified server-side and the returned JWT is stored on-device
/// and sent with authenticated requests.
///
/// Without a configured backend the app runs a clearly marked *local
/// development session* stored in SharedPreferences so the screens can be
/// previewed. Passwords are never stored anywhere — not even in development.
class AuthService {
  final ValueNotifier<Passenger?> currentUser = ValueNotifier<Passenger?>(null);

  /// Passenger id of the currently stored backend session (used by OTP calls).
  String? _passengerId;

  bool get isBackendConnected => AppConstants.backendConnected;

  /// True while the app runs on the local development session fallback.
  bool get isDevPreview => !isBackendConnected;

  /// Restores a persisted session (backend token or development session).
  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.prefAuthTokenKey);
    if (isBackendConnected && token != null && token.isNotEmpty) {
      _passengerId =
          prefs.getString(AppConstants.prefAuthPassengerIdKey);
      // Reach the backend to refresh the profile; if the token is invalid the
      // session is cleared so the user can sign in again.
      try {
        final data = await apiClient.get('auth/me');
        final passenger = Passenger.fromBackendJson(data['passenger']);
        currentUser.value = passenger;
        return;
      } catch (_) {
        await _clearBackendSession();
        return;
      }
    }

    final raw = prefs.getString(AppConstants.prefDevSessionKey);
    if (raw == null) return;
    final passenger = Passenger.fromJsonString(raw, isDevPreview: true);
    currentUser.value = passenger;
  }

  /// Registers a new passenger account on the backend (or creates a local
  /// development session when the backend is not connected).
  Future<Passenger> signUp({
    required String fullName,
    required String phone,
    required String email,
    required String password,
  }) async {
    if (isBackendConnected) {
      final data = await apiClient.post(
        'auth/signup',
        auth: false,
        body: {
          'fullName': fullName.trim(),
          'phone': phone.trim(),
          'email': email.trim(),
          'password': password,
        },
      );
      final token = data['token'] as String;
      final passenger = Passenger.fromBackendJson(data['passenger']);
      await apiClient.saveSession(token: token, passengerId: passenger.id!);
      _passengerId = passenger.id;
      await _persistBackendSession(passenger);
      return passenger;
    }

    final passenger = Passenger(
      id: 'dev_${DateTime.now().millisecondsSinceEpoch}',
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      isDevPreview: true,
    );
    await _persistDevelopmentSession(passenger);
    return passenger;
  }

  /// Signs an existing passenger in against the backend.
  Future<Passenger> logIn({
    required String identifier,
    required String password,
    AppLocalizations? l10n,
  }) async {
    if (isBackendConnected) {
      final data = await apiClient.post(
        'auth/login',
        auth: false,
        body: {
          'identifier': identifier.trim(),
          'password': password,
        },
      );
      final token = data['token'] as String;
      final passenger = Passenger.fromBackendJson(data['passenger']);
      await apiClient.saveSession(token: token, passengerId: passenger.id!);
      _passengerId = passenger.id;
      await _persistBackendSession(passenger);
      return passenger;
    }

    final existing = currentUser.value;
    if (existing != null) {
      return existing;
    }

    final passenger = Passenger(
      id: 'dev_${DateTime.now().millisecondsSinceEpoch}',
      fullName: identifier.trim().split('@').first,
      phone: identifier.trim(),
      email: identifier.trim(),
      isDevPreview: true,
    );
    await _persistDevelopmentSession(passenger);
    return passenger;
  }

  /// Sends a password reset code for [identifier] (email or phone).
  ///
  /// In development no message is actually sent; the returned message is shown
  /// to the passenger and clearly states it.
  Future<String> resetPassword(String identifier, {AppLocalizations? l10n}) async {
    if (isBackendConnected) {
      final data = await apiClient.post(
        'auth/reset-password/request',
        auth: false,
        body: {'identifier': identifier.trim()},
      );
      return data['message'] as String? ?? 'A verification code was sent.';
    }
    final message = l10n?.resetMessage(identifier) ??
      'We sent a verification message to $identifier (development build — no message was actually sent).';
    return message;
  }

  /// Completes a password reset with the code sent by [resetPassword] and the
  /// new password chosen by the passenger.
  Future<void> confirmResetPassword({
    required String identifier,
    required String code,
    required String newPassword,
    AppLocalizations? l10n,
  }) async {
    if (isBackendConnected) {
      await apiClient.post(
        'auth/reset-password/confirm',
        auth: false,
        body: {
          'identifier': identifier.trim(),
          'code': code.trim(),
          'newPassword': newPassword,
        },
      );
      return;
    }
    if (code.trim().length != AppConstants.otpLength) {
      throw AppException(l10n?.verificationCodeLength(AppConstants.otpLength) ??
          'Enter the ${AppConstants.otpLength}-digit verification code.');
    }
    // Development build: any 6-digit code is accepted so the flow can be
    // previewed. No real reset is performed on this device.
  }

  /// Verifies the 6-digit code sent to the passenger's phone/email.
  Future<void> verifyOtp({required String code, AppLocalizations? l10n}) async {
    if (isBackendConnected) {
      final passengerId = _passengerId ?? await apiClient.savedPassengerId;
      if (passengerId == null) {
        throw const AppException('Your session is missing. Please sign in again.');
      }
      await apiClient.post(
        'auth/verify-otp',
        auth: false,
        body: {'passengerId': passengerId, 'code': code.trim()},
      );
      return;
    }
    if (code.trim().length != AppConstants.otpLength) {
      throw AppException(l10n?.verificationCodeLength(AppConstants.otpLength) ??
          'Enter the ${AppConstants.otpLength}-digit verification code.');
    }
    // Development build: any N-digit code is accepted so the flow can be
    // previewed. No real OTP is ever checked or hardcoded.
  }

  /// Requests a fresh OTP code for [purpose] ('signup' or 'reset'), subject
  /// to the backend's resend cooldown. Requires the session token saved at
  /// sign-up (the passenger is not yet verified, but is already signed in).
  Future<void> resendOtp({String purpose = 'signup'}) async {
    if (!isBackendConnected) return;
    await apiClient.post('auth/resend-otp', body: {'purpose': purpose});
  }

  /// Starts a session for [passenger] and switches the app into the
  /// authenticated area.
  ///
  /// Used after login when the profile is already complete, and by the real
  /// backend path after a verified sign-in. Profile setup commits its own
  /// session through [updateProfile].
  Future<void> beginSession(Passenger passenger) async {
    if (isDevPreview) {
      await _persistDevelopmentSession(passenger);
      return;
    }
    // Backend sessions are already active — the token was stored at sign-in.
  }

  /// Completes or updates the passenger profile on the backend.
  Future<Passenger> updateProfile(Passenger updated) async {
    if (isBackendConnected) {
      final data = await apiClient.put(
        'auth/profile',
        body: {
          'fullName': updated.fullName,
          'phone': updated.phone,
          'email': updated.email,
          'photoUrl': updated.photoUrl,
          'emergencyContactName': updated.emergencyContactName,
          'emergencyContactPhone': updated.emergencyContactPhone,
        },
      );
      final passenger = Passenger.fromBackendJson(data['passenger']);
      await _persistBackendSession(passenger);
      return passenger;
    }

    final base = currentUser.value ?? updated;
    final passenger = base.copyWith(
      fullName: updated.fullName,
      phone: updated.phone,
      email: updated.email,
      photoUrl: updated.photoUrl,
      emergencyContactName: updated.emergencyContactName,
      emergencyContactPhone: updated.emergencyContactPhone,
      isProfileComplete: true,
      isDevPreview: true,
    );
    await _persistDevelopmentSession(passenger);
    return passenger;
  }

  /// Signs the passenger out (keeps their local data).
  Future<void> logout() async {
    if (isBackendConnected) {
      // The backend issues short-lived JWTs; the stored token is simply
      // discarded locally. A token-revocation endpoint can be added later.
      await _clearBackendSession();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.prefDevSessionKey);
    currentUser.value = null;
  }

  /// Permanently deletes the passenger account and associated data.
  Future<void> deleteAccount() async {
    if (isBackendConnected) {
      await apiClient.delete('auth/account');
      await _clearBackendSession();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.prefDevSessionKey);
    currentUser.value = null;
  }

  Future<void> _persistBackendSession(Passenger passenger) async {
    currentUser.value = passenger;
  }

  Future<void> _clearBackendSession() async {
    await apiClient.clearSession();
    _passengerId = null;
    currentUser.value = null;
  }

  Future<void> _persistDevelopmentSession(Passenger passenger) async {
    currentUser.value = passenger;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.prefDevSessionKey,
      jsonEncode(passenger.toJson()),
    );
  }
}

/// App-wide authentication service instance.
final AuthService authService = AuthService();