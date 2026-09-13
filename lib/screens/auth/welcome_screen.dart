import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/primary_button.dart';

/// Landing screen shown to passengers who are not signed in.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 2),
              const Center(child: BrandMark(fontSize: 30)),
              const SizedBox(height: 32),
              Text(
                l10n.tagline,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.safeReliableRides,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 15,
                  height: 1.5,
                ),
              ),
              const Spacer(flex: 3),
              PrimaryButton(
                label: l10n.getStarted,
                onPressed: () =>
                    Navigator.of(context).pushNamed(AppRoutes.signup),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    l10n.existingAccount,
                    style: TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 14,
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pushNamed(AppRoutes.login),
                    child: Text(
                      l10n.login,
                      style: TextStyle(
                        color: AppColors.primaryGreen,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 72),
            ],
          ),
        ),
      ),
    );
  }
}