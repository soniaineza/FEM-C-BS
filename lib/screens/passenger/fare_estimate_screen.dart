import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/ride_type.dart';
import '../../models/vehicle.dart';
import '../../services/location_service.dart';
import '../../services/ride_service.dart';
import '../../widgets/info_row.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/trip_route_card.dart';

/// Fare estimate review (step 14).
///
/// Every amount here is explicitly an estimate: the route distance and driving
/// time come from a real road route (fetched from the routing service when
/// possible) so the numbers match the actual streets the driver will take,
/// falling back to the straight-line estimate while the route loads or when it
/// cannot be computed. The final fare is always decided by the backend.
class FareEstimateScreen extends StatefulWidget {
  const FareEstimateScreen({
    super.key,
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.rideType,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final RideType rideType;

  @override
  State<FareEstimateScreen> createState() => _FareEstimateScreenState();
}

class _FareEstimateScreenState extends State<FareEstimateScreen> {
  RouteResult? _route;
  bool _loadingRoute = false;

  @override
  void initState() {
    super.initState();
    _loadRoute();
  }

  Future<void> _loadRoute() async {
    setState(() => _loadingRoute = true);
    final route = await locationService.getRoute(
      from: widget.pickup,
      to: widget.destination,
    );
    if (!mounted) return;
    setState(() {
      _route = route;
      _loadingRoute = false;
    });
  }

  /// Route-based estimate when available, otherwise the straight-line one.
  /// Null only when neither can be computed.
  FareEstimate? _estimate() {
    final route = _route;
    if (route != null && route.distanceMeters > 0) {
      return rideService.estimateFareWithRoute(
        vehicle: widget.vehicle,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        rideType: widget.rideType,
      );
    }
    return rideService.estimateFare(
      vehicle: widget.vehicle,
      pickup: widget.pickup,
      destination: widget.destination,
      rideType: widget.rideType,
    );
  }

  @override
  Widget build(BuildContext context) {
    final estimate = _estimate();
    final l10n = AppLocalizations.of(context);
    final isShared = widget.rideType == RideType.shared;

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.rideSummary)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TripRouteCard(
              pickup: widget.pickup,
              destination: widget.destination,
              distanceKm: estimate?.distanceKm,
              durationMinutes: estimate?.durationMinutes,
            ),
            if (_loadingRoute) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primaryGreen,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.findingBestRoute,
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 20),
            InfoRow(
              label: l10n.rideType,
              value: isShared ? l10n.shareRide : l10n.privateRide,
              bold: true,
            ),
            const SizedBox(height: 12),
            InfoRow(label: l10n.vehicle, value: widget.vehicle.name, bold: true),
            if (isShared) ...[
              const SizedBox(height: 12),
              InfoRow(
                label: l10n.shareSavings,
                value: estimate == null
                    ? '-${widget.rideType.discountPercent}%'
                    : '-${formatFare(estimate.savings)}',
                bold: true,
              ),
            ],
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
              arguments: (
                widget.pickup,
                widget.destination,
                widget.vehicle,
                _estimate(),
                widget.rideType,
              ),
            ),
          ),
        ),
      ),
    );
  }
}