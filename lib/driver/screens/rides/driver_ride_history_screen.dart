import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../models/driver_ride.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_ride_service.dart';

/// Driver ride history with filtering.
class DriverRideHistoryScreen extends StatefulWidget {
  const DriverRideHistoryScreen({super.key});

  @override
  State<DriverRideHistoryScreen> createState() => _DriverRideHistoryScreenState();
}

class _DriverRideHistoryScreenState extends State<DriverRideHistoryScreen> {
  List<DriverRide>? _rides;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _rides = null; _error = false; });
    try {
      final rides = await driverRideService.getRideHistory();
      if (!mounted) return;
      setState(() => _rides = rides);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                l10n.rideHistory,
                style: const TextStyle(color: AppColors.black, fontSize: 20, fontWeight: FontWeight.w800),
              ),
            ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    final l10n = AppLocalizations.of(context);
    if (_error) {
      return Center(
        child: EmptyState(
          icon: Icons.error_outline,
          title: l10n.rideHistory,
          subtitle: l10n.tryAgain,
          actionLabel: l10n.tryAgain,
          onAction: _load,
          compact: true,
        ),
      );
    }
    if (_rides == null) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen));
    }
    if (_rides!.isEmpty) {
      return EmptyState(
        icon: Icons.directions_car_outlined,
        title: l10n.noRidesYet,
        subtitle: l10n.completedRides,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        itemCount: _rides!.length,
        itemBuilder: (context, i) {
          final ride = _rides![i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _DriverRideCard(
              ride: ride,
              onTap: () => Navigator.of(context).pushNamed(
                DriverRoutes.rideDetails,
                arguments: ride.id,
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Ride card tailored for the driver perspective.
class _DriverRideCard extends StatelessWidget {
  const _DriverRideCard({required this.ride, required this.onTap});

  final DriverRide ride;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = ride.status == 'completed'
        ? AppColors.success
        : ride.status == 'cancelled'
            ? AppColors.error
            : AppColors.secondaryText;

    return Material(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    ride.status == 'completed' ? Icons.check_circle : Icons.cancel,
                    color: statusColor,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    ride.status.toUpperCase(),
                    style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Text(
                    _formatDate(ride.createdAt),
                    style: const TextStyle(color: AppColors.secondaryText, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.circle, color: AppColors.primaryGreen, size: 8),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(ride.pickupAddress, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.black, fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.place, color: AppColors.error, size: 8),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(ride.destAddress, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.black, fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    '${ride.distanceKm.toStringAsFixed(1)} km',
                    style: const TextStyle(color: AppColors.secondaryText, fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${formatFare(ride.estimatedFare)}',
                    style: const TextStyle(color: AppColors.black, fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '';
    return '${date.day}/${date.month}/${date.year}';
  }

  String formatFare(double amount) {
    final rounded = amount.round();
    final digits = rounded.toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);
      final remaining = digits.length - i - 1;
      if (remaining > 0 && remaining % 3 == 0) buffer.write(',');
    }
    return '$buffer RWF';
  }
}
