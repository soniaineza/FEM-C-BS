import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../core/localization/app_localizations.dart';
import '../models/passenger.dart';

/// Authentication for passengers.
///
/// Planned integration: **Supabase Auth** (email/password, phone OTP, password
/// reset, session refresh). While the backend is not connected
/// ([AppConstants.backendConnected] is false) this service runs a clearly
/// marked *local development session* stored in SharedPreferences so the
/// screens can be previewed. Passwords are never stored anywhere — not even in
/// development.
class AuthService {
  final ValueNotifier<Passenger?> currentUser = ValueNotifier<Passenger?>(null);

  bool get isBackendConnected => AppConstants.backendConnected;

  /// True while the app runs on the local development session fallback.
  bool get isDevPreview => !isBackendConnected;

  /// Restores a persisted development session, if any.
  Future<void> initialize() async {
    if (isBackendConnected) {
      // TODO(backend): Restore the Supabase session here.
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(AppConstants.prefDevSessionKey);
    if (raw == null) return;
    final passenger = Passenger.fromJsonString(raw, isDevPreview: true);
    currentUser.value = passenger;
  }

  /// Registers a new passenger account.
  ///
  /// Returns the created account. When the backend is not connected yet this
  /// creates a local development session marked with [Passenger.isDevPreview].
  Future<Passenger> signUp({
    required String fullName,
    required String phone,
    required String email,
    required String password,
  }) async {
    if (isBackendConnected) {
      // TODO(backend): `supabase.auth.signUp(email: email, password: password,
      // data: {'full_name': fullName, 'phone': phone})`.
      throw BackendNotConnectedException('Account creation');
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

  /// Signs an existing passenger in.
  ///
  /// The backend will verify the credentials. In development there is no
  /// password store by design, so a previously created development session is
  /// simply restored.
  Future<Passenger> logIn({
    required String identifier,
    required String password,
    AppLocalizations? l10n,
  }) async {
    if (isBackendConnected) {
      // TODO(backend): `supabase.auth.signIn` with email or phone identifier.
      throw BackendNotConnectedException('Login');
    }

    final existing = currentUser.value;
    if (existing == null) {
      throw const AppException(
        'No account found on this device yet. Please create an account to continue.',
      );
    }
    return existing;
  }

  /// Sends a password reset code for [identifier] (email or phone).
  ///
  /// In development no message is actually sent; the returned message is shown
  /// to the passenger and clearly states it.
  Future<String> resetPassword(String identifier, {AppLocalizations? l10n}) async {
    if (isBackendConnected) {
      // TODO(backend): `supabase.auth.resetPasswordForEmail(identifier)`.
      throw BackendNotConnectedException('Password reset');
    }
    final message = l10n?.resetMessage(identifier) ??
      'We sent a verification message to $identifier (development build — no message was actually sent).';
    return message;
  }

  /// Verifies the 6-digit code sent to the passenger's phone/email.
  Future<void> verifyOtp({required String code, AppLocalizations? l10n}) async {
    if (isBackendConnected) {
      // TODO(backend): `supabase.auth.verifyOTP(phone: phone, token: code)`.
      throw BackendNotConnectedException('Verification');
    }
    if (code.trim().length != AppConstants.otpLength) {
      throw AppException(l10n?.verificationCodeLength(AppConstants.otpLength) ??
          'Enter the ${AppConstants.otpLength}-digit verification code.');
    }
    // Development build: any N-digit code is accepted so the flow can be
    // previewed. No real OTP is ever checked or hardcoded.
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
    // TODO(backend): the Supabase session is already active at this point.
  }

  /// Completes or updates the passenger profile.
  Future<Passenger> updateProfile(Passenger updated) async {
    if (isBackendConnected) {
      // TODO(backend): `supabase.auth.updateUser` and `user_profiles` row.
      throw BackendNotConnectedException('Profile update');
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
      // TODO(backend): `supabase.auth.signOut()` and refresh token revoke.
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.prefDevSessionKey);
    currentUser.value = null;
  }

  /// Permanently deletes the passenger account and associated data.
  ///
  /// In development this removes the local session. In production the backend
  /// owns the deletion and must validate it — the client never deletes
  /// server-side data on its own.
  Future<void> deleteAccount() async {
    if (isBackendConnected) {
      // TODO(backend): call a Supabase Edge Function / admin RPC that deletes
      // the user, passenger_profiles and associated data via policies.
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.prefDevSessionKey);
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