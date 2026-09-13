import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';
import '../../services/support_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/error_message.dart';
import '../../widgets/primary_button.dart';
import '../../core/utils/validators.dart';

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
      setState(() => _error = 'Please choose a topic first.');
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
        const SnackBar(content: Text('Message sent. We will get back to you.')),
      );
      Navigator.of(context).pop();
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'We could not send your message right now.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: const Text('Help & support')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'How can we help?',
              style: TextStyle(
                color: AppColors.black,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Send us a message — our team typically responds within 24 '
              'hours.',
              style: TextStyle(color: AppColors.secondaryText, fontSize: 13),
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
                  const Text(
                    'Contact support',
                    style: TextStyle(
                      color: AppColors.black,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Email: ${AppConstants.supportEmail}',
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 13.5,
                    ),
                  ),
                  if (AppConstants.supportPhone.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Call: ${AppConstants.supportPhone}',
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
            _TopicPicker(onChanged: (t) => setState(() => _category = t)),
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
                    label: 'Subject',
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
                      labelText: 'Tell us what happened',
                      hintText: 'Describe your issue in a few sentences…',
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
              label: 'Send message',
              loading: _submitting,
              onPressed: _submitting ? null : _submit,
            ),
            const SizedBox(height: 24),
            const Text(
              'FAQ',
              style: TextStyle(
                color: AppColors.black,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            const _FaqTile(
              question: 'How long will my driver take to arrive?',
              answer:
                  'Once a driver accepts your request, you see an arrival '
                  'estimate on the tracking screen. Timing depends on traffic '
                  'and how close the driver is.',
            ),
            const _FaqTile(
              question: 'How is the fare calculated?',
              answer:
                  'Fares are normally a combination of a pickup fee, distance '
                  'and time. Today the app shows an honest distance-based '
                  'estimate until the backend pricing is connected.',
            ),
            const _FaqTile(
              question: 'Can I cancel a ride?',
              answer:
                  'Yes, from the confirm screen before a driver accepts. '
                  'Cancellation fees will be shown when the backend is '
                  'connected.',
            ),
            const _FaqTile(
              question: 'What if I left something in the car?',
              answer:
                  'Open the ride in your history, tap "Get help", and we will '
                  'contact the driver for you.',
            ),
          ],
        ),
      ),
    );
  }
}

class _TopicPicker extends StatelessWidget {
  const _TopicPicker({required this.onChanged});

  final ValueChanged<String?> onChanged;

  static const _topics = [
    'Ride issue',
    'Payment issue',
    'Driver issue',
    'Account issue',
    'Safety concern',
    'Other',
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _topics.map((topic) {
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