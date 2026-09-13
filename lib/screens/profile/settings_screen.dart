import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../main.dart';

/// App settings (step 35). Preferences will be stored with the backend
/// profile when it is connected; each toggle is honest about that.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.settings)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _SettingsTile(
              icon: Icons.notifications_outlined,
              label: l10n.notifications,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.notifications),
            ),
            _SettingsTile(
              icon: Icons.location_on_outlined,
              label: l10n.locationPermission,
              onTap: () => _showLocationDialog(context),
            ),
            _SettingsTile(
              icon: Icons.language_outlined,
              label: l10n.language,
              trailing: Text(
                l10n.languageName,
                style: TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 13.5,
                ),
              ),
              onTap: () => _showLanguageDialog(context),
            ),
            _SettingsTile(
              icon: Icons.palette_outlined,
              label: l10n.appearance,
              trailing: Text(
                l10n.light,
                style: TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 13.5,
                ),
              ),
              onTap: () => _showAppearanceDialog(context),
            ),
            _SettingsTile(
              icon: Icons.security_outlined,
              label: l10n.security,
              onTap: () => _showSecurityDialog(context),
            ),
            _SettingsTile(
              icon: Icons.privacy_tip_outlined,
              label: l10n.privacyPolicy,
              onTap: () =>
                  Navigator.of(context).pushNamed(AppRoutes.privacy),
            ),
            _SettingsTile(
              icon: Icons.description_outlined,
              label: l10n.termsOfService,
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.terms),
            ),
            const SizedBox(height: 12),
            Text(
              l10n.locationNotice,
              style: TextStyle(
                color: AppColors.secondaryText.withValues(alpha: 0.9),
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showLocationDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(AppLocalizations.of(context).locationDialogTitle,
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          AppLocalizations.of(context).locationDialogBody,
          style: TextStyle(color: AppColors.secondaryText),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(AppLocalizations.of(context).ok),
          ),
        ],
      ),
    );
  }

  void _showLanguageDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => SimpleDialog(
        backgroundColor: AppColors.white,
        title: Text(AppLocalizations.of(context).chooseLanguage,
            style: TextStyle(fontWeight: FontWeight.w800)),
        children: const [Locale('rw'), Locale('fr'), Locale('en')]
            .map(
              (locale) => SimpleDialogOption(
                onPressed: () {
                  Navigator.of(context).pop();
                  appLocaleController.setLocale(locale);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(AppLocalizations.of(context).languageChanged)),
                  );
                },
                child: Text(
                  AppLocalizations.of(context).languageLabel(locale),
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  void _showAppearanceDialog(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    showDialog<void>(
      context: context,
      builder: (context) => SimpleDialog(
        backgroundColor: AppColors.white,
        title: Text(l10n.appearance,
            style: TextStyle(fontWeight: FontWeight.w800)),
        children: [l10n.light, l10n.dark, l10n.system]
            .map(
              (mode) => SimpleDialogOption(
                onPressed: () {
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        AppLocalizations.of(context).appearanceNotice,
                      ),
                    ),
                  );
                },
                child: Text(mode),
              ),
            )
            .toList(),
      ),
    );
  }

  void _showSecurityDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(AppLocalizations.of(context).securityTitle,
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          AppLocalizations.of(context).securityBody,
          style: TextStyle(color: AppColors.secondaryText),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(AppLocalizations.of(context).ok),
          ),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Widget? trailing;

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
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(icon, color: AppColors.secondaryText, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                ?trailing,
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