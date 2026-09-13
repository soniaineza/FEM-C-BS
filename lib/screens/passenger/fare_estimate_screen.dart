import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/vehicle.dart';
import '../../services/ride_service.dart';
import '../../widgets/info_row.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/trip_route_card.dart';

/// Fare estimate review (step 14).
///
/// Every amount here is explicitly an estimate: [FareEstimate.isEstimate] is
/// always true before a trip. The final fare is decided by the backend.
class FareEstimateScreen extends StatelessWidget {
  const FareEstimateScreen({
    super.key,
    required this.pickup,
    required this.destination,
    required this.vehicle,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final estimate = rideServiceEstimate();
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.rideSummary)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TripRouteCard(
              pickup: pickup,
              destination: destination,
              distanceKm: estimate?.distanceKm,
              durationMinutes: estimate?.durationMinutes,
            ),
            const SizedBox(height: 20),
            InfoRow(label: l10n.vehicle, value: vehicle.name, bold: true),
            const SizedBox(height: 12),
            const SizedBox(height: 20),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          color: AppColors.white,
          child: PrimaryButton(
            label: l10n.continueLabel,
            onPressed: () => Navigator.of(context).pushNamed(
              AppRoutes.paymentMethod,
              arguments: (pickup, destination, vehicle, estimate),
            ),
          ),
        ),
      ),
    );
  }

  FareEstimate? rideServiceEstimate() {
    return rideService.estimateFare(
      vehicle: vehicle,
      pickup: pickup,
      destination: destination,
    );
  }
}
