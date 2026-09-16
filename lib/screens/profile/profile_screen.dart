import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/passenger.dart';
import '../../services/auth_service.dart';
import '../../widgets/section_title.dart';

/// Passenger profile with account menu (step 25).
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.passenger, this.onOpenHistory});

  final Passenger? passenger;
  final VoidCallback? onOpenHistory;

  Future<void> _confirmLogout(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(l10n.logoutQuestion,
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          l10n.identifierRequired,
          style: TextStyle(color: AppColors.secondaryText),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.stay),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.logout),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await authService.logout();
    // currentUser becomes null and the root router returns to the auth flow.
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final p = passenger;
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Text(
              l10n.profile,
              style: TextStyle(
                color: AppColors.black,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            _ProfileHeader(passenger: p),
            if (p?.isDevPreview ?? false) ...[
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.lightGray,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline,
                        size: 18, color: AppColors.secondaryText),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        l10n.previewSession,
                        style: TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 12.5,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            SectionTitle(l10n.account),
            const SizedBox(height: 8),
            _MenuTile(
              icon: Icons.person_outline,
              label: l10n.editProfile,
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.editProfile),
            ),
            _MenuTile(
              icon: Icons.place_outlined,
              label: l10n.savedPlaces,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.savedPlaces),
            ),
            _MenuTile(
              icon: Icons.payments_outlined,
              label: l10n.paymentMethods,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.paymentMethods),
            ),
            _MenuTile(
              icon: Icons.history,
              label: l10n.rideHistory,
              onTap: () => onOpenHistory?.call(),
            ),
            _MenuTile(
              icon: Icons.notifications_outlined,
              label: l10n.notifications,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.notifications),
            ),
            const SizedBox(height: 20),
            SectionTitle(l10n.support),
            const SizedBox(height: 8),
            _MenuTile(
              icon: Icons.support_agent,
              label: l10n.helpSupport,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.helpSupport),
            ),
            _MenuTile(
              icon: Icons.description_outlined,
              label: l10n.termsOfService,
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.terms),
            ),
            _MenuTile(
              icon: Icons.privacy_tip_outlined,
              label: l10n.privacyPolicy,
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.privacy),
            ),
            _MenuTile(
              icon: Icons.settings_outlined,
              label: l10n.settings,
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.settings),
            ),
            const SizedBox(height: 20),
            SectionTitle(l10n.accountActions),
            const SizedBox(height: 8),
            _MenuTile(
              icon: Icons.delete_outline,
              label: l10n.deleteAccount,
              destructive: true,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.deleteAccount),
            ),
            _MenuTile(
              icon: Icons.logout,
              label: l10n.logout,
              onTap: () => _confirmLogout(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.passenger});

  final Passenger? passenger;

  @override
  Widget build(BuildContext context) {
    final name = passenger?.fullName ?? '';
    final initials = name.isEmpty
        ? '?'
        : name.split(RegExp(r'\s+')).map((w) => w[0]).take(2).join();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.primaryGreen.withValues(alpha: 0.12),
            child: Text(
              initials.toUpperCase(),
              style: const TextStyle(
                color: AppColors.primaryGreen,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  passenger?.fullName ?? 'Passenger',
                  style: const TextStyle(
                    color: AppColors.black,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  passenger?.phone ?? '',
                  style: const TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13.5,
                  ),
                ),
                if ((passenger?.email ?? '').isNotEmpty)
                  Text(
                    passenger!.email,
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 13.5,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.error : AppColors.black;
    final iconColor = destructive ? AppColors.error : AppColors.secondaryText;
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
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(icon, color: iconColor, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: color,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.secondaryText,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}