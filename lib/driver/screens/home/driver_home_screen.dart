import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../models/ride.dart';
import '../../../services/ride_service.dart';
import '../../models/driver.dart';
import '../../models/driver_ride.dart';
import '../../routes/driver_routes.dart';
import '../../services/driver_auth_service.dart';
import '../../services/driver_ride_service.dart';
import '../../services/driver_earnings_service.dart';
import '../../../widgets/primary_button.dart';

/// Driver home dashboard — shows map, online/offline toggle, current earnings,
/// and listens for ride requests.
class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  LatLng _currentPosition = const LatLng(-1.9441, 30.0619);
  bool _locating = true;
  bool _isOnline = false;
  DriverRide? _activeRide;
  DriverEarningsData? _earnings;
  Timer? _locationTimer;
  Timer? _earningsTimer;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _checkCurrentStatus();
    await _getLocation();
    _startLocationUpdates();
    _loadEarnings();
    _earningsTimer = Timer.periodic(const Duration(seconds: 30), (_) => _loadEarnings());
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    _earningsTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkCurrentStatus() async {
    final driver = driverAuthService.currentDriver.value;
    if (driver != null) {
      setState(() => _isOnline = driver.isOnline);
    }

    // Check for active ride
    final ride = await driverRideService.getActiveRide();
    if (mounted && ride != null) {
      setState(() => _activeRide = ride);
    }
  }

  Future<void> _getLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        final result = await Geolocator.requestPermission();
        if (result == LocationPermission.denied || result == LocationPermission.deniedForever) {
          setState(() => _locating = false);
          return;
        }
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      setState(() {
        _currentPosition = LatLng(pos.latitude, pos.longitude);
        _locating = false;
      });
    } catch (_) {
      setState(() => _locating = false);
    }
  }

  void _startLocationUpdates() {
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      if (!_isOnline) return;
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
        setState(() => _currentPosition = LatLng(pos.latitude, pos.longitude));
        await driverRideService.updateLocation(
          latitude: pos.latitude,
          longitude: pos.longitude,
        );
      } catch (_) {}
    });
  }

  Future<void> _loadEarnings() async {
    try {
      final data = await driverEarningsService.getEarningsSummary();
      if (mounted) setState(() => _earnings = data);
    } catch (_) {}
  }

  Future<void> _toggleOnline() async {
    final newStatus = _isOnline ? 'offline' : 'active';
    try {
      await driverAuthService.updateDriverStatus(newStatus);
      setState(() => _isOnline = !_isOnline);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = driverAuthService.currentDriver.value;

    return Scaffold(
      body: Stack(
        children: [
          // Map
          FlutterMap(
            options: MapOptions(
              initialCenter: _currentPosition,
              initialZoom: 14,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.femcabs.fem_cabs_driver',
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _currentPosition,
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(
                        color: _isOnline ? AppColors.primaryGreen : AppColors.secondaryText,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.white, width: 3),
                        boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 8)],
                      ),
                      child: const Icon(Icons.directions_car_filled, color: AppColors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Top bar with greeting and online toggle
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_greeting(l10n)}, ${driver?.fullName.split(' ').first ?? 'Driver'}',
                          style: const TextStyle(
                            color: AppColors.black,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (_isOnline) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: AppColors.primaryGreen,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                l10n.gpsTrackingActive,
                                style: TextStyle(
                                  color: AppColors.secondaryText,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  // Online/Offline switch
                  Switch(
                    value: _isOnline,
                    onChanged: (_) => _toggleOnline(),
                    activeColor: AppColors.primaryGreen,
                  ),
                ],
              ),
            ),
          ),

          // Bottom panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.lightBackground,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                  boxShadow: [BoxShadow(color: Color(0x26000000), blurRadius: 18, offset: Offset(0, -4))],
                ),
                child: _activeRide != null
                    ? _ActiveRidePanel(ride: _activeRide!)
                    : _DashboardPanel(earnings: _earnings, isOnline: _isOnline),
              ),
            ),
          ),

          // Loading overlay
          if (_locating)
            const Center(
              child: CircularProgressIndicator(color: AppColors.primaryGreen),
            ),
        ],
      ),
    );
  }

  String _greeting(AppLocalizations l10n) {
    final hour = DateTime.now().hour;
    if (hour < 12) return l10n.goodMorning;
    if (hour < 17) return l10n.goodAfternoon;
    return l10n.goodEvening;
  }
}

/// Dashboard panel when no active ride.
class _DashboardPanel extends StatelessWidget {
  const _DashboardPanel({required this.earnings, required this.isOnline});

  final DriverEarningsData? earnings;
  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          const SizedBox(height: 16),
          // Status text
          Text(
            isOnline ? l10n.youAreOnline : l10n.youAreOffline,
            style: TextStyle(
              color: isOnline ? AppColors.primaryGreen : AppColors.secondaryText,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isOnline ? l10n.waitingForRideRequest : l10n.goOnline,
            style: const TextStyle(color: AppColors.secondaryText, fontSize: 13),
          ),
          const SizedBox(height: 16),
          // Earnings cards
          Row(
            children: [
              _EarningsMiniCard(
                label: l10n.earningsTodayLabel,
                amount: earnings?.todayAmount ?? 0,
                rides: earnings?.todayRides ?? 0,
              ),
              const SizedBox(width: 12),
              _EarningsMiniCard(
                label: l10n.avgRating,
                amount: earnings?.rating ?? 0,
                rides: earnings?.totalTrips ?? 0,
                isRating: true,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _EarningsMiniCard(
                label: l10n.earningsWeekLabel,
                amount: earnings?.weekAmount ?? 0,
                rides: earnings?.weekRides ?? 0,
              ),
              const SizedBox(width: 12),
              _EarningsMiniCard(
                label: l10n.earningsMonthLabel,
                amount: earnings?.monthAmount ?? 0,
                rides: earnings?.monthRides ?? 0,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Panel shown when a ride is active.
class _ActiveRidePanel extends StatelessWidget {
  const _ActiveRidePanel({required this.ride});

  final DriverRide ride;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.primaryGreen.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primaryGreen),
            ),
            child: Row(
              children: [
                Icon(Icons.directions_car, color: AppColors.primaryGreen, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ride.status == 'driverAssigned' ? l10n.headToPickup : l10n.tripInProgress,
                        style: const TextStyle(
                          color: AppColors.black,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        ride.pickupAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.secondaryText, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: PrimaryButton(
              label: ride.canArrive ? l10n.markArrived : l10n.completeTrip,
              onPressed: () {
                Navigator.of(context).pushNamed(
                  DriverRoutes.activeRide,
                  arguments: ride.id,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EarningsMiniCard extends StatelessWidget {
  const _EarningsMiniCard({
    required this.label,
    required this.amount,
    required this.rides,
    this.isRating = false,
  });

  final String label;
  final double amount;
  final int rides;
  final bool isRating;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: AppColors.secondaryText, fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(
              isRating
                  ? '${amount > 0 ? amount.toStringAsFixed(1) : "—"} ★'
                  : '${amount.round().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} RWF',
              style: const TextStyle(
                color: AppColors.black,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              isRating ? '$rides trips' : '$rides rides',
              style: const TextStyle(color: AppColors.secondaryText, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
