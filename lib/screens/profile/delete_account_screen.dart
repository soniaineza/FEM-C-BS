import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../services/auth_service.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';

/// Delete account with confirmation (step 39).
///
/// Today this removes the local preview session. When the backend is
/// connected it will permanently close the account and erase personal data.
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  bool _confirmed = false;
  bool _deleting = false;
  String? _error;

  Future<void> _delete() async {
    if (!_confirmed) return;
    setState(() {
      _deleting = true;
      _error = null;
    });
    try {
      await authService.deleteAccount();
      // currentUser becomes null; the root router opens the welcome screen.
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).deleteFailed;
      });
      return;
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.deleteAccount)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              const Icon(Icons.warning_amber_rounded,
                  color: AppColors.error, size: 48),
              const SizedBox(height: 16),
              Text(
                l10n.deleteYourAccount,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.black,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                l10n.deleteAccountBody,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.secondaryText,
                  fontSize: 13.5,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 20),
              CheckboxListTile(
                value: _confirmed,
                onChanged: (v) => setState(() => _confirmed = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                activeColor: AppColors.error,
                title: Text(
                  l10n.deleteConfirm,
                  style: TextStyle(
                    color: AppColors.black,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                ErrorMessage(message: _error!),
              ],
              const Spacer(),
              PrimaryButton(
                label: l10n.deleteMyAccount,
                loading: _deleting,
                onPressed: _confirmed && !_deleting ? _delete : null,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _deleting
                    ? null
                    : () => Navigator.of(context).pop(),
                child: Text(l10n.keepMyAccount),
              ),
            ],
          ),
        ),
      ),
    );
  }
}