import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../services/driver_earnings_service.dart';

/// Detailed earnings breakdown screen.
class DriverEarningsDetailScreen extends StatefulWidget {
  const DriverEarningsDetailScreen({super.key});
  @override
  State<DriverEarningsDetailScreen> createState() => _DriverEarningsDetailScreenState();
}

class _DriverEarningsDetailScreenState extends State<DriverEarningsDetailScreen> {
  DriverEarningsData? _earnings;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await driverEarningsService.getEarningsSummary();
      if (mounted) setState(() => _earnings = data);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final e = _earnings;
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.earningsSummary)),
      body: e == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _BigStat(label: l10n.earningsTotalLabel, value: '${e.totalAmount.round()} RWF'),
                const SizedBox(height: 16),
                _BigStat(label: l10n.pendingBalance, value: '${e.pendingBalance.round()} RWF'),
                const SizedBox(height: 16),
                _BigStat(label: l10n.completedRides, value: '${e.totalRides}'),
                const SizedBox(height: 16),
                if (e.rating != null)
                  _BigStat(label: l10n.avgRating, value: '${e.rating!.toStringAsFixed(1)} ★'),
              ],
            ),
    );
  }
}

class _BigStat extends StatelessWidget {
  const _BigStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.secondaryText, fontSize: 13)),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(color: AppColors.black, fontSize: 24, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
