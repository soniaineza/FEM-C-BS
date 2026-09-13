/// Application-wide configuration values.
///
/// Company-specific text (support contacts, links, appearance) lives here so
/// it can be replaced with real FEM C@BS information before release.
class AppConstants {
  AppConstants._();

  static const String appName = 'FEM C@BS';
  static const String tagline = 'Your ride. Your way.';

  /// When false, every network-backed service reports that the backend is not
  /// connected yet and falls back to a clearly marked local development
  /// session. Set to true after the Supabase backend is in place.
  static const bool backendConnected = false;

  /// Straight-line estimate of average city speed (km/h) used only to compute
  /// *approximate* travel duration while no routing service is available.
  static const double estimateAverageSpeedKmh = 25;

  /// Currency symbol/name shown with all fares.
  static const String currencySymbol = 'RWF';
  static const String currencyCode = 'RWF';

  /// Initial map view used only when the device cannot provide a real
  /// location. This is a neutral default view (Kigali, Rwanda) and is never
  /// presented as the passenger's actual position.
  static const double fallbackLatitude = -1.9441;
  static const double fallbackLongitude = 30.0619;
  static const double defaultMapZoom = 15;

  /// Support / legal placeholders.
  /// TODO(backend): Replace with real FEM C@BS contact details before release.
  static const String supportEmail = 'support@femcabs.rw';
  static const String supportPhone = '';
  static const String safetyContactPhone = '';
  static const String privacyPolicyUrl = 'https://femcabs.rw/privacy';
  static const String termsOfServiceUrl = 'https://femcabs.rw/terms';

  /// SharedPreferences keys (local development storage only).
  static const String prefDevSessionKey = 'dev_session_passenger';
  static const String prefSavedPlacesKey = 'saved_places';
  static const String prefRecentPlacesKey = 'recent_places';
  static const String prefLocaleKey = 'app_locale';

  /// Bounds enforced on the OTP input.
  static const int otpLength = 6;

  /// Number of recent destinations kept locally.
  static const int maxRecentPlaces = 5;
}