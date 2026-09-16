import 'package:flutter/material.dart';

import '../../core/localization/app_localizations.dart';
import '../models/driver.dart';
import '../screens/home/driver_home_screen.dart';
import '../screens/earnings/driver_earnings_screen.dart';
import '../screens/rides/driver_ride_history_screen.dart';
import '../screens/profile/driver_profile_screen.dart';
import '../services/driver_auth_service.dart';

/// Main driver app shell with bottom navigation: Home, Rides, Earnings, Profile.
class DriverAppShell extends StatefulWidget {
  const DriverAppShell({super.key});

  @override
  State<DriverAppShell> createState() => _DriverAppShellState();
}

class _DriverAppShellState extends State<DriverAppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pages = [
      const DriverHomeScreen(),
      const DriverRideHistoryScreen(),
      const DriverEarningsScreen(),
      ValueListenableBuilder<Driver?>(
        valueListenable: driverAuthService.currentDriver,
        builder: (context, driver, _) => DriverProfileScreen(driver: driver),
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: l10n.home,
          ),
          NavigationDestination(
            icon: Icon(Icons.directions_car_outlined),
            selectedIcon: Icon(Icons.directions_car),
            label: l10n.rideHistory,
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: l10n.earnings,
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: l10n.profile,
          ),
        ],
      ),
    );
  }
}
