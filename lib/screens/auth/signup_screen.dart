import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../core/utils/validators.dart';
import '../../services/auth_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();

  bool _loading = false;
  bool _acceptedTerms = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    if (!_acceptedTerms) {
      setState(() => _error = AppLocalizations.of(context).agreeTerms);
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final passenger = await authService.signUp(
        fullName: _name.text.trim(),
        phone: _phone.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed(
        AppRoutes.verification,
        arguments: passenger,
      );
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() {
        _error = AppLocalizations.of(context).accountCreatedFailed;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(),
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
                Text(
                  l10n.createAccount,
                  style: TextStyle(
                    color: AppColors.black,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.lessThanMinute,
                  style: TextStyle(color: AppColors.secondaryText, fontSize: 15),
                ),
                const SizedBox(height: 28),
                CustomTextField(
                  controller: _name,
                  label: l10n.fullName,
                  hintText: 'e.g. Aline Uwase',
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.fullName(value, l10n),
                  prefixIcon: Icons.person_outline,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _phone,
                  label: l10n.phoneNumber,
                  hintText: 'e.g. +250 7XX XXX XXX',
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.phone(value, l10n),
                  prefixIcon: Icons.phone_outlined,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _email,
                  label: l10n.email,
                  hintText: 'you@example.com',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.email(value, l10n: l10n),
                  prefixIcon: Icons.mail_outline,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _password,
                  label: l10n.password,
                  obscure: true,
                  textInputAction: TextInputAction.next,
                  validator: (value) => Validators.password(value, l10n),
                  prefixIcon: Icons.lock_outline,
                  hintText: l10n.passwordHint,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _confirmPassword,
                  label: l10n.confirmPassword,
                  obscure: true,
                  textInputAction: TextInputAction.done,
                  validator: (v) => Validators.confirmPassword(v, original: _password.text, l10n: l10n),
                  onFieldSubmitted: (_) => _submit(),
                  prefixIcon: Icons.lock_outline,
                ),
                const SizedBox(height: 16),
                InkWell(
                  onTap: () =>
                      setState(() => _acceptedTerms = !_acceptedTerms),
                  borderRadius: BorderRadius.circular(8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        _acceptedTerms
                            ? Icons.check_box
                            : Icons.check_box_outline_blank,
                        color: _acceptedTerms
                            ? AppColors.primaryGreen
                            : AppColors.secondaryText,
                        size: 22,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          l10n.agreeTerms,
                          style: TextStyle(
                            color: AppColors.black,
                            fontSize: 14,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  ErrorMessage(message: _error!),
                ],
                if (authService.isDevPreview) ...[
                  const SizedBox(height: 16),
                  const _DevPreviewNote(),
                ],
                const SizedBox(height: 24),
                PrimaryButton(
                  label: l10n.createAccount,
                  loading: _loading,
                  onPressed: _loading ? null : _submit,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      l10n.existingAccount,
                      style: TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: () =>
                          Navigator.of(context).pushReplacementNamed(AppRoutes.login),
                      child: const Text(
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
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DevPreviewNote extends StatelessWidget {
  const _DevPreviewNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.lightGray,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.secondaryText),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Preview mode: your account is created on this device only. '
              'Accounts will be stored securely when the backend is connected.',
              style: TextStyle(
                color: AppColors.secondaryText,
                fontSize: 12.5,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}