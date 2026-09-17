import 'package:flutter/material.dart';

import '../../models/payment.dart';
import '../../models/passenger.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/ride_type.dart';
import '../../models/vehicle.dart';
import '../diagnostics/app_logger.dart';
import '../../screens/activity/ride_details_screen.dart';
import '../../screens/auth/forgot_password_screen.dart';
import '../../screens/auth/login_screen.dart';
import '../../screens/auth/profile_setup_screen.dart';
import '../../screens/auth/signup_screen.dart';
import '../../screens/auth/splash_screen.dart';
import '../../screens/auth/verification_screen.dart';
import '../../screens/auth/welcome_screen.dart';
import '../../screens/passenger/app_shell.dart';
import '../../screens/passenger/confirm_ride_screen.dart';
import '../../screens/passenger/destination_screen.dart';
import '../../screens/passenger/driver_accepted_screen.dart';
import '../../screens/passenger/fare_estimate_screen.dart';
import '../../screens/passenger/payment_method_screen.dart';
import '../../screens/passenger/pickup_screen.dart';
import '../../screens/passenger/ride_completed_screen.dart';
import '../../screens/passenger/ride_tracking_screen.dart';
import '../../screens/passenger/ride_type_screen.dart';
import '../../screens/passenger/safety_screen.dart';
import '../../screens/passenger/searching_driver_screen.dart';
import '../../screens/passenger/vehicle_selection_screen.dart';
import '../../screens/profile/delete_account_screen.dart';
import '../../screens/profile/edit_profile_screen.dart';
import '../../screens/profile/help_support_screen.dart';
import '../../screens/profile/legal_screen.dart';
import '../../screens/profile/notifications_screen.dart';
import '../../screens/profile/payment_methods_screen.dart';
import '../../screens/profile/saved_places_screen.dart';
import '../../screens/profile/settings_screen.dart';
import '../../services/auth_service.dart';
import 'app_routes.dart';

/// Ties the app's navigation together.
///
/// Two independent stacked navigators are shown depending on the auth state:
///  * not signed in  -> auth screens, starting at the splash
///  * signed in with an incomplete profile -> profile setup
///  * signed in with a complete profile -> the main passenger app
///
/// The builder watches [authService.currentUser], so logging in or out swaps
/// between the flows automatically.
class RootRouter extends StatelessWidget {
  const RootRouter({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Passenger?>(
      valueListenable: authService.currentUser,
      builder: (context, passenger, _) {
        if (passenger == null) {
          return Navigator(
            key: const PageStorageKey('auth_navigator'),
            initialRoute: AppRoutes.splash,
            onGenerateRoute: _authRoute,
          );
        }
        if (!passenger.isProfileComplete) {
          return Navigator(
            key: const PageStorageKey('onboarding_navigator'),
            initialRoute: AppRoutes.profileSetup,
            onGenerateRoute: (settings) => MaterialPageRoute(
              builder: (_) => ProfileSetupScreen(
                passenger: settings.arguments as Passenger?,
              ),
            ),
          );
        }
        AppLogger.event('AUTH_SUCCESS', 'passenger=${passenger.id}');
        AppLogger.event('HOME_LOADED');
        return Navigator(
          key: const PageStorageKey('main_navigator'),
          initialRoute: AppRoutes.home,
          onGenerateRoute: _mainRoute,
        );
      },
    );
  }

  Route<dynamic> _authRoute(RouteSettings settings) {
    final args = settings.arguments;
    return MaterialPageRoute<void>(
      settings: settings,
      builder: (_) => switch (settings.name) {
        AppRoutes.splash => const SplashScreen(),
        AppRoutes.welcome => const WelcomeScreen(),
        AppRoutes.login => const LoginScreen(),
        AppRoutes.signup => const SignupScreen(),
        AppRoutes.forgotPassword => const ForgotPasswordScreen(),
        AppRoutes.verification =>
          VerificationScreen(passenger: args as Passenger?),
        AppRoutes.profileSetup =>
          ProfileSetupScreen(passenger: args as Passenger?),
        _ => const SplashScreen(),
      },
    );
  }

  Route<dynamic> _mainRoute(RouteSettings settings) {
    final args = settings.arguments;
    return MaterialPageRoute<void>(
      settings: settings,
      builder: (_) => switch (settings.name) {
        AppRoutes.home => const AppShell(),
        AppRoutes.pickup => const PickupScreen(),
        AppRoutes.destination =>
          DestinationScreen(pickup: args as Place),
        AppRoutes.rideType => _unwrap(
            (args as (Place, Place)),
            (a) => RideTypeScreen(
                  pickup: a.$1,
                  destination: a.$2,
                )),
        AppRoutes.vehicleSelection =>
          _unwrap((args as (Place, Place, RideType)),
              (a) => VehicleSelectionScreen(
                    pickup: a.$1,
                    destination: a.$2,
                    rideType: a.$3,
                  )),
        AppRoutes.fareEstimate =>
          _unwrap((args as (Place, Place, Vehicle, RideType)),
              (a) => FareEstimateScreen(
                    pickup: a.$1,
                    destination: a.$2,
                    vehicle: a.$3,
                    rideType: a.$4,
                  )),
        AppRoutes.paymentMethod => _unwrap(
            (args as (Place, Place, Vehicle, FareEstimate?, RideType)),
            (a) => PaymentMethodScreen(
                  pickup: a.$1,
                  destination: a.$2,
                  vehicle: a.$3,
                  estimate: a.$4,
                  rideType: a.$5,
                )),
        AppRoutes.confirmRide => _unwrap(
            (args as (Place, Place, Vehicle, FareEstimate?, PaymentMethod,
                RideType)),
            (a) => ConfirmRideScreen(
                  pickup: a.$1,
                  destination: a.$2,
                  vehicle: a.$3,
                  estimate: a.$4,
                  paymentMethod: a.$5,
                  rideType: a.$6,
                )),
        AppRoutes.searchingDriver => _unwrap(
            (args as SearchingDriverArgs),
            (a) => SearchingDriverScreen(
                  pickup: a.pickup,
                  destination: a.destination,
                  vehicle: a.vehicle,
                  paymentMethod: a.paymentMethod,
                  estimate: a.estimate,
                  requestError: a.requestError,
                  rideType: a.rideType,
                  rideNote: a.rideNote,
                  createdRide: a.createdRide,
                )),
        AppRoutes.driverAccepted =>
          DriverAcceptedScreen(ride: args as Ride),
        AppRoutes.rideTracking =>
          RideTrackingScreen(ride: args as Ride),
        AppRoutes.safety => SafetyScreen(ride: args as Ride),
        AppRoutes.rideCompleted =>
          RideCompletedScreen(ride: args as Ride),
        AppRoutes.rideDetails => RideDetailsScreen(ride: args as Ride),
        AppRoutes.editProfile => const EditProfileScreen(),
        AppRoutes.savedPlaces => const SavedPlacesScreen(),
        AppRoutes.paymentMethods => const PaymentMethodsScreen(),
        AppRoutes.notifications => const NotificationsScreen(),
        AppRoutes.settings => const SettingsScreen(),
        AppRoutes.helpSupport => const HelpSupportScreen(),
        AppRoutes.terms => const TermsScreen(),
        AppRoutes.privacy => const PrivacyScreen(),
        AppRoutes.deleteAccount => const DeleteAccountScreen(),
        _ => const AppShell(),
      },
    );
  }

  /// Small helper to keep the switch arms tidy when unwrapping records.
  R _unwrap<A, R>(A args, R Function(A) build) => build(args);
}