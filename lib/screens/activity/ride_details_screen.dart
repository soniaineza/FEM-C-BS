import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
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
    final driver = ride.driver;
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: const Text('Ride details')),
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
                  _DetailRow(label: 'Date', value: _formattedDate),
                  const Divider(),
                  _DetailRow(label: 'Pickup', value: ride.pickup.address),
                  const Divider(),
                  _DetailRow(
                      label: 'Destination', value: ride.destination.address),
                  const Divider(),
                  _DetailRow(
                    label: 'Driver',
                    value: driver?.name ?? 'Not assigned',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Vehicle',
                    value: driver == null
                        ? ride.vehicle.name
                        : '${driver.vehicleModel} · ${driver.licensePlate}',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Distance',
                    value: '${ride.distanceKm.toStringAsFixed(1)} km',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Duration',
                    value: '${ride.durationMinutes} min',
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Fare',
                    value: formatFare(ride.finalFare ?? ride.estimatedFare),
                    bold: true,
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Payment method',
                    value: ride.paymentMethod.name,
                  ),
                  const Divider(),
                  _DetailRow(
                    label: 'Rating',
                    value: ride.rating == null ? 'Not rated' : _stars(ride.rating!),
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
                label: const Text('Get help'),
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