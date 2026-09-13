import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/vehicle.dart';
import '../../services/ride_service.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/section_title.dart';
import '../../widgets/trip_route_card.dart';

/// Shows the route summary (step 12) then the vehicle catalogue (step 13).
///
/// Fares and vehicle data are development placeholders served by
/// [RideService] and labeled as such. The backend will replace them.
class VehicleSelectionScreen extends StatefulWidget {
  const VehicleSelectionScreen({
    super.key,
    required this.pickup,
    required this.destination,
  });

  final Place pickup;
  final Place destination;

  @override
  State<VehicleSelectionScreen> createState() => _VehicleSelectionScreenState();
}

class _VehicleSelectionScreenState extends State<VehicleSelectionScreen> {
  late final List<Vehicle> _vehicles = rideService.getAvailableVehicles();
  String? _selectedId;
  FareEstimate? _routeEstimate;
  Map<String, FareEstimate?> _fares = {};

  @override
  void initState() {
    super.initState();
    final anyVehicle = _vehicles.first;
    final estimate = rideService.estimateFare(
      vehicle: anyVehicle,
      pickup: widget.pickup,
      destination: widget.destination,
    );
    setState(() {
      _routeEstimate = estimate;
      _fares = {
        for (final v in _vehicles)
          v.id: rideService.estimateFare(
            vehicle: v,
            pickup: widget.pickup,
            destination: widget.destination,
          ),
      };
      _selectedId = _vehicles.first.id;
    });
  }

  bool get _hasEstimate => _routeEstimate != null;

  void _continue() {
    final vehicle = _vehicles.firstWhere((v) => v.id == _selectedId);
    Navigator.of(context).pushNamed(
      AppRoutes.fareEstimate,
      arguments: (widget.pickup, widget.destination, vehicle),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.chooseRide)),
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
                    distanceKm: _routeEstimate?.distanceKm,
                    durationMinutes: _routeEstimate?.durationMinutes,
                  ),
                  const SizedBox(height: 20),
                  SectionTitle(l10n.vehicleOptions),
                  const SizedBox(height: 4),
                  if (!_hasEstimate)
                    const Text(
                      'Select these points on the map to see fares. '
                      'You can still book and the driver will agree the fare '
                      'before the trip.',
                      style: TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  const SizedBox(height: 12),
                  ..._vehicles.map(
                    (v) => _VehicleCard(
                      vehicle: v,
                      estimate: _fares[v.id],
                      selected: v.id == _selectedId,
                      onTap: () => setState(() => _selectedId = v.id),
                    ),
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

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.vehicle,
    required this.estimate,
    required this.selected,
    required this.onTap,
  });

  final Vehicle vehicle;
  final FareEstimate? estimate;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? AppColors.primaryGreen : AppColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  selected ? Icons.radio_button_checked : Icons.radio_button_off,
                  color: selected ? AppColors.primaryGreen : AppColors.secondaryText,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        vehicle.name,
                        style: const TextStyle(
                          color: AppColors.black,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        vehicle.description,
                        style: const TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 12.5,
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(
                            Icons.group_outlined,
                            size: 14,
                            color: AppColors.secondaryText,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${vehicle.capacity} seats',
                            style: const TextStyle(
                              color: AppColors.secondaryText,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(width: 14),
                          const Icon(
                            Icons.schedule,
                            size: 14,
                            color: AppColors.secondaryText,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Arrives in ~${vehicle.etaMinutes} min',
                            style: const TextStyle(
                              color: AppColors.secondaryText,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}