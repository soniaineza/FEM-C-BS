import 'package:flutter/material.dart';

import '../../core/localization/app_localizations.dart';
import '../../models/passenger.dart';
import '../../screens/activity/ride_history_screen.dart';
import '../../screens/passenger/home_screen.dart';
import '../../screens/profile/profile_screen.dart';
import '../../services/auth_service.dart';

/// Main authenticated shell with bottom navigation: Home, Activity, Profile.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pages = [
      const HomeScreen(),
      const RideHistoryScreen(),
      ValueListenableBuilder<Passenger?>(
        valueListenable: authService.currentUser,
        builder: (context, passenger, _) => ProfileScreen(
          passenger: passenger,
          onOpenHistory: () => setState(() => _index = 1),
        ),
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
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: l10n.activity,
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