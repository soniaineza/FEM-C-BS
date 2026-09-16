import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../services/driver_api_client.dart';

/// Driver document management (KYC).
class DriverDocumentsScreen extends StatefulWidget {
  const DriverDocumentsScreen({super.key});

  @override
  State<DriverDocumentsScreen> createState() => _DriverDocumentsScreenState();
}

class _DriverDocumentsScreenState extends State<DriverDocumentsScreen> {
  List<Map<String, dynamic>> _documents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await driverApiClient.get('driver/documents');
      final docs = (data['documents'] as List<dynamic>? ?? [])
          .map((d) => Map<String, dynamic>.from(d as Map))
          .toList();
      if (mounted) setState(() { _documents = docs; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _uploadDocument(String docType) async {
    try {
      await driverApiClient.post('driver/documents', body: {
        'docType': docType,
        'fileName': '${docType}_document.pdf',
      });
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.documents)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Upload buttons
                Text(l10n.documentsRequired, style: const TextStyle(
                  color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                ..._requiredDocs().map((doc) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: OutlinedButton.icon(
                    onPressed: () => _uploadDocument(doc.$1),
                    icon: Icon(doc.$3, size: 20),
                    label: Text('Upload ${doc.$2}'),
                  ),
                )),
                const SizedBox(height: 20),
                // Uploaded documents
                if (_documents.isNotEmpty) ...[
                  const Text('Uploaded documents', style: TextStyle(
                    color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ..._documents.map((doc) => _DocumentTile(doc: doc)),
                ],
                if (_documents.isEmpty)
                  EmptyState(
                    icon: Icons.description_outlined,
                    title: 'No documents uploaded',
                    subtitle: 'Upload your required documents to get verified.',
                    compact: true,
                  ),
              ],
            ),
    );
  }

  List<(String, String, IconData)> _requiredDocs() => [
    ('license', "Driver's License", Icons.badge_outlined),
    ('national_id', 'National ID', Icons.credit_card_outlined),
    ('vehicle_registration', 'Vehicle Registration', Icons.description_outlined),
    ('insurance', 'Insurance', Icons.health_and_safety_outlined),
  ];
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.doc});
  final Map<String, dynamic> doc;

  @override
  Widget build(BuildContext context) {
    final status = doc['status'] as String? ?? 'pending';
    final statusColor = switch (status) {
      'approved' => AppColors.success,
      'rejected' => AppColors.error,
      _ => Color(0xFFF59E0B),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(Icons.description_outlined, color: AppColors.secondaryText, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(doc['docType'] as String? ?? '',
                  style: const TextStyle(color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
                if (doc['fileName'] != null)
                  Text(doc['fileName'] as String,
                    style: const TextStyle(color: AppColors.secondaryText, fontSize: 12)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(status.toUpperCase(),
              style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
