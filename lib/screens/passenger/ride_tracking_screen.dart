import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, HapticFeedback;
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../services/ride_service.dart';
import '../../widgets/info_row.dart';
import '../../widgets/trip_route_card.dart';
import 'destination_screen.dart';

/// Live ride tracking (steps 19 & 20).
///
/// Responds to the ride status delivered by the backend:
///  * `driverArriving`  -> "Your driver is on the way" + vehicle/ETA
///  * `driverArrived`   -> the ride PIN to show your driver
///  * `pinVerified`/`inProgress` -> "You're on your way" + safety access
///  * `arrived`/`paymentPending` -> move to the ride summary/payment screen
///
/// The map renders real coordinates (pickup, destination and the live driver
/// position streamed by the backend); a typed-only ride shows an honest
/// placeholder instead of a fake map.
class RideTrackingScreen extends StatefulWidget {
  const RideTrackingScreen({super.key, required this.ride});

  final Ride ride;

  @override
  State<RideTrackingScreen> createState() => _RideTrackingScreenState();
}

class _RideTrackingScreenState extends State<RideTrackingScreen> {
  late Ride _ride = widget.ride;
  bool _changingDestination = false;
  List<RideCompanion> _companions = const [];

  @override
  void initState() {
    super.initState();
    rideService
        .subscribeToRide(_ride.id)
        .listen(_onUpdate, onError: (Object _) {});
    if (_ride.isPooled) _loadCompanions();
  }

  Future<void> _loadCompanions() async {
    try {
      final companions = await rideService.getRideCompanions(_ride.id);
      if (!mounted) return;
      setState(() => _companions = companions);
    } catch (_) {
      // Non-critical — the pooled badge still shows without the names.
    }
  }

  @override
  void dispose() {
    super.dispose();
  }

  void _onUpdate(Ride ride) {
    if (!mounted) return;
    final wasPooled = _ride.isPooled;
    final statusChanged = ride.status != _ride.status;
    setState(() => _ride = ride);
    if (ride.isPooled && (!wasPooled || statusChanged)) {
      _loadCompanions();
    }
    if (ride.status == RideStatus.arrived ||
        ride.status == RideStatus.paymentPending ||
        ride.status == RideStatus.completed) {
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

  Future<void> _changeDestination() async {
    final l10n = AppLocalizations.of(context);
    final result = await Navigator.of(context).push<Place>(
      MaterialPageRoute(
        builder: (_) => DestinationScreen(pickup: _ride.pickup),
      ),
    );
    if (result == null || !mounted) return;
    setState(() => _changingDestination = true);
    try {
      final updated = await rideService.changeDestination(_ride.id, result);
      if (!mounted) return;
      setState(() => _ride = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.destinationChanged)),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.destinationChangeFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _changingDestination = false);
    }
  }

  Future<void> _callDriver() async {
    final phone = _ride.driver?.phone ?? '';
    if (phone.trim().isEmpty) {
      _snack('No driver phone number is available for this ride.');
      return;
    }
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s+'), ''));
    await _launch(uri);
  }

  Future<void> _copyDriverPhone() async {
    final phone = _ride.driver?.phone ?? '';
    if (phone.trim().isEmpty) {
      _snack('No driver phone number is available for this ride.');
      return;
    }
    await Clipboard.setData(ClipboardData(text: phone));
    if (!mounted) return;
    HapticFeedback.mediumImpact();
    _snack('Driver number copied to clipboard.');
  }

