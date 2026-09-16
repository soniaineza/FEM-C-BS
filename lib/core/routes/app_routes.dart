/// Central registry of named routes.
///
/// Navigation stays imperative (`Navigator.pushNamed`) so every screen is
/// independent and simple to follow.
class AppRoutes {
  AppRoutes._();

  static const String splash = '/';
  static const String welcome = '/welcome';
  static const String login = '/login';
  static const String signup = '/signup';
  static const String forgotPassword = '/forgot-password';
  static const String verification = '/verification';
  static const String profileSetup = '/profile-setup';

  static const String home = '/home';

  static const String pickup = '/pickup';
  static const String destination = '/destination';
  static const String rideType = '/ride-type';
  static const String vehicleSelection = '/vehicle-selection';
  static const String fareEstimate = '/fare-estimate';
  static const String paymentMethod = '/payment-method';
  static const String confirmRide = '/confirm-ride';
  static const String searchingDriver = '/searching-driver';
  static const String driverAccepted = '/driver-accepted';
  static const String rideTracking = '/ride-tracking';
  static const String safety = '/safety';
  static const String rideCompleted = '/ride-completed';
  static const String rating = '/rating';

  static const String rideHistory = '/ride-history';
  static const String rideDetails = '/ride-details';

  static const String profile = '/profile';
  static const String editProfile = '/edit-profile';
  static const String savedPlaces = '/saved-places';
  static const String paymentMethods = '/payment-methods';
  static const String notifications = '/notifications';
  static const String settings = '/settings';
  static const String helpSupport = '/help-support';
  static const String terms = '/terms';
  static const String privacy = '/privacy';
  static const String deleteAccount = '/delete-account';
}