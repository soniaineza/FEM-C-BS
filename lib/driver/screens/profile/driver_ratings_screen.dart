import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../services/driver_api_client.dart';

/// Driver ratings overview.
class DriverRatingsScreen extends StatefulWidget {
  const DriverRatingsScreen({super.key});

  @override
  State<DriverRatingsScreen> createState() => _DriverRatingsScreenState();
}

class _DriverRatingsScreenState extends State<DriverRatingsScreen> {
  List<Map<String, dynamic>> _ratings = [];
  Map<String, dynamic> _summary = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await driverApiClient.get('driver/ratings');
      final ratings = (data['ratings'] as List<dynamic>? ?? [])
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      final summary = (data['summary'] as Map<String, dynamic>?) ?? {};
      if (mounted) setState(() { _ratings = ratings; _summary = summary; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.driverRatings)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Overall rating
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.white, borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border)),
                  child: Column(
                    children: [
                      Text('${(_summary['average'] as num?)?.toDouble().toStringAsFixed(1) ?? "—"}',
                        style: const TextStyle(color: AppColors.black, fontSize: 48, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(5, (i) {
                          final avg = (_summary['average'] as num?)?.toDouble() ?? 0;
                          return Icon(
                            i < avg.round() ? Icons.star : Icons.star_border,
                            color: const Color(0xFFF59E0B), size: 28);
                        }),
                      ),
                      const SizedBox(height: 6),
                      Text('${(_summary['total'] as int?) ?? 0} ${l10n.completedRides}',
                        style: const TextStyle(color: AppColors.secondaryText, fontSize: 13)),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                // Rating breakdown
                if (_summary['breakdown'] != null) ...[
                  const Text('Rating breakdown', style: TextStyle(
                    color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ...(_summary['breakdown'] as List<dynamic>).map((b) {
                    final star = (b['stars'] as int?) ?? 0;
                    final count = (b['count'] as int?) ?? 0;
                    final total = (_summary['total'] as int?) ?? 1;
                    final pct = total > 0 ? count / total : 0.0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Text('$star ★', style: const TextStyle(fontSize: 13)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: pct.toDouble(),
                                backgroundColor: AppColors.border,
                                valueColor: AlwaysStoppedAnimation(Color(0xFFF59E0B)),
                                minHeight: 8,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text('$count', style: const TextStyle(fontSize: 12, color: AppColors.secondaryText)),
                        ],
                      ),
                    );
                  }),
                  const SizedBox(height: 20),
                ],
                // Recent ratings
                const Text('Recent ratings', style: TextStyle(
                  color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                if (_ratings.isEmpty)
                  EmptyState(icon: Icons.star_outline, title: 'No ratings yet',
                    subtitle: 'Ratings from passengers will appear here.', compact: true)
                else
                  ..._ratings.map((r) => _RatingTile(rating: r)),
              ],
            ),
    );
  }
}

class _RatingTile extends StatelessWidget {
  const _RatingTile({required this.rating});
  final Map<String, dynamic> rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ...List.generate(5, (i) => Icon(
                i < ((rating["rating"] ?? 0) as int) ? Icons.star : Icons.star_border,
                color: const Color(0xFFF59E0B), size: 16)),
              const Spacer(),
              Text(rating['passengerName'] as String? ?? 'Passenger',
                style: const TextStyle(color: AppColors.secondaryText, fontSize: 12)),
            ],
          ),
          if (rating['comment'] != null && (rating['comment'] as String).isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(rating['comment'] as String,
              style: const TextStyle(color: AppColors.black, fontSize: 13)),
          ],
        ],
      ),
    );
  }
}
