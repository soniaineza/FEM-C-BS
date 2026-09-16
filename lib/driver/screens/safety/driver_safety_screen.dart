import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../services/driver_api_client.dart';
import '../../services/driver_auth_service.dart';
import '../../services/driver_ride_service.dart';

/// Driver safety screen with SOS functionality.
class DriverSafetyScreen extends StatelessWidget {
  const DriverSafetyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.driverSafety)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Safety banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.black,
                borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  const Icon(Icons.shield, color: AppColors.white, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l10n.safetyPriority,
                      style: const TextStyle(color: AppColors.white, fontSize: 14, height: 1.5)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            // SOS button
            _SafetyOption(
              icon: Icons.emergency_outlined,
              iconColor: AppColors.error,
              title: l10n.emergencyAssistance,
              subtitle: 'Trigger SOS and alert the control room',
              onTap: () => _triggerSOS(context),
            ),
            _SafetyOption(
              icon: Icons.share_outlined,
              title: 'Share trip',
              subtitle: 'Send your trip details to a trusted contact',
              onTap: () => _snack(context, 'Trip sharing activates when a ride is active.'),
            ),
            _SafetyOption(
              icon: Icons.support_agent,
              title: l10n.support,
              subtitle: 'Contact FEM C@BS support',
              onTap: () => Navigator.of(context).pop(),
            ),
            _SafetyOption(
              icon: Icons.report_problem_outlined,
              title: 'Report issue',
              subtitle: 'Report a safety concern',
              onTap: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 12),
            const Text(
              'Emergency calls: In a real emergency, always call local emergency services directly.',
              style: TextStyle(color: AppColors.secondaryText, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _triggerSOS(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: const Text('Emergency SOS', style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text('This will record your emergency and notify the control room. Continue?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Send SOS')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      } catch (_) {}

      await driverApiClient.post('driver/emergency', body: {
        'latitude': pos?.latitude,
        'longitude': pos?.longitude,
        'details': 'SOS triggered by driver',
      });

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Emergency recorded. Help is on the way.')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')));
      }
    }
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
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
              border: Border.all(color: AppColors.border)),
            child: Row(
              children: [
                Icon(icon, color: iconColor, size: 24),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(
                        color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(subtitle, style: const TextStyle(
                        color: AppColors.secondaryText, fontSize: 12.5)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.secondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
