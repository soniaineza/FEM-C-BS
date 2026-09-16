import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';
import '../../services/support_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';
import '../../core/utils/validators.dart';
import '../../core/localization/app_localizations.dart';

/// Help & support: contact and FAQ (step 38).
class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen({super.key});

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String? _category;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_category == null) {
      setState(() => _error = AppLocalizations.of(context).chooseTopicFirst);
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await supportService.submitRequest(
        category: _category!,
        subject: _subject.text.trim(),
        message: _message.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).messageSentConfirmation)),
      );
      Navigator.of(context).pop();
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = AppLocalizations.of(context).messageSendFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.helpSupportTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              l10n.howCanWeHelp,
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              l10n.helpIntro,
              style: const TextStyle(color: AppColors.secondaryText, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Container(
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
                    l10n.contactSupport,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${l10n.emailPrefix}: ${AppConstants.supportEmail}',
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 13.5,
                    ),
                  ),
                  if (AppConstants.supportPhone.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '${l10n.callPrefix}: ${AppConstants.supportPhone}',
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 13.5,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            _TopicPicker(l10n: l10n, onChanged: (t) => setState(() => _category = t)),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorMessage(message: _error!),
            ],
            const SizedBox(height: 12),
            Form(
              key: _formKey,
              child: Column(
                children: [
                  CustomTextField(
                    controller: _subject,
                    label: l10n.subject,
                    textInputAction: TextInputAction.next,
                    validator: Validators.required,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _message,
                    minLines: 4,
                    maxLines: 6,
                    validator: Validators.required,
                    decoration: InputDecoration(
                      labelText: l10n.tellUsWhatHappened,
                      hintText: l10n.describeIssueHint,
                      alignLabelWithHint: true,
                      filled: true,
                      fillColor: AppColors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.primaryGreen,
                          width: 1.5,
                        ),
                      ),
                      labelStyle: const TextStyle(
                        color: AppColors.secondaryText,
                      ),
                      focusedErrorBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.error),
                      ),
                      errorBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.error),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: l10n.sendMessage,
              loading: _submitting,
              onPressed: _submitting ? null : _submit,
            ),
            const SizedBox(height: 24),
            Text(
              l10n.faqTitle,
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            _FaqTile(question: l10n.faqArrivalQuestion, answer: l10n.faqArrivalAnswer),
            _FaqTile(question: l10n.faqFareQuestion, answer: l10n.faqFareAnswer),
            _FaqTile(question: l10n.faqCancelQuestion, answer: l10n.faqCancelAnswer),
            _FaqTile(question: l10n.faqLostItemQuestion, answer: l10n.faqLostItemAnswer),
          ],
        ),
      ),
    );
  }
}

class _TopicPicker extends StatelessWidget {
  const _TopicPicker({required this.l10n, required this.onChanged});

  final AppLocalizations l10n;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final topics = [
      l10n.rideIssue,
      l10n.paymentIssue,
      l10n.driverIssue,
      l10n.accountIssue,
      l10n.safetyConcern,
      l10n.otherTopic,
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: topics.map((topic) {
        return FilterChip(
          label: Text(topic),
          onSelected: (_) => onChanged(topic),
          selectedColor: AppColors.primaryGreen,
          labelStyle: const TextStyle(
            color: AppColors.black,
            fontWeight: FontWeight.w600,
          ),
          showCheckmark: false,
        );
      }).toList(),
    );
  }
}

class _FaqTile extends StatelessWidget {
  const _FaqTile({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
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
              question,
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              answer,
              style: const TextStyle(
                color: AppColors.secondaryText,
                fontSize: 13,
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}