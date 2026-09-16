import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../models/ride.dart';
import '../../../services/ride_service.dart';
import '../../../widgets/primary_button.dart';
import '../../models/driver_ride.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_ride_service.dart';

/// Active ride screen for the driver.
/// Handles the full ride lifecycle: navigation to pickup, arrival, PIN entry,
/// active trip, and completion.
class DriverActiveRideScreen extends StatefulWidget {
  const DriverActiveRideScreen({super.key, this.rideId});

  final String? rideId;

  @override
  State<DriverActiveRideScreen> createState() => _DriverActiveRideScreenState();
}

class _DriverActiveRideScreenState extends State<DriverActiveRideScreen> {
  DriverRide? _ride;
  StreamSubscription<DriverRide>? _subscription;
  final _pinController = TextEditingController();
  bool _loading = false;
  bool _pinError = false;

  @override
  void initState() {
    super.initState();
    _loadRide();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _loadRide() async {
    try {
      final ride = await driverRideService.getActiveRide();
      if (mounted) {
        setState(() => _ride = ride);
        if (ride != null) _subscribeToRide(ride.id);
      }
    } catch (_) {}
  }

  void _subscribeToRide(String rideId) {
    _subscription?.cancel();
    _subscription = driverRideService.subscribeToRide(rideId).listen(
      (ride) {
        if (!mounted) return;
        setState(() => _ride = ride);
        if (ride.status == 'completed' || ride.status == 'cancelled') {
          Navigator.of(context).pushNamedAndRemoveUntil(
            DriverRoutes.home,
            (route) => false,
          );
        }
      },
      onError: (_) {},
    );
  }

  Future<void> _markArrived() async {
    if (_ride == null || _loading) return;
    setState(() => _loading = true);
    try {
      final pin = await driverRideService.markArrived(_ride!.id);
      if (!mounted) return;
      setState(() => _loading = false);
      // The ride will update via subscription to driverArrived status
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Future<void> _verifyPin() async {
    if (_ride == null || _loading) return;
    final pin = _pinController.text.trim();
    if (pin.isEmpty) {
      setState(() => _pinError = true);
      return;
    }

    setState(() {
      _loading = true;
      _pinError = false;
    });

    try {
      await driverRideService.verifyPin(_ride!.id, pin);
      if (!mounted) return;
      setState(() => _loading = false);
      // Trip will update via subscription to inProgress status
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _pinError = true;
        });
      }
    }
  }

