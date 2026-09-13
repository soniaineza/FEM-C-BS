import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../services/ride_service.dart';
import '../../widgets/info_row.dart';
import '../../widgets/trip_route_card.dart';

/// Live ride tracking (steps 19 & 20).
///
/// Responds to the ride status delivered by the backend:
///  * `driverArriving` -> "Your driver is on the way" + vehicle/ETA
///  * `inProgress`     -> "You're on your way" + safety access
///
/// The live map pane activates when the backend streams driver positions;
/// until then an honest placeholder is shown instead of a fake map.
class RideTrackingScreen extends StatefulWidget {
  const RideTrackingScreen({super.key, required this.ride});

  final Ride ride;

  @override
  State<RideTrackingScreen> createState() => _RideTrackingScreenState();
}

class _RideTrackingScreenState extends State<RideTrackingScreen> {
  late Ride _ride = widget.ride;

  @override
  void initState() {
    super.initState();
    // Keep listening for later status updates (driver arrives, ride starts,
    // ride ends). Realtime comes from the backend when connected.
    rideService
        .subscribeToRide(_ride.id)
        .listen(_onUpdate, onError: (Object _) {});
  }

  void _onUpdate(Ride ride) {
    if (!mounted) return;
    setState(() => _ride = ride);
    if (ride.status == RideStatus.completed) {
      Navigator.of(context).pushReplacementNamed(
        AppRoutes.rideCompleted,
        arguments: ride,
      );
    }
  }

  Future<void> _cancelRide() async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(l10n.cancelRideQuestion,
            style: TextStyle(fontWeight: FontWeight.w800)),
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
    if (ok != true || !mounted) return;
    await rideService.cancelRide(_ride.id);
    if (!mounted) return;
    Navigator.of(context)
        .pushNamedAndRemoveUntil(AppRoutes.home, (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final arriving = _ride.status == RideStatus.driverArriving;
    final driver = _ride.driver;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text(arriving ? l10n.driverOnWay : l10n.tripInProgress),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              arriving ? l10n.driverOnWay : l10n.yourOnWay,
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            // Live-map placeholder. Real driver + route rendering is wired
            // when the backend streams positions.
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: AppColors.lightGray,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Icon(
                        Icons.map_outlined,
                        color: AppColors.secondaryText,
                        size: 32,
                      ),
                      SizedBox(height: 8),
                      Text(
                        l10n.liveTrackingPending,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TripRouteCard(
              pickup: _ride.pickup,
              destination: _ride.destination,
              distanceKm: _ride.distanceKm,
              durationMinutes: _ride.durationMinutes,
            ),
            if (driver != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: AppColors.primaryGreen
                              .withValues(alpha: 0.12),
                          child: Text(
                            _initials(driver.name),
                            style: const TextStyle(
                              color: AppColors.primaryGreen,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            driver.name,
                            style: const TextStyle(
                              color: AppColors.black,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '${driver.vehicleModel} · ${driver.vehicleColor}',
                                style: const TextStyle(
                                  color: AppColors.secondaryText,
                                  fontSize: 12.5,
                                ),
                              ),
                              Text(
                                driver.licensePlate,
                                style: const TextStyle(
                                  color: AppColors.black,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (arriving) ...[
                      const Divider(height: 24),
                      InfoRow(
                        label: l10n.estimatedArrival,
                        value: driver.etaMinutes == null
                            ? '—'
                            : l10n.inMinutes(driver.etaMinutes!),
                        bold: true,
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _TrackingAction(
                    icon: Icons.call_outlined,
                    label: 'Call',
                    onPressed: () => _snack(
                      'Calling activates when the backend is connected.',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _TrackingAction(
                    icon: Icons.chat_outlined,
                    label: 'Message',
                    onPressed: () => _snack(
                      'Messaging activates when the backend is connected.',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () => Navigator.of(context).pushNamed(
                  AppRoutes.safety,
                  arguments: _ride,
                ),
                icon: const Icon(Icons.shield_outlined),
                label: const Text('Safety'),
              ),
            ),
            if (arriving) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                  ),
                  onPressed: _cancelRide,
                  child: const Text('Cancel ride'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    return parts.take(2).map((w) => w[0]).join().toUpperCase();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _TrackingAction extends StatelessWidget {
  const _TrackingAction({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 20, color: AppColors.primaryGreen),
        label: Text(label),
      ),
    );
  }
}