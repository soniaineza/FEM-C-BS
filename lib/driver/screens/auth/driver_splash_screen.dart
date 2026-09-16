import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_auth_service.dart';

/// Driver splash screen — checks for an existing session.
class DriverSplashScreen extends StatefulWidget {
  const DriverSplashScreen({super.key});

  @override
  State<DriverSplashScreen> createState() => _DriverSplashScreenState();
}

class _DriverSplashScreenState extends State<DriverSplashScreen> {
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await driverAuthService.initialize();
    if (!mounted) return;

    final driver = driverAuthService.currentDriver.value;
    if (driver != null) {
      _goHome();
    } else {
      _goLogin();
    }
  }

  void _goHome() {
    Navigator.of(context).pushReplacementNamed(DriverRoutes.home);
  }

  void _goLogin() {
    Navigator.of(context).pushReplacementNamed(DriverRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.primaryGreen,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.directions_car_filled,
                color: AppColors.white,
                size: 44,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'FEM C@BS',
              style: TextStyle(
                color: AppColors.black,
                fontSize: 28,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Driver',
              style: TextStyle(
                color: AppColors.secondaryText,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 30),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: AppColors.primaryGreen,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
