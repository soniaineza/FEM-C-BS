import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/ride_type.dart';
import '../../services/ride_service.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/trip_route_card.dart';

/// Ride type choice (private vs shared) shown right after the destination is
/// picked (step 13a).
///
/// A shared ride is cheaper — [RideType.fareFactor] applies a discount to the
/// vehicle fare — in exchange for a possible short detour while other
/// passengers are picked up or dropped off.
class RideTypeScreen extends StatefulWidget {
  const RideTypeScreen({
    super.key,
    required this.pickup,
    required this.destination,
  });

  final Place pickup;
  final Place destination;

  @override
  State<RideTypeScreen> createState() => _RideTypeScreenState();
}

class _RideTypeScreenState extends State<RideTypeScreen> {
  RideType _selected = RideType.private;

  FareEstimate? _privateEstimate;
  FareEstimate? _sharedEstimate;

  @override
  void initState() {
    super.initState();
    final vehicles = rideService.getAvailableVehicles();
    if (vehicles.isNotEmpty) {
      final economy = vehicles.first;
      _privateEstimate = rideService.estimateFare(
        vehicle: economy,
        pickup: widget.pickup,
        destination: widget.destination,
        rideType: RideType.private,
      );
      _sharedEstimate = rideService.estimateFare(
        vehicle: economy,
        pickup: widget.pickup,
        destination: widget.destination,
        rideType: RideType.shared,
      );
    }
  }

  void _continue() {
    Navigator.of(context).pushNamed(
      AppRoutes.vehicleSelection,
      arguments: (widget.pickup, widget.destination, _selected),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.rideType)),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  TripRouteCard(
                    pickup: widget.pickup,
                    destination: widget.destination,
                    distanceKm: _sharedEstimate?.distanceKm,
                    durationMinutes: _sharedEstimate?.durationMinutes,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    l10n.chooseRideType,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.rideTypeHint,
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  _RideTypeCard(
                    rideType: RideType.private,
                    selected: _selected == RideType.private,
                    estimate: _privateEstimate,
                    onTap: () => setState(() => _selected = RideType.private),
                  ),
                  const SizedBox(height: 12),
                  _RideTypeCard(
                    rideType: RideType.shared,
                    selected: _selected == RideType.shared,
                    estimate: _sharedEstimate,
                    onTap: () => setState(() => _selected = RideType.shared),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: const BoxDecoration(
                  color: AppColors.white,
                  border: Border(top: BorderSide(color: AppColors.border)),
                ),
                child: PrimaryButton(
                  label: l10n.continueLabel,
                  onPressed: _continue,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RideTypeCard extends StatelessWidget {
  const _RideTypeCard({
    required this.rideType,
    required this.selected,
    required this.estimate,
    required this.onTap,
  });

  final RideType rideType;
  final bool selected;
  final FareEstimate? estimate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isShared = rideType == RideType.shared;
    final icon = isShared ? Icons.groups_outlined : Icons.person_outline;
    final title = isShared ? l10n.shareRide : l10n.privateRide;
    final description = isShared
        ? l10n.shareRideDescription
        : l10n.privateRideDescription;

    return Material(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppColors.primaryGreen : AppColors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primaryGreen.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: AppColors.primaryGreen, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: AppColors.black,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          description,
                          style: const TextStyle(
                            color: AppColors.secondaryText,
                            fontSize: 12.5,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: selected
                        ? AppColors.primaryGreen
                        : AppColors.secondaryText,
                    size: 22,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (estimate != null)
                Row(
                  children: [
                    Text(
                      formatFare(estimate!.estimatedFare),
                      style: const TextStyle(
                        color: AppColors.black,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      l10n.minutes(estimate!.durationMinutes),
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12,
                      ),
                    ),
                    if (isShared) ...[
                      const SizedBox(width: 10),
                      _SaveBadge(discount: rideType.discountPercent),
                    ],
                  ],
                ),
              if (isShared) ...[
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.info_outline,
                      size: 14,
                      color: AppColors.secondaryText,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        l10n.shareRideNote,
                        style: const TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SaveBadge extends StatelessWidget {
  const _SaveBadge({required this.discount});

  final int discount;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '${l10n.saveUpTo} $discount%',
        style: const TextStyle(
          color: AppColors.primaryGreen,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}