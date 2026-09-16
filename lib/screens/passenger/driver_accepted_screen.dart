import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, HapticFeedback;
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../services/ride_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/trip_route_card.dart';

/// Shown when a real driver from the backend accepts the ride (step 18).
///
/// Driver details are displayed only when the backend provides them. Without
/// a real driver, a waiting state is shown — no fake drivers. This screen
/// stays subscribed to the ride so it automatically moves to live tracking /
/// the PIN / the summary as the ride progresses.
class DriverAcceptedScreen extends StatefulWidget {
  const DriverAcceptedScreen({super.key, required this.ride});

  final Ride ride;

  @override
  State<DriverAcceptedScreen> createState() => _DriverAcceptedScreenState();
}

class _DriverAcceptedScreenState extends State<DriverAcceptedScreen> {
  StreamSubscription<Ride>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = rideService.subscribeToRide(widget.ride.id).listen(
      _onRideUpdate,
    );
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  void _onRideUpdate(Ride ride) {
    if (!mounted) return;

    void go(String route) {
      Navigator.of(context).pushReplacementNamed(route, arguments: ride);
    }

    switch (ride.status) {
      case RideStatus.driverAssigned:
      case RideStatus.scheduled:
      case RideStatus.searchingDriver:
        return; // not moving yet
      case RideStatus.driverArriving:
      case RideStatus.driverArrived:
      case RideStatus.pinVerified:
      case RideStatus.inProgress:
        go(AppRoutes.rideTracking);
      case RideStatus.arrived:
      case RideStatus.paymentPending:
      case RideStatus.completed:
        go(AppRoutes.rideCompleted);
      case RideStatus.cancelled:
        Navigator.of(context)
            .pushNamedAndRemoveUntil(AppRoutes.home, (route) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final ride = widget.ride;
    final driver = ride.driver;

    if (driver == null) {
      return Scaffold(
        backgroundColor: AppColors.lightBackground,
        appBar: AppBar(title: Text(l10n.driverFound)),
        body: SafeArea(
          child: EmptyState(
            icon: Icons.directions_car_outlined,
            title: l10n.waitingDriver,
            subtitle: l10n.driverDetailsPending,
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.driverOnWay)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TripRouteCard(
              pickup: ride.pickup,
              destination: ride.destination,
              distanceKm: ride.distanceKm,
              durationMinutes: ride.durationMinutes,
            ),
            if (ride.isPooled) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.primaryGreen.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppColors.primaryGreen.withValues(alpha: 0.4),
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.groups_outlined,
                        color: AppColors.primaryGreen, size: 22),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "You're sharing this ride with another passenger.",
                        style: TextStyle(
                          color: AppColors.black,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor:
                        AppColors.primaryGreen.withValues(alpha: 0.12),
                    child: Text(
                      _initials(driver.name),
                      style: const TextStyle(
                        color: AppColors.primaryGreen,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          driver.name,
                          style: const TextStyle(
                            color: AppColors.black,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(
                              Icons.star,
                              size: 16,
                              color: Color(0xFFF59E0B),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              driver.rating.toStringAsFixed(1),
                              style: const TextStyle(
                                color: AppColors.black,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              '${driver.vehicleModel} · ${driver.vehicleColor}',
                              style: const TextStyle(
                                color: AppColors.secondaryText,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${l10n.licensePlate}${driver.licensePlate}',
                          style: const TextStyle(
                            color: AppColors.secondaryText,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    icon: Icons.call_outlined,
                    label: l10n.call,
                    onPressed: () => _callDriver(driver.phone),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _ActionButton(
                    icon: Icons.chat_outlined,
                    label: l10n.message,
                    onPressed: () => _copyPhone(driver.phone),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error,
                  side: const BorderSide(color: AppColors.error),
                ),
                onPressed: () => _cancelRide(context),
                child: Text(l10n.cancelRide),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _callDriver(String phone) async {
    if (phone.trim().isEmpty) {
      _snack(context, 'No driver phone number is available for this ride.');
      return;
    }
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s+'), ''));
    await _launch(uri);
  }

  Future<void> _copyPhone(String phone) async {
    if (phone.trim().isEmpty) {
      _snack(context, 'No driver phone number is available for this ride.');
      return;
    }
    await Clipboard.setData(ClipboardData(text: phone));
    if (!mounted) return;
    HapticFeedback.mediumImpact();
    _snack(context, 'Driver number copied to clipboard.');
  }

  Future<void> _launch(Uri uri) async {
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _snack(context, 'Could not open this action on your device.');
      }
    } catch (_) {
      if (mounted) _snack(context, 'Could not open this action on your device.');
    }
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    return parts.take(2).map((w) => w[0]).join().toUpperCase();
  }

  Future<void> _cancelRide(BuildContext context) async {
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
    if (ok != true || !context.mounted) return;
    await rideService.cancelRide(widget.ride.id);
    if (!context.mounted) return;
    Navigator.of(context)
        .pushNamedAndRemoveUntil(AppRoutes.home, (route) => false);
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
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