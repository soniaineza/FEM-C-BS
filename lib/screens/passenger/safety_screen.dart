import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/constants/app_constants.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../services/support_service.dart';

/// Passenger safety tools (step 21).
///
/// Emergency-related actions are service placeholders: real emergency
/// services must be connected through [supportService] / the backend before
/// they are enabled. The app never dials unverified numbers.
class SafetyScreen extends StatelessWidget {
  const SafetyScreen({super.key, required this.ride});

  final Ride ride;

  Future<void> _onEmergency(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final phone = supportService.supportPhone;
    if (phone.trim().isEmpty) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: AppColors.white,
          title: Text(l10n.emergencyAssistance,
              style: TextStyle(fontWeight: FontWeight.w800)),
          content: Text(
            l10n.emergencyBody,
            style: TextStyle(color: AppColors.secondaryText, height: 1.5),
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.ok),
            ),
          ],
        ),
      );
    }
    // TODO(backend): connect the emergency-assistance API here.
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.safety)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.black,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield, color: AppColors.white, size: 28),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l10n.safetyPriority,
                      style: TextStyle(
                        color: AppColors.white,
                        fontSize: 14,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _SafetyOption(
              icon: Icons.emergency_outlined,
              iconColor: AppColors.error,
              title: 'Emergency assistance',
              subtitle: 'Request help through the app',
              onTap: () => _onEmergency(context),
            ),
            _SafetyOption(
              icon: Icons.share_outlined,
              title: 'Share trip',
              subtitle: 'Send your trip details to a contact',
              onTap: () => _snack(
                context,
                'Trip sharing activates when the backend is connected.',
              ),
            ),
            _SafetyOption(
              icon: Icons.person_pin_circle_outlined,
              title: 'Contact trusted person',
              subtitle: 'Call your emergency contact',
              onTap: () => _snack(
                context,
                'Your emergency contact actions activate when the backend is '
                'connected.',
              ),
            ),
            _SafetyOption(
              icon: Icons.report_problem_outlined,
              title: 'Report an issue',
              subtitle: 'Tell us about a problem in this trip',
              onTap: () => Navigator.of(context)
                  .pushNamed(AppRoutes.helpSupport),
            ),
            _SafetyOption(
              icon: Icons.headset_mic_outlined,
              title: 'Contact support',
              subtitle: 'Talk to FEM C@BS support',
              onTap: () => Navigator.of(context)
                  .pushNamed(AppRoutes.helpSupport),
            ),
            const SizedBox(height: 12),
            Text(
              'Emergency calls: ${AppConstants.safetyContactPhone.isEmpty ? 'to be configured' : AppConstants.safetyContactPhone}',
              style: const TextStyle(
                color: AppColors.secondaryText,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SafetyOption extends StatelessWidget {
  const _SafetyOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.iconColor = AppColors.primaryGreen,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(icon, color: iconColor, size: 24),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: AppColors.black,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.secondaryText,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}