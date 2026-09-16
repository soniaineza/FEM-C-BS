import 'package:flutter/material.dart';

import '../models/driver.dart';
import './driver_routes.dart';
import '../screens/auth/driver_splash_screen.dart';
import '../screens/auth/driver_login_screen.dart';
import '../screens/earnings/driver_earnings_screen.dart';
import '../screens/rides/driver_active_ride_screen.dart';
import '../screens/rides/driver_ride_details_screen.dart';
import '../screens/rides/driver_ride_history_screen.dart';
import '../screens/profile/driver_profile_screen.dart';
import '../screens/profile/driver_vehicle_screen.dart';
import '../screens/profile/driver_documents_screen.dart';
import '../screens/profile/driver_settings_screen.dart';
import '../screens/notifications/driver_notifications_screen.dart';
import '../screens/support/driver_support_screen.dart';
import '../screens/safety/driver_safety_screen.dart';
import '../screens/earnings/driver_earnings_detail_screen.dart';
import '../screens/profile/driver_ratings_screen.dart';
import '../shell/driver_app_shell.dart';
import '../services/driver_auth_service.dart';

/// Ties the driver app's navigation together based on auth state.
class DriverRootRouter extends StatelessWidget {
  const DriverRootRouter({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Driver?>(
      valueListenable: driverAuthService.currentDriver,
      builder: (context, driver, _) {
        if (driver == null) {
          return Navigator(
            key: const PageStorageKey('driver_auth'),
            initialRoute: DriverRoutes.splash,
            onGenerateRoute: _authRoute,
          );
        }
        return Navigator(
          key: const PageStorageKey('driver_main'),
          initialRoute: DriverRoutes.home,
          onGenerateRoute: _mainRoute,
        );
      },
    );
  }

  Route<dynamic> _authRoute(RouteSettings settings) {
    return MaterialPageRoute<void>(
      settings: settings,
      builder: (_) => switch (settings.name) {
        DriverRoutes.splash => const DriverSplashScreen(),
        DriverRoutes.login => const DriverLoginScreen(),
        _ => const DriverSplashScreen(),
      },
    );
  }

  Route<dynamic> _mainRoute(RouteSettings settings) {
    return MaterialPageRoute<void>(
      settings: settings,
      builder: (_) => switch (settings.name) {
        DriverRoutes.home => const DriverAppShell(),
        DriverRoutes.activeRide =>
          DriverActiveRideScreen(rideId: settings.arguments as String?),
        DriverRoutes.earnings => const DriverEarningsScreen(),
        DriverRoutes.earnings => const DriverEarningsDetailScreen(),
        DriverRoutes.rideHistory => const DriverRideHistoryScreen(),
        DriverRoutes.rideDetails =>
          DriverRideDetailsScreen(rideId: settings.arguments as String?),
        DriverRoutes.profile =>
          DriverProfileScreen(driver: settings.arguments as Driver?),
        DriverRoutes.vehicle => const DriverVehicleScreen(),
        DriverRoutes.documents => const DriverDocumentsScreen(),
        DriverRoutes.notifications => const DriverNotificationsScreen(),
        DriverRoutes.support => const DriverSupportScreen(),
        DriverRoutes.safety => const DriverSafetyScreen(),
        DriverRoutes.settings => const DriverSettingsScreen(),
        DriverRoutes.ratings => const DriverRatingsScreen(),
        _ => const DriverAppShell(),
      },
    );
  }
}
