import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../models/driver_ride.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_earnings_service.dart';

/// Driver earnings overview with today/week/month breakdown.
class DriverEarningsScreen extends StatefulWidget {
  const DriverEarningsScreen({super.key});

  @override
  State<DriverEarningsScreen> createState() => _DriverEarningsScreenState();
}

class _DriverEarningsScreenState extends State<DriverEarningsScreen> {
  DriverEarningsData? _earnings;
  List<EarningRecord> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final earnings = await driverEarningsService.getEarningsSummary();
      final history = await driverEarningsService.getEarningsHistory();
      if (mounted) setState(() { _earnings = earnings; _history = history; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  children: [
                    Text(l10n.earnings,
                      style: const TextStyle(color: AppColors.black, fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 16),
                    // Summary cards
                    _SummaryCard(
                      label: l10n.earningsTodayLabel,
                      amount: _earnings?.todayAmount ?? 0,
                      rides: _earnings?.todayRides ?? 0,
                      color: AppColors.primaryGreen,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(child: _SummaryCard(
                          label: l10n.earningsWeekLabel,
                          amount: _earnings?.weekAmount ?? 0,
                          rides: _earnings?.weekRides ?? 0,
                        )),
                        const SizedBox(width: 10),
                        Expanded(child: _SummaryCard(
                          label: l10n.earningsMonthLabel,
                          amount: _earnings?.monthAmount ?? 0,
                          rides: _earnings?.monthRides ?? 0,
                        )),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // Pending balance
                    if ((_earnings?.pendingBalance ?? 0) > 0) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Color(0xFFF59E0B).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Color(0xFFF59E0B)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.pending_actions, color: Color(0xFFF59E0B)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(l10n.pendingBalance,
                                    style: TextStyle(color: AppColors.black, fontSize: 13, fontWeight: FontWeight.w600)),
                                  Text('${(_earnings!.pendingBalance).round()} RWF',
                                    style: TextStyle(color: AppColors.black, fontSize: 16, fontWeight: FontWeight.w800)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    // History
                    Text(l10n.rideHistory,
                      style: const TextStyle(color: AppColors.black, fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    if (_history.isEmpty)
                      EmptyState(
                        icon: Icons.account_balance_wallet_outlined,
                        title: l10n.noRidesYet,
                        subtitle: 'Your earnings will appear here.',
                        compact: true,
                      )
                    else
                      ..._history.map((e) => _EarningTile(record: e)),
                  ],
                ),
              ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.label, required this.amount, required this.rides, this.color});

  final String label;
  final double amount;
  final int rides;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final accent = color ?? AppColors.black;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color ?? AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: AppColors.secondaryText, fontSize: 12)),
          const SizedBox(height: 4),
          Text(
            '${amount.round().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} RWF',
            style: TextStyle(color: accent, fontSize: 20, fontWeight: FontWeight.w800),
          ),
          Text('$rides rides', style: const TextStyle(color: AppColors.secondaryText, fontSize: 11)),
        ],
      ),
    );
  }
}

class _EarningTile extends StatelessWidget {
  const _EarningTile({required this.record});
  final EarningRecord record;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                record.status == 'settled' ? Icons.check_circle : Icons.pending,
                color: record.status == 'settled' ? AppColors.success : Color(0xFFF59E0B),
                size: 16,
              ),
              const SizedBox(width: 6),
              Text(record.status.toUpperCase(),
                style: TextStyle(
                  color: record.status == 'settled' ? AppColors.success : Color(0xFFF59E0B),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                )),
              const Spacer(),
              Text('${record.netAmount.round()} RWF',
                style: const TextStyle(color: AppColors.black, fontSize: 15, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          Text('${record.pickupAddress} → ${record.destAddress}',
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.secondaryText, fontSize: 12)),
          const SizedBox(height: 4),
          Row(
            children: [
              Text('${record.distanceKm.toStringAsFixed(1)} km',
                style: const TextStyle(color: AppColors.secondaryText, fontSize: 11)),
              const SizedBox(width: 8),
              Text(record.paymentMethod,
                style: const TextStyle(color: AppColors.secondaryText, fontSize: 11)),
              const Spacer(),
              Text(_formatDate(record.createdAt),
                style: const TextStyle(color: AppColors.secondaryText, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) => '${date.day}/${date.month}/${date.year}';
}
