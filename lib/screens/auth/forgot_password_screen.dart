import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../core/utils/validators.dart';
import '../../services/auth_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';

enum _ResetState { idle, sending, codeEntry, done }

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _completeFormKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _code = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmNewPassword = TextEditingController();

  _ResetState _state = _ResetState.idle;
  String? _error;
  String? _successMessage;
  String? _completeError;
  bool _submittingCode = false;

  @override
  void dispose() {
    _identifier.dispose();
    _code.dispose();
    _newPassword.dispose();
    _confirmNewPassword.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _state = _ResetState.sending;
      _error = null;
      _successMessage = null;
    });

    try {
      final message = await authService
          .resetPassword(
            _identifier.text.trim(),
            l10n: AppLocalizations.of(context),
          )
          // Wait a moment so loading is visible before revealing success.
          .then((m) async {
        await Future<void>.delayed(const Duration(milliseconds: 800));
        return m;
      });

      if (!mounted) return;
      setState(() {
        _state = _ResetState.codeEntry;
        _successMessage = message;
      });
    } on AppException catch (e) {
      setState(() {
        _state = _ResetState.idle;
        _error = e.message;
      });
    } catch (_) {
      setState(() {
        _state = _ResetState.idle;
        _error = AppLocalizations.of(context).signInFailed;
      });
    }
  }

  Future<void> _complete() async {
    FocusScope.of(context).unfocus();
    final l10n = AppLocalizations.of(context);
    if (!_completeFormKey.currentState!.validate()) return;

    setState(() {
      _submittingCode = true;
      _completeError = null;
    });

    try {
      await authService.confirmResetPassword(
        identifier: _identifier.text.trim(),
        code: _code.text.trim(),
        newPassword: _newPassword.text,
        l10n: l10n,
      );
      if (!mounted) return;
      setState(() {
        _submittingCode = false;
        _state = _ResetState.done;
      });
    } on AppException catch (e) {
      setState(() {
        _submittingCode = false;
        _completeError = e.message;
      });
    } catch (_) {
      setState(() {
        _submittingCode = false;
        _completeError = l10n.signInFailed;
      });
    }
  }

  String? _validateCode(String? value) {
    final text = value?.trim() ?? '';
    if (text.length != AppConstants.otpLength) {
      return AppLocalizations.of(context)
          .verificationCodeLength(AppConstants.otpLength);
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: switch (_state) {
            _ResetState.codeEntry => _buildCodeEntry(context),
            _ResetState.done => _buildDone(context),
            _ => _buildForm(context),
          },
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.forgotPassword,
            style: TextStyle(
              color: AppColors.black,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.forgotPasswordDescription,
            style: TextStyle(
              color: AppColors.secondaryText,
              fontSize: 14.5,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 24),
          CustomTextField(
            controller: _identifier,
            label: l10n.emailOrPhone,
            hintText: 'e.g. +250 7XX XXX XXX',
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            validator: (value) => Validators.identifier(value, l10n),
            onFieldSubmitted: (_) => _state == _ResetState.sending ? null : _send(),
            prefixIcon: Icons.alternate_email,
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            ErrorMessage(message: _error!),
          ],
          const SizedBox(height: 24),
          PrimaryButton(
            label: l10n.sendVerification,
            loading: _state == _ResetState.sending,
            onPressed: _state == _ResetState.sending ? null : _send,
          ),
        ],
      ),
    );
  }

  Widget _buildCodeEntry(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Form(
      key: _completeFormKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          const Icon(
            Icons.mark_email_read_outlined,
            size: 56,
            color: AppColors.primaryGreen,
          ),
          const SizedBox(height: 18),
          Text(
            l10n.codeArrivalHint,
            style: TextStyle(
              color: AppColors.black,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '$_successMessage\n${l10n.codeArrivalHint}',
            style: const TextStyle(
              color: AppColors.secondaryText,
              fontSize: 14.5,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 24),
          CustomTextField(
            controller: _code,
            label: l10n.resetCodeLabel,
            hintText: '••••••',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            validator: _validateCode,
            prefixIcon: Icons.pin_outlined,
          ),
          const SizedBox(height: 16),
          CustomTextField(
            controller: _newPassword,
            label: l10n.newPassword,
            obscure: true,
            textInputAction: TextInputAction.next,
            validator: (value) => Validators.password(value, l10n),
            prefixIcon: Icons.lock_outline,
            hintText: l10n.passwordHint,
          ),
          const SizedBox(height: 16),
          CustomTextField(
            controller: _confirmNewPassword,
            label: l10n.confirmPassword,
            obscure: true,
            textInputAction: TextInputAction.done,
            validator: (v) => Validators.confirmPassword(
              v,
              original: _newPassword.text,
              l10n: l10n,
            ),
            onFieldSubmitted: (_) => _submitCode(),
            prefixIcon: Icons.lock_outline,
          ),
          if (_completeError != null) ...[
            const SizedBox(height: 16),
            ErrorMessage(message: _completeError!),
          ],
          const SizedBox(height: 24),
          PrimaryButton(
            label: l10n.setNewPassword,
            loading: _submittingCode,
            onPressed: _submittingCode ? null : _submitCode,
          ),
          const SizedBox(height: 12),
          Center(
            child: TextButton(
              onPressed: _submittingCode
                  ? null
                  : () {
                      Navigator.of(context).pushNamedAndRemoveUntil(
                        AppRoutes.login,
                        (route) => route.isFirst,
                      );
                    },
              child: Text(l10n.backToLogin),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDone(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        const Icon(
          Icons.check_circle_outline,
          size: 64,
          color: AppColors.primaryGreen,
        ),
        const SizedBox(height: 20),
        Text(
          l10n.passwordResetDone,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.black,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 28),
        PrimaryButton(
          label: l10n.backToLogin,
          icon: Icons.arrow_back,
          onPressed: () {
            Navigator.of(context).pushNamedAndRemoveUntil(
              AppRoutes.login,
              (route) => route.isFirst,
            );
          },
        ),
      ],
    );
  }

  Future<void> _submitCode() async {
    if (!_completeFormKey.currentState!.validate()) return;
    await _complete();
  }
}