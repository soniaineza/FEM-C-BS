import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/place.dart';
import '../../services/location_service.dart';
import '../../widgets/location_permission.dart';
import '../../widgets/primary_button.dart';

/// Map-based pickup selection.
///
/// The passenger can use the current GPS position, search (when a mapping
/// provider is connected), move the map to a precise point, or type an address
/// manually. Confirming pops back with the selected [Place].
class PickupScreen extends StatefulWidget {
  const PickupScreen({super.key});

  @override
  State<PickupScreen> createState() => _PickupScreenState();
}

class _PickupScreenState extends State<PickupScreen> {
  final _searchController = TextEditingController();

  late LatLng _center = LatLng(
    MapDefaults.latitude,
    MapDefaults.longitude,
  );
  String _address = locationService.describePosition(
    MapDefaults.latitude,
    MapDefaults.longitude,
  );
  bool _locating = false;
  bool _searchNotice = false;

  @override
  void initState() {
    super.initState();
    _tryCurrentLocation();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _tryCurrentLocation() async {
    setState(() => _locating = true);
    try {
      final place = await locationService.getCurrentPlace();
      if (!mounted) return;
      setState(() {
        _center = LatLng(place.latitude!, place.longitude!);
        _address = 'Current location';
      });
    } catch (_) {
      // Manual entry stays available; this is the fallback starting view.
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _locate() async {
    final outcome = await ensureLocationPermission(context);
    if (!mounted) return;

    switch (outcome) {
      case LocationOutcome.granted:
        setState(() => _locating = true);
        try {
          final place = await locationService.getCurrentPlace();
          if (!mounted) return;
          setState(() {
            _center = LatLng(place.latitude!, place.longitude!);
            _address = 'Current location';
          });
        } catch (_) {
          _snack('Could not read your location. Move the map instead.');
        } finally {
          if (mounted) setState(() => _locating = false);
        }
      case LocationOutcome.cancelled:
      case LocationOutcome.denied:
        _snack('Move the map or type an address to set your pickup.');
      case LocationOutcome.deniedForever:
        _snack('Location permission is off — set your pickup manually.');
      case LocationOutcome.servicesDisabled:
        _snack('Location services are off — set your pickup manually.');
    }
  }

  Future<void> _search(String query) async {
    final text = query.trim();
    if (text.isEmpty) return;

    if (!locationService.hasSearchProvider) {
      setState(() {
        _searchNotice = true;
        // The typed text is kept and used as the address label on confirm.
        _address = text;
      });
      return;
    }

    final results = await locationService.searchLocations(text);
    if (!mounted) return;

    if (results.isEmpty) {
      setState(() => _searchNotice = true);
    } else {
      final first = results.first;
      setState(() {
        _searchNotice = false;
        _address = first.address;
        if (first.hasCoordinates) {
          _center = LatLng(first.latitude!, first.longitude!);
        }
      });
    }
  }

  Place _buildResult() {
    return Place(
      address: _address,
      latitude: _center.latitude,
      longitude: _center.longitude,
      isCurrentLocation: _address == 'Current location',
    );
  }

  void _confirm() {
    Navigator.of(context).pop(_buildResult());
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: _center,
              initialZoom: MapDefaults.zoom,
              onPositionChanged: (camera, hasGesture) {
                setState(() => _center = camera.center);
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.femcabs.fem_cabs',
              ),
              const RichAttributionWidget(
                attributions: [
                  TextSourceAttribution('OpenStreetMap contributors'),
                ],
              ),
            ],
          ),
          // Fixed pickup pin at the map centre (the selected point).
          IgnorePointer(
            child: Center(
              child: Transform.translate(
                offset: const Offset(0, -22),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primaryGreen,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.white, width: 3),
                    boxShadow: const [
                      BoxShadow(color: Color(0x33000000), blurRadius: 8),
                    ],
                  ),
                  child: const Icon(
                    Icons.person,
                    color: AppColors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _SearchCard(
                  controller: _searchController,
                  notice: _searchNotice,
                  onChanged: () {
                    setState(() {});
                  },
                  onSubmitted: _search,
                  onCleared: () {
                    setState(() {
                      _searchNotice = false;
                      _searchController.clear();
                    });
                  },
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 12, top: 8),
                child: Material(
                  color: AppColors.white,
                  shape: const CircleBorder(),
                  child: IconButton(
                      tooltip: AppLocalizations.of(context).back,
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back),
                  ),
                ),
              ),
            ),
          ),
          // Current-location button, pinned near the map centre.
          SafeArea(
            child: Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 14),
                child: Column(
                  children: [
                    const Spacer(),
                    FloatingActionButton.small(
                      heroTag: 'locate',
                      backgroundColor: AppColors.white,
                      foregroundColor: AppColors.primaryGreen,
                      onPressed: _locating ? null : _locate,
                      child: _locating
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.primaryGreen,
                              ),
                            )
                          : const Icon(Icons.my_location),
                    ),
                    const Spacer(),
                  ],
                ),
              ),
            ),
          ),
          // Bottom: confirmation card.
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x1F000000),
                      blurRadius: 16,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.circle,
                          color: AppColors.primaryGreen,
                          size: 12,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _address,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.black,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _locating
                          ? 'Finding your location…'
                          : 'Move the map to adjust your pickup point.',
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 14),
                    PrimaryButton(label: 'Confirm pickup', onPressed: _confirm),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchCard extends StatelessWidget {
  const _SearchCard({
    required this.controller,
    required this.notice,
    required this.onChanged,
    required this.onSubmitted,
    required this.onCleared,
  });

  final TextEditingController controller;
  final bool notice;
  final VoidCallback onChanged;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onCleared;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1F000000),
            blurRadius: 12,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: controller,
            textInputAction: TextInputAction.search,
            onChanged: (_) => onChanged(),
            onSubmitted: onSubmitted,
            style: const TextStyle(fontSize: 15),
            decoration: InputDecoration(
              hintText: 'Search or type the address',
              border: InputBorder.none,
              prefixIcon: const Icon(
                Icons.search,
                color: AppColors.secondaryText,
              ),
              suffixIcon: controller.text.isNotEmpty
                  ? IconButton(
                      onPressed: onCleared,
                      icon: const Icon(
                        Icons.close,
                        color: AppColors.secondaryText,
                      ),
                    )
                  : null,
            ),
          ),
          if (notice)
            const Padding(
              padding: EdgeInsets.only(left: 8, right: 8, bottom: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Search will work once a mapping service is connected. '
                  'Move the map or keep typing to set the address.',
                  style: TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}