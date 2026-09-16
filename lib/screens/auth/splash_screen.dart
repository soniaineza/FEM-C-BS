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

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );
  late final Animation<double> _fade =
      CurvedAnimation(parent: _controller, curve: Curves.easeOut);
  late final Animation<double> _scale = Tween<double>(begin: 0.92, end: 1.0)
      .animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

  @override
  void initState() {
    super.initState();
    _controller.forward();
    _start();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
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
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.white, AppColors.lightBackground],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: FadeTransition(
              opacity: _fade,
              child: ScaleTransition(
                scale: _scale,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 132,
                      height: 132,
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppColors.primaryGreen,
                            AppColors.greenGradientEnd,
                          ],
                        ),
                        boxShadow: AppShadows.tinted(
                          AppColors.primaryGreen,
                          opacity: 0.35,
                        ),
                      ),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/car_image.png',
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const BrandMark(withIcon: false),
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
          ),
        ),
      ),
    );
  }
}