import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../services/driver_api_client.dart';
import '../../../core/localization/app_localizations.dart';
import '../../services/driver_auth_service.dart';
import '../../routes/driver_routes.dart';

/// Driver settings screen.
class DriverSettingsScreen extends StatelessWidget {
  const DriverSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.driverSettings)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _SettingsTile(
            icon: Icons.language_outlined,
            label: l10n.language,
            onTap: () => _showLanguageDialog(context),
          ),
          _SettingsTile(
            icon: Icons.description_outlined,
            label: l10n.termsOfService,
            onTap: () {},
          ),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            label: l10n.privacyPolicy,
            onTap: () {},
          ),
          const SizedBox(height: 16),
          _SettingsTile(
            icon: Icons.delete_outline,
            label: l10n.deleteAccount,
            destructive: true,
            onTap: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  backgroundColor: AppColors.white,
                  title: const Text('Delete account?',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                  content: const Text('This action cannot be undone.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.of(context).pop(false),
                      child: Text(l10n.cancel)),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.error),
                      onPressed: () => Navigator.of(context).pop(true),
                      child: Text(l10n.deleteMyAccount)),
                  ],
                ),
              );
              if (ok == true) {
                try {
                  await driverApiClient.delete('driver/account');
                  await driverAuthService.logout();
                } catch (_) {}
              }
            },
          ),
        ],
      ),
    );
  }

  void _showLanguageDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(AppLocalizations.of(context).chooseLanguage),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: const Text('Kinyarwanda'), onTap: () => Navigator.of(context).pop()),
            ListTile(title: const Text('Francais'), onTap: () => Navigator.of(context).pop()),
            ListTile(title: const Text('English'), onTap: () => Navigator.of(context).pop()),
          ],
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({required this.icon, required this.label, required this.onTap, this.destructive = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.error : AppColors.secondaryText;
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
                Icon(icon, color: color, size: 20),
                const SizedBox(width: 12),
                Expanded(child: Text(label, style: TextStyle(
                  color: destructive ? AppColors.error : AppColors.black,
                  fontSize: 14.5, fontWeight: FontWeight.w600))),
                const Icon(Icons.chevron_right, color: AppColors.secondaryText, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
