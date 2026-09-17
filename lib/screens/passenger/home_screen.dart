import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/diagnostics/app_logger.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/ride_type.dart';
import '../../models/saved_place.dart';
import '../../services/auth_service.dart';
import '../../services/location_service.dart';
import '../../services/ride_service.dart';
import '../../services/user_service.dart';
import '../../screens/passenger/destination_screen.dart';
import '../../screens/passenger/pickup_screen.dart';
import '../../widgets/location_field.dart';
import '../../widgets/location_permission.dart';
import '../../widgets/primary_button.dart';

/// Passenger home — the main booking screen.
///
/// Layout: a solid green top banner (brand + profile), a small live map
/// preview, a "Where are you going?" card with pickup/dropoff fields, ride
/// type picker cards (private / share), and a Find Ride button.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.onOpenProfile});

  final VoidCallback? onOpenProfile;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Place? _pickup;
  Place? _destination;
  bool _locating = false;
  RideType _selectedRideType = RideType.private;

  List<SavedPlace> _savedPlaces = [];
  List<LatLng> _nearbyDrivers = const [];
  List<LatLng> _routePoints = const [];
  Timer? _nearbyTimer;

  @override
  void initState() {
    super.initState();
    _loadPlaces();
    _loadNearbyDrivers();
    _nearbyTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _loadNearbyDrivers(),
    );
    // Ask for location right away, on first open, instead of waiting for the
    // passenger to tap a location field — mirrors what most ride-hailing
    // apps do on launch.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _useCurrentLocation();
    });
  }

  @override
  void dispose() {
    _nearbyTimer?.cancel();
    super.dispose();
  }

  /// Real online drivers near the passenger's pickup point (or the map's
  /// default centre until one is set) — never a fabricated list.
  Future<void> _loadNearbyDrivers() async {
    final center = _pickup?.hasCoordinates == true ? _pickup : null;
    final lat = center?.latitude ?? MapDefaults.latitude;
    final lng = center?.longitude ?? MapDefaults.longitude;
    try {
      final drivers = await rideService.getNearbyDrivers(
        latitude: lat,
        longitude: lng,
      );
      if (!mounted) return;
      setState(() {
        _nearbyDrivers =
            drivers.map((d) => LatLng(d.latitude, d.longitude)).toList();
      });
    } catch (_) {
      // Non-critical decoration — silently keep whatever we last had.
    }
  }

  Future<void> _loadPlaces() async {
    final saved = await userService.getSavedPlaces();
    if (!mounted) return;
    setState(() => _savedPlaces = saved);
  }

  /// Fetches the real road route between the chosen places so the map can
  /// draw the actual path instead of a straight line.
  Future<void> _loadRoute() async {
    final pickup = _pickup;
    final destination = _destination;
    if (pickup == null ||
        destination == null ||
        !pickup.hasCoordinates ||
        !destination.hasCoordinates) {
      if (mounted) setState(() => _routePoints = const []);
      return;
    }
    final route = await locationService.getRoute(
      from: pickup,
      to: destination,
    );
    if (!mounted) return;
    setState(() => _routePoints = route?.points ?? const []);
  }

  Future<void> _openPickup() async {
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => PickupScreen()),
    );
    if (place != null && mounted) {
      setState(() => _pickup = place);
      _loadNearbyDrivers();
      _loadRoute();
    }
  }

  Future<void> _openDestination() async {
    if (_pickup == null) {
      await _pickupFirst();
    }
    if (!mounted || _pickup == null) return;
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => DestinationScreen(pickup: _pickup!)),
    );
    if (place != null && mounted) {
      setState(() => _destination = place);
      userService.addRecentPlace(place);
      _loadRoute();
    }
  }

  Future<void> _pickupFirst() async {
    final outcome = await ensureLocationPermission(context);
    if (!mounted) return;

    switch (outcome) {
      case LocationOutcome.granted:
        await _useCurrentLocation();
      case LocationOutcome.cancelled:
      case LocationOutcome.denied:
        await _openPickup();
      case LocationOutcome.deniedForever:
        await _showSettingsFallback();
      case LocationOutcome.servicesDisabled:
        await _showServicesDisabled();
    }
  }

  Future<void> _useCurrentLocation() async {
    final outcome = await ensureLocationPermission(context);
    if (!mounted) return;

    switch (outcome) {
      case LocationOutcome.granted:
        AppLogger.event('LOADING_STATE_START', '_locating (home)');
        setState(() => _locating = true);
        try {
          final place = await locationService.getCurrentPlace();
          if (!mounted) return;
          setState(() => _pickup = place);
          _loadNearbyDrivers();
          _loadRoute();
        } catch (error) {
          AppLogger.exception('_useCurrentLocation', error);
          if (mounted) {
            _showSnack(
              AppLocalizations.of(context).couldNotReadLocationSetManual,
            );
          }
        } finally {
          AppLogger.event('LOADING_STATE_END', '_locating (home)');
          if (mounted) setState(() => _locating = false);
        }
      case LocationOutcome.cancelled:
      case LocationOutcome.denied:
        _showSnack(AppLocalizations.of(context).locationNotGranted);
      case LocationOutcome.deniedForever:
        await _showSettingsFallback();
      case LocationOutcome.servicesDisabled:
        await _showServicesDisabled();
    }
  }

  void _selectSavedPlace(SavedPlace place) {
    setState(() => _destination = place.place);
    userService.addRecentPlace(place.place);
    _loadRoute();
  }

  Future<void> _findRide() async {
    final l10n = AppLocalizations.of(context);
    if (_pickup == null || _destination == null) {
      _showSnack(l10n.selectDestinationFirst);
      return;
    }
    await Navigator.of(context).pushNamed(
      AppRoutes.vehicleSelection,
      arguments: (_pickup!, _destination!, _selectedRideType),
    );
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _showSettingsFallback() async {
    final l10n = AppLocalizations.of(context);
    final openSettings = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(
          l10n.locationPermissionOffTitle,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        content: Text(
          l10n.manualEntryFallback,
          style: const TextStyle(color: AppColors.secondaryText, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.manualEntry),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.openSettings),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (openSettings == true) {
      await locationService.openSettings();
    } else {
      await _openPickup();
    }
  }

  Future<void> _showServicesDisabled() async {
    final l10n = AppLocalizations.of(context);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: Text(
          l10n.locationServicesOffTitle,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        content: Text(
          l10n.turnOnLocationServices,
          style: const TextStyle(color: AppColors.secondaryText, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.setManually),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop();
              locationService.openSettings();
            },
            child: Text(l10n.turnOn),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TopBanner(onOpenProfile: widget.onOpenProfile),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      height: 180,
                      child: Stack(
                        children: [
                          _HomeMap(
                            pickup: _pickup,
                            destination: _destination,
                            nearbyDrivers: _nearbyDrivers,
                            route: _routePoints,
                          ),
                          Positioned(
                            right: 10,
                            bottom: 10,
                            child: FloatingActionButton.small(
                              heroTag: 'recenter-home-map',
                              backgroundColor: AppColors.white,
                              foregroundColor: AppColors.primaryGreen,
                              onPressed: _useCurrentLocation,
                              child: const Icon(Icons.my_location),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _BookingCard(
                    pickup: _pickup,
                    destination: _destination,
                    savedPlaces: _savedPlaces,
                    onSavedSelect: _selectSavedPlace,
                    locating: _locating,
                    onPickupTap: _openPickup,
                    onDestinationTap: _openDestination,
                  ),
                  const SizedBox(height: 20),
                  _RideOptionCard(
                    rideType: RideType.private,
                    selected: _selectedRideType == RideType.private,
                    onTap: () =>
                        setState(() => _selectedRideType = RideType.private),
                  ),
                  const SizedBox(height: 12),
                  _RideOptionCard(
                    rideType: RideType.shared,
                    selected: _selectedRideType == RideType.shared,
                    onTap: () =>
                        setState(() => _selectedRideType = RideType.shared),
                  ),
                  const SizedBox(height: 20),
                  PrimaryButton(
                    label: l10n.findRide,
                    icon: Icons.arrow_forward,
                    onPressed: _findRide,
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

class _TopBanner extends StatelessWidget {
  const _TopBanner({this.onOpenProfile});

  final VoidCallback? onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final dev = authService.isDevPreview;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryGreen, AppColors.darkGreen],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              'F',
              style: TextStyle(
                color: AppColors.primaryGreen,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  AppConstants.appName,
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
                Text(
                  AppConstants.tagline,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.9),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (dev) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      AppLocalizations.of(context).previewBuild,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 10.5,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Material(
            color: AppColors.white.withValues(alpha: 0.18),
            shape: const CircleBorder(),
            child: InkWell(
              onTap: onOpenProfile,
              customBorder: const CircleBorder(),
              child: const Padding(
                padding: EdgeInsets.all(10),
                child: Icon(
                  Icons.person_outline,
                  color: AppColors.white,
                  size: 22,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeMap extends StatefulWidget {
  const _HomeMap({
    this.pickup,
    this.destination,
    this.nearbyDrivers = const [],
    this.route = const [],
  });

  final Place? pickup;
  final Place? destination;

  /// Real online drivers near the pickup point — empty (not fabricated)
  /// until the backend actually reports one nearby.
  final List<LatLng> nearbyDrivers;

  /// The road path between pickup and destination (computed by the routing
  /// service), drawn as a polyline.
  final List<LatLng> route;

  @override
  State<_HomeMap> createState() => _HomeMapState();
}

class _HomeMapState extends State<_HomeMap> {
  final MapController _mapController = MapController();
  LatLngBounds? _fittedBounds;

  @override
  void didUpdateWidget(covariant _HomeMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _fitToRoute();
  }

  /// Points that determine the visible area: the full drawn route when
  /// available, otherwise the markers.
  List<LatLng>? _routeCoordinates() {
    if (widget.route.length > 1) return widget.route;
    final pickup = widget.pickup;
    final destination = widget.destination;
    if (pickup != null &&
        pickup.hasCoordinates &&
        destination != null &&
        destination.hasCoordinates) {
      return [
        LatLng(pickup.latitude!, pickup.longitude!),
        LatLng(destination.latitude!, destination.longitude!),
      ];
    }
    if (pickup != null && pickup.hasCoordinates) {
      return [LatLng(pickup.latitude!, pickup.longitude!)];
    }
    return null;
  }

  bool _sameBounds(LatLngBounds a, LatLngBounds? b) =>
      b != null &&
      a.north == b.north &&
      a.south == b.south &&
      a.east == b.east &&
      a.west == b.west;

  void _fitToRoute() {
    final coords = _routeCoordinates();
    if (coords == null) return;
    final bounds = LatLngBounds.fromPoints(coords);
    if (_sameBounds(bounds, _fittedBounds)) return;
    _fittedBounds = bounds;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.fitCamera(
        CameraFit.bounds(
          bounds: bounds,
          padding: const EdgeInsets.fromLTRB(30, 30, 30, 30),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final pickLatLng = widget.pickup?.hasCoordinates == true
        ? LatLng(widget.pickup!.latitude!, widget.pickup!.longitude!)
        : null;
    final destLatLng = widget.destination?.hasCoordinates == true
        ? LatLng(widget.destination!.latitude!, widget.destination!.longitude!)
        : null;
    final center =
        pickLatLng ?? LatLng(MapDefaults.latitude, MapDefaults.longitude);
    final fitCoords = _routeCoordinates();

    return IgnorePointer(
      child: FlutterMap(
        mapController: _mapController,
        options: MapOptions(
          initialCenter: center,
          initialZoom: MapDefaults.zoom,
          interactionOptions: const InteractionOptions(
            flags: InteractiveFlag.none,
          ),
          initialCameraFit: fitCoords != null
              ? CameraFit.bounds(
                  bounds: LatLngBounds.fromPoints(fitCoords),
                  padding: const EdgeInsets.fromLTRB(30, 30, 30, 30),
                )
              : null,
          onMapReady: () => AppLogger.event('MAP_INITIALIZED', 'home map'),
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.femcabs.fem_cabs',
          ),
          if (widget.route.length > 1)
            PolylineLayer(
              polylines: [
                Polyline(
                  points: widget.route,
                  strokeWidth: 5,
                  color: AppColors.primaryGreen,
                  borderStrokeWidth: 2,
                  borderColor: const Color(0x33000000),
                ),
              ],
            ),
          MarkerLayer(
            markers: [
              if (pickLatLng != null)
                Marker(
                  point: pickLatLng,
                  width: 38,
                  height: 38,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.primaryGreen,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.white, width: 3),
                      boxShadow: const [
                        BoxShadow(color: Color(0x40000000), blurRadius: 8),
                      ],
                    ),
                    child: const Icon(
                      Icons.person,
                      color: AppColors.white,
                      size: 18,
                    ),
                  ),
                ),
              if (destLatLng != null)
                Marker(
                  point: destLatLng,
                  width: 34,
                  height: 34,
                  child: const _DestinationPin(),
                ),
              ...widget.nearbyDrivers.map(
                (point) => Marker(
                  point: point,
                  width: 26,
                  height: 26,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.primaryGreen),
                      boxShadow: const [
                        BoxShadow(color: Color(0x26000000), blurRadius: 5),
                      ],
                    ),
                    child: const Icon(
                      Icons.local_taxi,
                      size: 14,
                      color: AppColors.primaryGreen,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DestinationPin extends StatelessWidget {
  const _DestinationPin();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.error,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.white, width: 3),
        boxShadow: const [
          BoxShadow(color: Color(0x40000000), blurRadius: 8),
        ],
      ),
      child: const Icon(Icons.place, color: AppColors.white, size: 18),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({
    required this.pickup,
    required this.destination,
    required this.savedPlaces,
    required this.onSavedSelect,
    required this.locating,
    required this.onPickupTap,
    required this.onDestinationTap,
  });

  final Place? pickup;
  final Place? destination;
  final List<SavedPlace> savedPlaces;
  final ValueChanged<SavedPlace> onSavedSelect;
  final bool locating;
  final VoidCallback onPickupTap;
  final VoidCallback onDestinationTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: AppShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.location_on_outlined,
                color: AppColors.black,
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.whereGoing,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LocationField(
            label: l10n.pickup,
            value: pickup,
            isPickup: true,
            onTap: onPickupTap,
          ),
          const SizedBox(height: 10),
          LocationField(
            label: l10n.destination,
            value: destination,
            onTap: onDestinationTap,
          ),
          const SizedBox(height: 10),
          if (locating)
            Row(
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primaryGreen,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  l10n.findingLocation,
                  style: const TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          if (savedPlaces.isNotEmpty) ...[
            const SizedBox(height: 4),
            _SavedPlacesRow(places: savedPlaces, onSelect: onSavedSelect),
          ],
        ],
      ),
    );
  }
}

class _SavedPlacesRow extends StatelessWidget {
  const _SavedPlacesRow({required this.places, required this.onSelect});

  final List<SavedPlace> places;
  final ValueChanged<SavedPlace> onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: places
            .map(
              (place) => Padding(
                padding: const EdgeInsets.only(right: 10),
                child:
                    _SavedPlaceChip(place: place, onTap: () => onSelect(place)),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _SavedPlaceChip extends StatelessWidget {
  const _SavedPlaceChip({required this.place, required this.onTap});

  final SavedPlace place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                place.type == SavedPlaceType.home
                    ? Icons.home_outlined
                    : place.type == SavedPlaceType.work
                        ? Icons.business_outlined
                        : Icons.star_outline,
                color: AppColors.primaryGreen,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                place.name,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ride type picker card matching the "Private Ride" / "Share Ride" style —
/// icon circle, title + subtitle, feature row, and a selection indicator.
class _RideOptionCard extends StatelessWidget {
  const _RideOptionCard({
    required this.rideType,
    required this.selected,
    required this.onTap,
  });

  final RideType rideType;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isShared = rideType == RideType.shared;
    final icon = isShared ? Icons.groups_outlined : Icons.directions_car;
    final title = isShared ? l10n.shareRide : l10n.privateRide;
    final subtitle =
        isShared ? l10n.shareRideDescription : l10n.privateRideDescription;

    return Material(
      color: selected
          ? AppColors.primaryGreen.withValues(alpha: 0.06)
          : AppColors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
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
                    width: 46,
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primaryGreen.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: AppColors.darkGreen, size: 22),
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
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
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
                    size: 24,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(
                    Icons.person_outline,
                    size: 16,
                    color: AppColors.secondaryText,
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    '1-4',
                    style: TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Icon(
                    isShared
                      ? Icons.event_seat_outlined
                        : Icons.directions_car_filled_outlined,
                    size: 16,
                    color: AppColors.secondaryText,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    isShared ? l10n.comfortable : l10n.sedanSuv,
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Icon(
                    isShared ? Icons.eco_outlined : Icons.verified_user_outlined,
                    size: 16,
                    color: AppColors.secondaryText,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      isShared ? l10n.ecoFriendly : l10n.safeReliable,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
