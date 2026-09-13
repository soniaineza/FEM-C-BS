import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/payment.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/vehicle.dart';
import '../../services/ride_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/trip_route_card.dart';

/// Waiting screen while the backend matches a driver (step 17).
///
/// It shows a loading radar and stays subscribed to the ride. A driver is only
/// displayed — by other screens — when the backend actually assigns one; this
/// screen never invents a driver. When the backend is not connected yet, an
/// honest notice explains that matching is unavailable and the passenger can
/// go back home.
class SearchingDriverScreen extends StatefulWidget {
  const SearchingDriverScreen({
    super.key,
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.paymentMethod,
    required this.estimate,
    this.requestError,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final PaymentMethod paymentMethod;
  final FareEstimate? estimate;
  final String? requestError;

  @override
  State<SearchingDriverScreen> createState() => _SearchingDriverScreenState();
}

class _SearchingDriverScreenState extends State<SearchingDriverScreen> {
  StreamSubscription<Ride>? _subscription;

  late final Ride _draft = Ride(
    id: 'draft_${DateTime.now().millisecondsSinceEpoch}',
    pickup: widget.pickup,
    destination: widget.destination,
    vehicle: widget.vehicle,
    paymentMethod: widget.paymentMethod,
    status: RideStatus.searchingDriver,
    estimatedFare: widget.estimate?.estimatedFare ?? 0,
    distanceKm: widget.estimate?.distanceKm ?? 0,
    durationMinutes: widget.estimate?.durationMinutes ?? 0,
    createdAt: DateTime.now(),
  );

  @override
  void initState() {
    super.initState();
    if (widget.requestError == null) {
      _subscription = rideService.subscribeToRide(_draft.id).listen(
        _onRideUpdate,
        onError: (Object _) {
          // Cannot inform the user about broken empty stream in dev.
        },
      );
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  void _onRideUpdate(Ride ride) {
    if (!mounted) return;
    switch (ride.status) {
      case RideStatus.searchingDriver:
        return; // still looking, keep the loading state
      case RideStatus.driverAssigned:
        Navigator.of(context)
            .pushReplacementNamed(AppRoutes.driverAccepted, arguments: ride);
      case RideStatus.driverArriving:
      case RideStatus.inProgress:
        Navigator.of(context)
            .pushReplacementNamed(AppRoutes.rideTracking, arguments: ride);
      case RideStatus.completed:
        Navigator.of(context)
            .pushReplacementNamed(AppRoutes.rideCompleted, arguments: ride);
      case RideStatus.cancelled:
        Navigator.of(context)
            .pushNamedAndRemoveUntil(AppRoutes.home, (route) => false);
    }
  }

  Future<void> _cancel() async {
    await rideService.cancelRide(_draft.id);
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRoutes.home,
      (route) => false,
    );
  }

  Future<void> _confirmCancel() async {
    final l10n = AppLocalizations.of(context);
    final goHome = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(l10n.cancelRideQuestion,
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          l10n.backHome,
          style: TextStyle(color: AppColors.secondaryText),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.keepRide),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.cancelRide),
          ),
        ],
      ),
    );
    if (goHome == true && mounted) await _cancel();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (widget.requestError != null) {
      return Scaffold(
        backgroundColor: AppColors.lightBackground,
        appBar: AppBar(title: Text(l10n.findingDriver)),
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
                      distanceKm: widget.estimate?.distanceKm,
                      durationMinutes: widget.estimate?.durationMinutes,
                    ),
                    const SizedBox(height: 24),
                    EmptyState(
                      icon: Icons.sensors_off_outlined,
                      title: l10n.backendUnavailable,
                      subtitle:
                          '${widget.requestError}\n\nThis screen becomes '
                          'active when the backend is connected, and drivers '
                          'will be matched here in real time.',
                      compact: true,
                    ),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  color: AppColors.white,
                  child: PrimaryButton(
                    label: l10n.backHome,
                    onPressed: () => Navigator.of(context)
                        .pushNamedAndRemoveUntil(
                          AppRoutes.home,
                          (route) => false,
                        ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const _Radar(),
                  const SizedBox(height: 20),
                  Text(
                    l10n.findingDriver,
                    style: TextStyle(
                      color: AppColors.black,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 40),
                    child: Text(
                      l10n.matchingDriver,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 14,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  TripRouteCard(
                    pickup: widget.pickup,
                    destination: widget.destination,
                    distanceKm: widget.estimate?.distanceKm,
                    durationMinutes: widget.estimate?.durationMinutes,
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _confirmCancel,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                        side: const BorderSide(color: AppColors.error),
                      ),
                      child: const Text('Cancel ride'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Radar extends StatefulWidget {
  const _Radar();

  @override
  State<_Radar> createState() => _RadarState();
}

class _RadarState extends State<_Radar> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96,
      height: 96,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final scale = 0.7 + 0.5 * _controller.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 96 * scale,
                height: 96 * scale,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.primaryGreen.withValues(
                    alpha: 0.12 * (1 - _controller.value),
                  ),
                ),
              ),
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.directions_car_filled,
                  color: AppColors.white,
                  size: 28,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}