  Future<void> _launch(Uri uri) async {
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _snack('Could not open this action on your device.');
      }
    } catch (_) {
      if (mounted) _snack('Could not open this action on your device.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final RideStatus status = _ride.status;
    final arriving = status == RideStatus.driverArriving;
    final driverArrived = status == RideStatus.driverArrived;
    final driver = _ride.driver;
    final beforePickup = arriving || driverArrived;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text(
          driverArrived
              ? l10n.driverArrived
              : arriving
                  ? l10n.driverOnWay
                  : l10n.tripInProgress,
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              driverArrived
                  ? l10n.driverArrived
                  : arriving
                      ? l10n.driverOnWay
                      : l10n.yourOnWay,
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            _mapPane(l10n),
            if (_ride.isPooled) ...[
              const SizedBox(height: 12),
              _PooledRideBanner(companions: _companions),
            ],
            if (driverArrived && _ride.pin != null) ...[
              const SizedBox(height: 16),
              _RidePinCard(pin: _ride.pin!),
            ],
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
                    label: l10n.call,
                    onPressed: driver == null
                        ? () => _snack('No driver assigned yet.')
                        : _callDriver,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _TrackingAction(
                    icon: Icons.chat_outlined,
                    label: l10n.message,
                    onPressed: driver == null
                        ? () => _snack('No driver assigned yet.')
                        : _copyDriverPhone,
                  ),
                ),
              ],
            ),
            if (beforePickup) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _changingDestination ? null : _changeDestination,
                  icon: const Icon(Icons.edit_location_alt_outlined),
                  label: Text(l10n.changeDestination),
                ),
              ),
            ],
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
                label: Text(l10n.safety),
              ),
            ),
            if (beforePickup) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                  ),
                  onPressed: _cancelRide,
                  child: Text(l10n.cancelRide),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Realtime map when coordinates are known; an honest placeholder when the
  /// ride was typed without coordinates.
  Widget _mapPane(AppLocalizations l10n) {
    final pickup = _ride.pickup;
    final destination = _ride.destination;
    final driver = _ride.driver;

    if (!pickup.hasCoordinates || !destination.hasCoordinates) {
      return Container(
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
              children: [
                Icon(
                  Icons.map_outlined,
                  color: AppColors.secondaryText,
                  size: 32,
                ),
                const SizedBox(height: 8),
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
      );
    }

    final pickupPoint = LatLng(pickup.latitude!, pickup.longitude!);
    final destinationPoint = LatLng(
      destination.latitude!,
      destination.longitude!,
    );
    final driverPoint = driver?.latitude != null && driver?.longitude != null
        ? LatLng(driver!.latitude!, driver.longitude!)
        : null;

    final markers = <Marker>[
      Marker(
        point: pickupPoint,
        width: 40,
        height: 40,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.primaryGreen,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.white, width: 3),
            boxShadow: const [
              BoxShadow(color: Color(0x40000000), blurRadius: 8),
            ],
          ),
          child: const Icon(Icons.person, color: AppColors.white, size: 20),
        ),
      ),
      Marker(
        point: destinationPoint,
        width: 40,
        height: 40,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.darkGreen,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.white, width: 3),
            boxShadow: const [
              BoxShadow(color: Color(0x40000000), blurRadius: 8),
            ],
          ),
          child: const Icon(Icons.square_foot, color: AppColors.white, size: 20),
        ),
      ),
      if (driverPoint != null)
        Marker(
          point: driverPoint,
          width: 40,
          height: 40,
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.black,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.white, width: 3),
              boxShadow: const [
                BoxShadow(color: Color(0x40000000), blurRadius: 8),
              ],
            ),
            child: const Icon(
              Icons.directions_car_filled,
              color: AppColors.white,
              size: 20,
            ),
          ),
        ),
    ];

    final all = [
      pickupPoint,
      destinationPoint,
      ?driverPoint,
    ];
    var latMin = all.map((p) => p.latitude).reduce((a, b) => a < b ? a : b);
    var latMax = all.map((p) => p.latitude).reduce((a, b) => a > b ? a : b);
    var lngMin = all.map((p) => p.longitude).reduce((a, b) => a < b ? a : b);
    var lngMax = all.map((p) => p.longitude).reduce((a, b) => a > b ? a : b);
    final center = LatLng((latMin + latMax) / 2, (lngMin + lngMax) / 2);
    final latSpan =
        (latMax - latMin).abs() < 0.001 ? 0.0015 : (latMax - latMin) * 1.3;
    final lngSpan =
        (lngMax - lngMin).abs() < 0.001 ? 0.0015 : (lngMax - lngMin) * 1.3;

    final zoom = latSpan > 0.09 || lngSpan > 0.09
        ? 12.0
        : latSpan > 0.02 || lngSpan > 0.02
            ? 13.5
            : 15.5;

    return Container(
      height: 220,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: FlutterMap(
        options: MapOptions(
          initialCenter: center,
          initialZoom: zoom,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.femcabs.fem_cabs',
          ),
          MarkerLayer(markers: markers),
        ],
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

/// Big, obvious ride PIN to show the driver at pickup.
class _RidePinCard extends StatelessWidget {
  const _RidePinCard({required this.pin});

  final String pin;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primaryGreen),
      ),
      child: Column(
        children: [
          Text(
            l10n.showPinToDriver,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.black,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            pin,
            style: const TextStyle(
              color: AppColors.primaryGreen,
              fontSize: 44,
              fontWeight: FontWeight.w900,
              letterSpacing: 10,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.pinHint,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.secondaryText,
              fontSize: 12.5,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// Tells the passenger their shared ride is actually pooled with someone
/// else in the same vehicle right now (real pooling, not just a discount).
class _PooledRideBanner extends StatelessWidget {
  const _PooledRideBanner({required this.companions});

  final List<RideCompanion> companions;

  @override
  Widget build(BuildContext context) {
    final names = companions.map((c) => c.firstName).join(', ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primaryGreen.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.groups_outlined, color: AppColors.primaryGreen, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              names.isEmpty
                  ? "You're sharing this ride with another passenger."
                  : "You're sharing this ride with $names.",
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
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