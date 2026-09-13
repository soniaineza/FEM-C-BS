import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/utils/validators.dart';
import '../../models/passenger.dart';
import '../../services/auth_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/primary_button.dart';

/// Completes the passenger profile after registration.
///
/// The emergency contact is optional. Saving commits the session: once the
/// profile is complete the root router shows the main app.
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key, this.passenger});

  final Passenger? passenger;

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: _base.fullName);
  late final _phone = TextEditingController(text: _base.phone);
  late final _email = TextEditingController(text: _base.email);
  late final _emergencyName = TextEditingController(
    text: _base.emergencyContactName ?? '',
  );
  late final _emergencyPhone = TextEditingController(
    text: _base.emergencyContactPhone ?? '',
  );

  bool _loading = false;

  Passenger get _base =>
      widget.passenger ?? authService.currentUser.value ??
      const Passenger(fullName: '', phone: '', email: '');

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _emergencyName.dispose();
    _emergencyPhone.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);

    final updated = _base.copyWith(
      fullName: _name.text.trim(),
      phone: _phone.text.trim(),
      email: _email.text.trim(),
      emergencyContactName:
          _emergencyName.text.trim().isEmpty ? null : _emergencyName.text.trim(),
      emergencyContactPhone:
          _emergencyPhone.text.trim().isEmpty ? null : _emergencyPhone.text.trim(),
      isProfileComplete: true,
    );

    await authService.updateProfile(updated);
    // The root router now shows the main app because the session is complete.
    if (mounted) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            updated.isDevPreview
                ? l10n.welcomeAboard
                : l10n.welcomeBack,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.completeProfile)),
      body: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Form(
            key: _formKey,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                Center(child: _ProfilePhoto(name: _name.text)),
                const SizedBox(height: 12),
                Center(
                  child: Text(
                    l10n.profilePhotoHint,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 12.5,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                CustomTextField(
                  controller: _name,
                  label: l10n.fullName,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.fullName(value, l10n),
                  prefixIcon: Icons.person_outline,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _phone,
                  label: l10n.phoneNumber,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.phone(value, l10n),
                  prefixIcon: Icons.phone_outlined,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _email,
                  label: l10n.email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.email(value, l10n: l10n),
                  prefixIcon: Icons.mail_outline,
                ),
                const SizedBox(height: 28),
                Text(
                  l10n.emergencyContactOptional,
                  style: TextStyle(
                    color: AppColors.black,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.emergencyContactHint,
                  style: TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _emergencyName,
                  label: l10n.emergencyContactName,
                  validator: (v) => _emergencyPhone.text.trim().isEmpty
                      ? null
                      : Validators.required(v, message: l10n.fullNameRequired, l10n: l10n),
                  textInputAction: TextInputAction.next,
                  prefixIcon: Icons.person_pin,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _emergencyPhone,
                  label: l10n.emergencyContactPhone,
                  keyboardType: TextInputType.phone,
                  validator: (v) => _emergencyName.text.trim().isEmpty
                      ? null
                      : Validators.phone(v, l10n),
                  prefixIcon: Icons.phone_in_talk_outlined,
                ),
                const SizedBox(height: 28),
                PrimaryButton(
                  label: l10n.continueLabel,
                  loading: _loading,
                  onPressed: _loading ? null : _continue,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfilePhoto extends StatelessWidget {
  const _ProfilePhoto({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? '?'
        : name.trim().split(RegExp(r'\s+')).map((w) => w[0]).take(2).join();

    return Container(
      width: 88,
      height: 88,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primaryGreen, width: 2),
      ),
      child: Text(
        initials.toUpperCase(),
        style: const TextStyle(
          color: AppColors.primaryGreen,
          fontSize: 30,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}