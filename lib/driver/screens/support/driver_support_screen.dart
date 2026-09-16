import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../services/driver_api_client.dart';

/// Driver support screen — submit tickets and view history.
class DriverSupportScreen extends StatefulWidget {
  const DriverSupportScreen({super.key});

  @override
  State<DriverSupportScreen> createState() => _DriverSupportScreenState();
}

class _DriverSupportScreenState extends State<DriverSupportScreen> {
  List<Map<String, dynamic>> _tickets = [];
  bool _loading = true;
  bool _submitting = false;

  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();
  String _selectedCategory = 'general';

  static const _categories = {
    'general': 'General',
    'payment': 'Payment issue',
    'report_passenger': 'Report passenger',
    'app_issue': 'Technical issue',
    'vehicle_issue': 'Vehicle issue',
    'lost_item': 'Lost item',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await driverApiClient.get('driver/support');
      final tickets = (data['tickets'] as List<dynamic>? ?? [])
          .map((t) => Map<String, dynamic>.from(t as Map))
          .toList();
      if (mounted) setState(() { _tickets = tickets; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _submitTicket() async {
    if (_subjectController.text.trim().isEmpty || _messageController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await driverApiClient.post('driver/support', body: {
        'category': _selectedCategory,
        'subject': _subjectController.text.trim(),
        'message': _messageController.text.trim(),
      });
      if (mounted) {
        _subjectController.clear();
        _messageController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Support ticket submitted')),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.support)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Submit form
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.white, borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Submit a ticket', style: TextStyle(
                        color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _selectedCategory,
                        items: _categories.entries
                            .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                            .toList(),
                        onChanged: (v) { if (v != null) setState(() => _selectedCategory = v); },
                        decoration: const InputDecoration(labelText: 'Category'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _subjectController,
                        decoration: const InputDecoration(labelText: 'Subject'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _messageController,
                        maxLines: 3,
                        decoration: const InputDecoration(labelText: 'Message'),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _submitting ? null : _submitTicket,
                          child: _submitting
                              ? const SizedBox(width: 20, height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                              : const Text('Submit'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                if (_tickets.isNotEmpty) ...[
                  Text(l10n.rideHistory, style: const TextStyle(
                    color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ..._tickets.map((t) => _TicketTile(ticket: t)),
                ] else
                  EmptyState(
                    icon: Icons.support_agent,
                    title: 'No support tickets',
                    subtitle: 'Your support history will appear here.',
                    compact: true,
                  ),
              ],
            ),
    );
  }
}

class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket});
  final Map<String, dynamic> ticket;

  @override
  Widget build(BuildContext context) {
    final status = ticket['status'] as String? ?? 'open';
    final statusColor = switch (status) {
      'resolved' || 'closed' => AppColors.success,
      'open' => Color(0xFFF59E0B),
      _ => AppColors.secondaryText,
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ticket['subject'] as String? ?? '',
                  style: const TextStyle(color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 3),
                Text(ticket['category'] as String? ?? '',
                  style: const TextStyle(color: AppColors.secondaryText, fontSize: 12)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6)),
            child: Text(status.toUpperCase(),
              style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
