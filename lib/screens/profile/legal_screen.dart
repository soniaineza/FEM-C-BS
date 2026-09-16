import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';

/// Terms of Service (step 36).
///
/// Placeholder text to be finalised by the company before release and
/// replaced by hosted legal documents when the backend is connected.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.termsOfServiceTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _Section(title: l10n.termsSection1Title, body: l10n.termsSection1Body),
            _Section(title: l10n.termsSection2Title, body: l10n.termsSection2Body),
            _Section(title: l10n.termsSection3Title, body: l10n.termsSection3Body),
            _Section(title: l10n.termsSection4Title, body: l10n.termsSection4Body),
            _Section(title: l10n.termsSection5Title, body: l10n.termsSection5Body),
            _Section(title: l10n.termsSection6Title, body: l10n.termsSection6Body),
            _Section(title: l10n.termsSection7Title, body: l10n.termsSection7Body),
          ],
        ),
      ),
    );
  }
}

/// Privacy Policy (step 36).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.privacyPolicyTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _Section(title: l10n.privacySection1Title, body: l10n.privacySection1Body),
            _Section(title: l10n.privacySection2Title, body: l10n.privacySection2Body),
            _Section(title: l10n.privacySection3Title, body: l10n.privacySection3Body),
            _Section(title: l10n.privacySection4Title, body: l10n.privacySection4Body),
            _Section(title: l10n.privacySection5Title, body: l10n.privacySection5Body),
            _Section(title: l10n.privacySection6Title, body: l10n.privacySection6Body),
            _Section(title: l10n.privacySection7Title, body: l10n.privacySection7Body),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
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
          const SizedBox(height: 4),
          Text(
            body,
            style: const TextStyle(
              color: AppColors.secondaryText,
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
