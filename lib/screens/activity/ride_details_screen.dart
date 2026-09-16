import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../widgets/info_row.dart';

/// Full details for a single past ride (step 24).
class RideDetailsScreen extends StatelessWidget {
  const RideDetailsScreen({super.key, required this.ride});

  final Ride ride;

  String get _formattedDate {
    final d = ride.createdAt ?? DateTime.now();
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final time = '${d.hour.toString().padLeft(2, '0')}:'
        '${d.minute.toString().padLeft(2, '0')}';
    return '${d.day} ${months[d.month - 1]} ${d.year}, $time';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = ride.driver;
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.rideDetails)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  _DetailRow(label: l10n.date, value: _formattedDate),
                  const Divider(),
                  _DetailRow(label: l10n.pickup, value: ride.pickup.address),
                  const Divider(),
                  _DetailRow(
                      label: l10n.destination, value: ride.destination.address),
                  const Divider(),
                  _DetailRow(
                    label: l10n.driver,
                    value: driver?.name ?? l10n.notAssigned,
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.vehicle,
                    value: driver == null
                        ? ride.vehicle.name
                        : '${driver.vehicleModel} · ${driver.licensePlate}',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.distance,
                    value: '${ride.distanceKm.toStringAsFixed(1)} km',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.duration,
                    value: '${ride.durationMinutes} min',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.fare,
                    value: formatFare(ride.finalFare ?? ride.estimatedFare),
                    bold: true,
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.paymentMethod,
                    value: ride.paymentMethod.name,
                  ),
                  const Divider(),
                  _DetailRow(
                    label: l10n.rating,
                    value: ride.rating == null ? l10n.notRated : _stars(ride.rating!),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => Navigator.of(context)
                    .pushNamed(AppRoutes.helpSupport),
                icon: const Icon(Icons.support_agent, color: AppColors.primaryGreen),
                label: Text(l10n.getHelp),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.black,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _stars(int rating) {
    return '★' * rating + '☆' * (5 - rating);
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.bold = false,
  });

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: InfoRow(label: label, value: value, bold: bold),
    );
  }
}