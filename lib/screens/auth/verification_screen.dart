import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/passenger.dart';
import '../../services/auth_service.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';

/// OTP verification. [passenger] is the account created at sign-up which is
/// carried into profile setup once the code is verified.
class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key, this.passenger});

  final Passenger? passenger;

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  final _controller = TextEditingController();

  bool _loading = false;
  String? _error;
  int _resendSeconds = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _resendSeconds = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_resendSeconds <= 1) {
        timer.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds -= 1);
      }
    });
  }

  Future<void> _verify() async {
    FocusScope.of(context).unfocus();
    final code = _controller.text.trim();
    if (code.length != AppConstants.otpLength) {
      setState(() => _error = AppLocalizations.of(context).invalidVerificationCode);
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await authService.verifyOtp(
        code: code,
        l10n: AppLocalizations.of(context),
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed(
        AppRoutes.profileSetup,
        arguments: widget.passenger,
      );
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() {
        _error = AppLocalizations.of(context).verificationFailed;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    if (_resendSeconds > 0) return;
    try {
      await authService.resendOtp();
      if (!mounted) return;
      _startCountdown();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).newCodeRequested)),
      );
    } on AppException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).verificationFailed)),
      );
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
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.verifyAccount,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.black,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.verificationCodeSent,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 14.5,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _controller,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                maxLength: AppConstants.otpLength,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 14,
                  color: AppColors.black,
                ),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                  if (_controller.text.length == AppConstants.otpLength) {
                    _verify();
                  }
                },
                decoration: const InputDecoration(
                  counterText: '',
                  hintText: '······',
                  hintStyle: TextStyle(
                    color: AppColors.border,
                    fontSize: 26,
                    letterSpacing: 14,
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                ErrorMessage(message: _error!),
              ],
              const SizedBox(height: 24),
              PrimaryButton(
                label: l10n.verify,
                loading: _loading,
                onPressed: _loading ? null : _verify,
              ),
              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: _resendSeconds > 0 ? null : _resend,
                  child: Text(
                    _resendSeconds > 0
                        ? l10n.resendCodeIn(_resendSeconds)
                        : l10n.resendCode,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}