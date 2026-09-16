import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../models/driver.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_auth_service.dart';

/// Driver profile screen.
class DriverProfileScreen extends StatelessWidget {
  const DriverProfileScreen({super.key, this.driver});

  final Driver? driver;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final d = driver ?? driverAuthService.currentDriver.value;

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Text(l10n.profile, style: const TextStyle(
              color: AppColors.black, fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            // Profile header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white, borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: AppColors.primaryGreen.withValues(alpha: 0.12),
                    child: Text(
                      (d?.fullName ?? 'D').split(' ').map((w) => w[0]).take(2).join().toUpperCase(),
                      style: const TextStyle(color: AppColors.primaryGreen, fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d?.fullName ?? 'Driver', style: const TextStyle(
                          color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text(d?.phone ?? '', style: const TextStyle(
                          color: AppColors.secondaryText, fontSize: 13.5)),
                        if (d?.email != null && d!.email!.isNotEmpty)
                          Text(d!.email!, style: const TextStyle(
                            color: AppColors.secondaryText, fontSize: 13.5)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            // Menu items
            _MenuTile(icon: Icons.person_outline, label: l10n.editDriverProfile,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.profile)),
            _MenuTile(icon: Icons.directions_car_outlined, label: l10n.vehicleInfo,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.vehicle)),
            _MenuTile(icon: Icons.description_outlined, label: l10n.documents,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.documents)),
            _MenuTile(icon: Icons.star_outline, label: l10n.driverRatings,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.ratings)),
            _MenuTile(icon: Icons.notifications_outlined, label: l10n.notifications,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.notifications)),
            const SizedBox(height: 16),
            _MenuTile(icon: Icons.support_agent, label: l10n.support,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.support)),
            _MenuTile(icon: Icons.shield_outlined, label: l10n.driverSafety,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.safety)),
            _MenuTile(icon: Icons.settings_outlined, label: l10n.driverSettings,
              onTap: () => Navigator.of(context).pushNamed(DriverRoutes.settings)),
            const SizedBox(height: 16),
            _MenuTile(
              icon: Icons.logout, label: l10n.logout, onTap: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    backgroundColor: AppColors.white,
                    title: Text(l10n.logoutQuestion, style: TextStyle(fontWeight: FontWeight.w800)),
                    actions: [
                      TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.stay)),
                      FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.logout)),
                    ],
                  ),
                );
                if (ok == true) await driverAuthService.logout();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border)),
            child: Row(
              children: [
                Icon(icon, color: AppColors.secondaryText, size: 20),
                const SizedBox(width: 12),
                Expanded(child: Text(label, style: const TextStyle(
                  color: AppColors.black, fontSize: 14.5, fontWeight: FontWeight.w600))),
                const Icon(Icons.chevron_right, color: AppColors.secondaryText, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
