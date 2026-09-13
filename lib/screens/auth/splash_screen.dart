import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/routes/app_routes.dart';
import '../../services/auth_service.dart';
import '../../widgets/brand_mark.dart';

/// Minimal branded splash. Decides where the passenger goes after a short
/// pause, once the auth service is ready.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;

    await authService.initialize();
    if (!mounted) return;

    // A signed-in passenger is switched to the main area by the root router.
    if (authService.currentUser.value == null) {
      Navigator.of(context).pushReplacementNamed(AppRoutes.welcome);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const BrandMark(),
              const SizedBox(height: 16),
              Text(
                AppConstants.tagline,
                style: const TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}