  Future<void> _completeTrip() async {
    if (_ride == null || _loading) return;
    setState(() => _loading = true);
    try {
      await driverRideService.completeTrip(_ride!.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).rideCompleted)),
      );
      Navigator.of(context).pushNamedAndRemoveUntil(
        DriverRoutes.home,
        (route) => false,
      );
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Future<void> _callPassenger() async {
    final phone = _ride?.passengerPhone ?? '';
    if (phone.trim().isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s+'), ''));
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  Future<void> _cancelRide() async {
    if (_ride == null) return;
    final l10n = AppLocalizations.of(context);
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => _CancelDialog(),
    );
    if (reason != null && mounted) {
      try {
        await driverRideService.cancelRide(_ride!.id, reason: reason);
        if (mounted) {
          Navigator.of(context).pushNamedAndRemoveUntil(
            DriverRoutes.home,
            (route) => false,
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString())),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final ride = _ride;
    if (ride == null) return const SizedBox();

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text(l10n.activeRide),
        automaticallyImplyLeading: false,
      ),
      body: ride == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Map
                if (ride.pickupLatitude != 0) ...[
                  _RideMap(ride: ride),
                  const SizedBox(height: 16),
                ],
                // Status badge
                _StatusBadge(status: ride.status),
                const SizedBox(height: 16),
                // Pickup & destination info
                _LocationCard(
                  pickup: ride.pickupAddress,
                  destination: ride.destAddress,
                  distance: ride.distanceKm,
                  duration: ride.durationMinutes,
                ),
                const SizedBox(height: 16),
                // Action based on ride status
                if (ride.canArrive) ...[
                  SizedBox(
                    width: double.infinity,
                    child: PrimaryButton(
                      label: l10n.markArrived,
                      loading: _loading,
                      onPressed: _loading ? null : _markArrived,
                    ),
                  ),
                ] else if (ride.canCompletePin) ...[
                  _PinEntry(
                    controller: _pinController,
                    hasError: _pinError,
                    loading: _loading,
                    onVerify: _verifyPin,
                  ),
                ] else if (ride.status == 'inProgress' || ride.status == 'pinVerified') ...[
                  SizedBox(
                    width: double.infinity,
                    child: PrimaryButton(
                      label: l10n.completeTrip,
                      loading: _loading,
                      onPressed: _loading ? null : _completeTrip,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                // Contact & cancel
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _callPassenger,
                        icon: const Icon(Icons.call_outlined, size: 20),
                        label: Text(l10n.call),
                      ),
                    ),
                    const SizedBox(width: 12),
                    if (ride.canCancel)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _cancelRide,
                          icon: const Icon(Icons.cancel_outlined, size: 20, color: AppColors.error),
                          label: Text(l10n.cancelRide, style: TextStyle(color: AppColors.error)),
                          style: OutlinedButton.styleFrom(side: BorderSide(color: AppColors.error)),
                        ),
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}

class _RideMap extends StatelessWidget {
  const _RideMap({required this.ride});
  final DriverRide ride;

  @override
  Widget build(BuildContext context) {
    final pickup = LatLng(ride.pickupLatitude, ride.pickupLongitude);
    final dest = LatLng(ride.destLatitude, ride.destLongitude);
    final center = LatLng(
      (pickup.latitude + dest.latitude) / 2,
      (pickup.longitude + dest.longitude) / 2,
    );

    return Container(
      height: 180,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: FlutterMap(
        options: MapOptions(initialCenter: center, initialZoom: 13),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.femcabs.fem_cabs_driver',
          ),
          MarkerLayer(markers: [
            Marker(
              point: pickup,
              width: 36, height: 36,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.white, width: 2),
                ),
                child: const Icon(Icons.person, color: AppColors.white, size: 18),
              ),
            ),
            Marker(
              point: dest,
              width: 36, height: 36,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.error,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.white, width: 2),
                ),
                child: const Icon(Icons.place, color: AppColors.white, size: 18),
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'driverAssigned' => ('Assigned', AppColors.primaryGreen),
      'driverArriving' => ('Heading to pickup', AppColors.primaryGreen),
      'driverArrived' => ('Arrived at pickup', Color(0xFFF59E0B)),
      'pinVerified' => ('PIN verified', AppColors.primaryGreen),
      'inProgress' => ('In progress', AppColors.primaryGreen),
      'arrived' => ('Arrived at destination', Color(0xFFF59E0B)),
      'paymentPending' => ('Awaiting payment', AppColors.secondaryText),
      _ => (status, AppColors.secondaryText),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({
    required this.pickup,
    required this.destination,
    required this.distance,
    required this.duration,
  });

  final String pickup;
  final String destination;
  final double distance;
  final int duration;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(color: AppColors.primaryGreen, shape: BoxShape.circle),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(pickup, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              const SizedBox(width: 22),
              Container(width: 1, height: 20, color: AppColors.border),
            ]),
          ),
          Row(
            children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(destination, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _InfoChip(icon: Icons.straighten, label: '${distance.toStringAsFixed(1)} km'),
              _InfoChip(icon: Icons.schedule, label: '$duration min'),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.secondaryText),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(color: AppColors.secondaryText, fontSize: 13)),
      ],
    );
  }
}

class _PinEntry extends StatelessWidget {
  const _PinEntry({
    required this.controller,
    required this.hasError,
    required this.loading,
    required this.onVerify,
  });

  final TextEditingController controller;
  final bool hasError;
  final bool loading;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primaryGreen),
      ),
      child: Column(
        children: [
          Text(l10n.enterRidePin, style: const TextStyle(
            color: AppColors.black, fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(l10n.passengerWillShowPin, style: const TextStyle(
            color: AppColors.secondaryText, fontSize: 12)),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            textAlign: TextAlign.center,
            keyboardType: TextInputType.number,
            maxLength: 4,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 8),
            decoration: InputDecoration(
              counterText: '',
              hintText: '••••',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: hasError ? AppColors.error : AppColors.primaryGreen, width: 2),
              ),
              errorText: hasError ? 'Incorrect PIN' : null,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: PrimaryButton(
              label: l10n.verify,
              loading: loading,
              onPressed: loading ? null : onVerify,
            ),
          ),
        ],
      ),
    );
  }
}

class _CancelDialog extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final reasons = [
      'Passenger unreachable',
      'Unsafe pickup location',
      'Wrong location',
      'Vehicle issue',
      'Emergency',
      'Other',
    ];

    return AlertDialog(
      backgroundColor: AppColors.white,
      title: const Text('Cancel ride', style: TextStyle(fontWeight: FontWeight.w800)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: reasons.map((r) => ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(r, style: const TextStyle(fontSize: 14)),
          onTap: () => Navigator.of(context).pop(r),
        )).toList(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Keep ride'),
        ),
      ],
    );
  }
}
