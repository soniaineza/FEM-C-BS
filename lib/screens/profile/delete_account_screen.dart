import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
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
        _error = 'We could not delete your account right now. '
            'Please try again.';
      });
      return;
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: const Text('Delete account')),
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
              const Text(
                'Delete your account',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.black,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'This will permanently close your account and remove your '
                'personal data, saved places and trip history. This action '
                'cannot be undone.',
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
                title: const Text(
                  'I understand that this cannot be undone.',
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
                label: 'Delete my account',
                loading: _deleting,
                onPressed: _confirmed && !_deleting ? _delete : null,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _deleting
                    ? null
                    : () => Navigator.of(context).pop(),
                child: const Text('Keep my account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}