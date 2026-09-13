import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../core/utils/validators.dart';
import '../../models/passenger.dart';
import '../../services/auth_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final passenger = await authService.logIn(
        identifier: _identifier.text.trim(),
        password: _password.text,
      );

      if (!mounted) return;

      if (passenger.isProfileComplete) {
        await authService.beginSession(passenger);
      } else {
        // Finish onboarding first; the profile screen commits the session.
        Navigator.of(context).pushNamed(
          AppRoutes.profileSetup,
          arguments: passenger,
        );
      }
      _showSignedInMessage(passenger);
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() {
        _error = AppLocalizations.of(context).signInFailed;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSignedInMessage(Passenger passenger) {
    if (!mounted || !passenger.isDevPreview) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).previewSignedIn)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Form(
            key: _formKey,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.welcomeBack,
                  style: TextStyle(
                    color: AppColors.black,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.loginSubtitle,
                  style: TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 28),
                CustomTextField(
                  controller: _identifier,
                  label: l10n.phoneOrEmail,
                  hintText: 'e.g. +250 7XX XXX XXX',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  validator: (value) {
                    final error = Validators.identifier(value);
                    if (error == 'Enter your phone number or email') {
                      return l10n.identifierRequired;
                    }
                    return error == 'Enter a valid phone number or email'
                        ? l10n.invalidIdentifier
                        : error;
                  },
                  prefixIcon: Icons.person_outline,
                ),
                const SizedBox(height: 16),
                CustomTextField(
                  controller: _password,
                  label: l10n.password,
                  obscure: true,
                  textInputAction: TextInputAction.done,
                  validator: (v) => Validators.required(v, message: l10n.enterPassword),
                  onFieldSubmitted: (_) => _submit(),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () =>
                        Navigator.of(context).pushNamed(AppRoutes.forgotPassword),
                    child: Text(l10n.forgotPassword),
                  ),
                ),
                if (_error != null) ...[
                  ErrorMessage(message: _error!),
                  const SizedBox(height: 16),
                ],
                if (authService.isDevPreview) ...[
                  const _DevPreviewNote(),
                  const SizedBox(height: 16),
                ],
                PrimaryButton(
                  label: l10n.login,
                  loading: _loading,
                  onPressed: _loading ? null : _submit,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      l10n.noAccount,
                      style: TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: () =>
                          Navigator.of(context).pushReplacementNamed(AppRoutes.signup),
                      child: Text(
                        l10n.signUp,
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.secondaryText),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              AppLocalizations.of(context).previewMode,
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