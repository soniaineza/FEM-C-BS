import 'dart:developer' as developer;

/// Lightweight, release-safe diagnostic breadcrumbs for the passenger flow.
///
/// This is NOT a general logging framework — it exists so a stuck/frozen
/// screen reported by a real tester can be diagnosed after the fact via
/// `adb logcat` (every line is tagged `flutter.FEM` and prefixed `[FEM]`,
/// so `adb logcat -s flutter.FEM:D` or a plain `adb logcat | grep FEM` picks
/// them all up) even though release builds have no debugger attached.
///
/// Rules for every call site: never pass a password, OTP code, auth token,
/// or full request/response body — only stage names, status codes, error
/// *types* (not necessarily full messages if they might embed user input),
/// and coarse identifiers (a ride id is fine; a phone number is not).
class AppLogger {
  AppLogger._();

  /// High-level lifecycle checkpoints the bug report specifically asked to
  /// be able to trace: APP_START, AUTH_SUCCESS, HOME_LOADED,
  /// LOCATION_PERMISSION_REQUESTED / _RESULT, LOCATION_SERVICE_STATUS,
  /// LOCATION_ACQUIRED, MAP_INITIALIZED, API_REQUEST_START / _SUCCESS /
  /// _FAILURE, NAVIGATION_EVENT, LOADING_STATE_START / _END, EXCEPTION.
  static void event(String stage, [String detail = '']) {
    developer.log(
      detail.isEmpty ? stage : '$stage: $detail',
      name: 'flutter.FEM',
    );
  }

  /// A caught exception worth surfacing in logcat. [context] says which
  /// operation failed (e.g. "getCurrentPosition", "POST /rides"); never pass
  /// the raw exception object if it could embed request data — pass
  /// `error.runtimeType` or a short safe description instead when in doubt.
  static void exception(String context, Object error) {
    developer.log(
      'EXCEPTION in $context: ${error.runtimeType}',
      name: 'flutter.FEM',
      level: 1000,
    );
  }
}
