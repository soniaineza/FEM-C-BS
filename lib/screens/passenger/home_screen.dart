import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/place.dart';
import '../../models/saved_place.dart';
import '../../services/auth_service.dart';
import '../../services/location_service.dart';
import '../../services/user_service.dart';
import '../../widgets/location_field.dart';
import '../../widgets/location_permission.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/section_title.dart';

/// Passenger home — the main booking screen.
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

  List<Place> _recentPlaces = [];
  List<SavedPlace> _savedPlaces = [];

  @override
  void initState() {
    super.initState();
    _loadPlaces();
  }

  Future<void> _loadPlaces() async {
    final recent = await userService.getRecentPlaces();
    final saved = await userService.getSavedPlaces();
    if (!mounted) return;
    setState(() {
      _recentPlaces = recent;
      _savedPlaces = saved;
    });
  }

  Future<void> _openPickup() async {
    final place = await Navigator.of(context).pushNamed<Place>(
      AppRoutes.pickup,
    );
    if (place != null && mounted) setState(() => _pickup = place);
  }

  Future<void> _openDestination() async {
    if (_pickup == null) {
      await _pickupFirst();
    }
    if (!mounted || _pickup == null) return;
    final place = await Navigator.of(context).pushNamed<Place>(
      AppRoutes.destination,
      arguments: _pickup,
    );
    if (place != null && mounted) {
      setState(() => _destination = place);
      userService.addRecentPlace(place);
      await _openRideOptions(place);
    }
  }

  Future<void> _openRideOptions(Place destination) async {
    if (_pickup == null || !mounted) return;
    await Navigator.of(context).pushNamed(
      AppRoutes.vehicleSelection,
      arguments: (_pickup!, destination),
    );
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
        setState(() => _locating = true);
        try {
          final place = await locationService.getCurrentPlace();
          if (!mounted) return;
          setState(() => _pickup = place);
        } catch (_) {
          if (mounted) {
            _showSnack(
              'We could not read your location. Set your pickup manually.',
            );
          }
        } finally {
          if (mounted) setState(() => _locating = false);
        }
      case LocationOutcome.cancelled:
      case LocationOutcome.denied:
        _showSnack('Location was not granted. You can set your pickup manually.');
      case LocationOutcome.deniedForever:
        await _showSettingsFallback();
      case LocationOutcome.servicesDisabled:
        await _showServicesDisabled();
    }
  }

  Future<void> _bookRide() async {
    if (_pickup == null || _destination == null) return;
    await Navigator.of(context).pushNamed(
      AppRoutes.vehicleSelection,
      arguments: (_pickup!, _destination!),
    );
  }

  void _selectDestination(Place place) {
    setState(() => _destination = place);
    userService.addRecentPlace(place);
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _showSettingsFallback() async {
    final openSettings = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: const Text('Location permission is off',
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text(
          'You can still book by entering your pickup point manually. '
          'To allow automatic pickup, turn on location permission in settings.',
          style: TextStyle(color: AppColors.secondaryText, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Manual entry'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Open settings'),
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
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.white,
        title: const Text('Location services are off',
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text(
          'Turn on location services to use automatic pickup, or enter your '
          'pickup point manually.',
          style: TextStyle(color: AppColors.secondaryText, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Set manually'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop();
              locationService.openSettings();
            },
            child: const Text('Turn on'),
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final passenger = authService.currentUser.value;
    final greeting =
        '${_greeting(l10n)}, ${passenger?.fullName.split(' ').first ?? l10n.there}';

    return Scaffold(
      body: Stack(
        children: [
          const _HomeMap(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: _Header(
                greeting: greeting,
                onOpenProfile: widget.onOpenProfile,
              ),
            ),
          ),
          DraggableScrollableSheet(
            initialChildSize: 0.48,
            minChildSize: 0.34,
            maxChildSize: 0.7,
            builder: (context, controller) => Container(
              decoration: const BoxDecoration(
                color: AppColors.lightBackground,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x26000000),
                    blurRadius: 18,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _BookingCard(
                    pickup: _pickup,
                    destination: _destination,
                    savedPlaces: _savedPlaces,
                    onSavedSelect: (place) {
                      _selectDestination(place.place);
                      _openRideOptions(place.place);
                    },
                    locating: _locating,
                    onPickupTap: _openPickup,
                    onDestinationTap: _openDestination,
                    onUseCurrentLocation: _useCurrentLocation,
                    onBook: _bookRide,
                  ),
                  if (_recentPlaces.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    SectionTitle(l10n.recentDestinations),
                    const SizedBox(height: 8),
                    ..._recentPlaces.map(
                      (place) => _RecentPlaceTile(
                        place: place,
                        onTap: () => _openRideOptions(place),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: MediaQuery.sizeOf(context).height * 0.5 + 16,
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
    );
  }
}

class _HomeMap extends StatelessWidget {
  const _HomeMap();

  @override
  Widget build(BuildContext context) {
    final center = LatLng(MapDefaults.latitude, MapDefaults.longitude);
    final nearbyVehicles = [
      LatLng(-1.938, 30.058),
      LatLng(-1.949, 30.066),
      LatLng(-1.942, 30.073),
      LatLng(-1.955, 30.051),
    ];

    return FlutterMap(
      options: MapOptions(initialCenter: center, initialZoom: 13.8),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.femcabs.fem_cabs',
        ),
        MarkerLayer(
          markers: [
            Marker(
              point: center,
              width: 44,
              height: 44,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.white, width: 3),
                  boxShadow: const [
                    BoxShadow(color: Color(0x40000000), blurRadius: 8),
                  ],
                ),
                child: const Icon(Icons.person, color: AppColors.white),
              ),
            ),
            ...nearbyVehicles.map(
              (point) => Marker(
                point: point,
                width: 30,
                height: 30,
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
                    size: 16,
                    color: AppColors.primaryGreen,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.greeting, this.onOpenProfile});

  final String greeting;
  final VoidCallback? onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final dev = authService.isDevPreview;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                greeting,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (dev) ...[
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.lightGray,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    AppLocalizations.of(context).previewBuild,
                    style: TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        Material(
          color: AppColors.white,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onOpenProfile,
            customBorder: const CircleBorder(),
            child: const Padding(
              padding: EdgeInsets.all(10),
              child: Icon(
                Icons.person_outline,
                color: AppColors.black,
                size: 22,
              ),
            ),
          ),
        ),
      ],
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
    required this.onUseCurrentLocation,
    required this.onBook,
  });

  final Place? pickup;
  final Place? destination;
  final List<SavedPlace> savedPlaces;
  final ValueChanged<SavedPlace> onSavedSelect;
  final bool locating;
  final VoidCallback onPickupTap;
  final VoidCallback onDestinationTap;
  final VoidCallback onUseCurrentLocation;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final canBook = pickup != null && destination != null;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.whereGoing,
            style: TextStyle(
              color: AppColors.black,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
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
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primaryGreen,
                  ),
                ),
                SizedBox(width: 10),
                Text(
                  l10n.findingLocation,
                  style: TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13,
                  ),
                ),
              ],
            )
          else
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onUseCurrentLocation,
                icon: const Icon(Icons.my_location, size: 18),
                label: Text(l10n.useCurrentLocation),
              ),
            ),
          if (savedPlaces.isNotEmpty) ...[
            const SizedBox(height: 2),
            _SavedPlacesRow(
              places: savedPlaces,
              onSelect: onSavedSelect,
            ),
          ],
          const SizedBox(height: 6),
          PrimaryButton(
            label: canBook ? l10n.bookRide : l10n.setupRide,
            icon: Icons.navigation,
            onPressed: canBook ? onBook : onDestinationTap,
          ),
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
    return Row(
      children: places
          .map(
            (place) => Padding(
              padding: const EdgeInsets.only(right: 10),
              child: _SavedPlaceChip(place: place, onTap: () => onSelect(place)),
            ),
          )
          .toList(),
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

class _RecentPlaceTile extends StatelessWidget {
  const _RecentPlaceTile({required this.place, required this.onTap});

  final Place place;
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
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.history,
                color: AppColors.secondaryText,
                size: 18,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  place.address,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.black,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}