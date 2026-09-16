import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/utils/debouncer.dart';
import '../../models/place.dart';
import '../../services/location_service.dart';
import '../../widgets/location_permission.dart';
import '../../widgets/primary_button.dart';

/// Map-based location selection.
///
/// The passenger can use the current GPS position, search (when a mapping
/// provider is connected), move the map to a precise point, or type an address
/// manually. Search is debounced while typing and every match is shown as a
/// suggestion to pick from. Confirming pops back with the selected [Place].
/// The same screen is reused to pick a destination ([isPickup] = false).
class PickupScreen extends StatefulWidget {
  const PickupScreen({super.key, this.isPickup = true});

  final bool isPickup;

  @override
  State<PickupScreen> createState() => _PickupScreenState();
}

class _PickupScreenState extends State<PickupScreen> {
  final _searchController = TextEditingController();
  final _mapController = MapController();
  final _searchDebouncer = Debouncer();
  Timer? _reverseDebounce;

  late LatLng _center = LatLng(
    MapDefaults.latitude,
    MapDefaults.longitude,
  );
  String _address = locationService.describePosition(
    MapDefaults.latitude,
    MapDefaults.longitude,
  );
  bool _isCurrentLocation = false;
  bool _locating = false;
  bool _searchNotice = false;
  bool _searchingSuggestions = false;

  /// Bumped on every query so a slow, superseded search result is ignored.
  int _searchSeq = 0;
  List<Place> _searchSuggestions = [];

  @override
  void initState() {
    super.initState();
    _tryCurrentLocation();
  }

  @override
  void dispose() {
    _searchDebouncer.cancel();
    _reverseDebounce?.cancel();
    _searchController.dispose();
    _mapController.dispose();
    super.dispose();
  }

  /// Moves the visible map to [target] after the frame is built so the camera
  /// update is always applied (also after a search result or a GPS fix).
  void _moveCamera(LatLng target, double zoom) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(target, zoom);
    });
  }

  Future<void> _tryCurrentLocation() async {
    setState(() => _locating = true);
    try {
      final place = await locationService.getCurrentPlace();
      if (!mounted) return;
      setState(() {
        _center = LatLng(place.latitude!, place.longitude!);
        _address = AppLocalizations.of(context).currentLocation;
        _isCurrentLocation = true;
      });
      _moveCamera(_center, MapDefaults.zoom);
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
            _address = AppLocalizations.of(context).currentLocation;
            _isCurrentLocation = true;
          });
          _moveCamera(_center, MapDefaults.zoom);
        } catch (_) {
          _snack(AppLocalizations.of(context).couldNotReadLocation);
        } finally {
          if (mounted) setState(() => _locating = false);
        }
      case LocationOutcome.cancelled:
      case LocationOutcome.denied:
        _snack(AppLocalizations.of(context).moveMapOrTypePickup);
      case LocationOutcome.deniedForever:
        _snack(AppLocalizations.of(context).permissionOffManual);
      case LocationOutcome.servicesDisabled:
        _snack(AppLocalizations.of(context).servicesOffManual);
    }
  }

  void _onSearchChanged(String query) {
    setState(() {});
    _searchDebouncer.call(() => _runLiveSearch(query));
  }

  /// Debounced live search: every matching place is offered as a suggestion.
  Future<void> _runLiveSearch(String query) async {
    final text = query.trim();
    if (text.isEmpty) {
      setState(() {
        _searchingSuggestions = false;
        _searchNotice = false;
        _searchSuggestions = [];
      });
      return;
    }

    if (mounted) setState(() => _searchingSuggestions = true);
    final seq = ++_searchSeq;
    final results = await locationService.searchLocations(text);
    if (!mounted || seq != _searchSeq) return;

    setState(() {
      _searchingSuggestions = false;
      _searchSuggestions = results.take(6).toList();
      _searchNotice = results.isEmpty;
      if (results.isEmpty) {
        // The typed text is kept and used as the address label on confirm.
        _address = text;
        _isCurrentLocation = false;
      }
    });
  }

  void _selectSuggestion(Place place) {
    setState(() {
      _searchNotice = false;
      _searchSuggestions = [];
      _isCurrentLocation = false;
      _address = place.address;
      _searchController.text = place.address;
      if (place.hasCoordinates) {
        _center = LatLng(place.latitude!, place.longitude!);
      }
    });
    if (place.hasCoordinates) {
      _moveCamera(_center, 15);
    }
  }

  Future<void> _search(String query) async {
    final text = query.trim();
    if (text.isEmpty) return;

    setState(() => _searchingSuggestions = true);
    final results = await locationService.searchLocations(text);
    if (!mounted) return;

    if (results.isEmpty) {
      setState(() {
        _searchingSuggestions = false;
        _searchNotice = true;
        _searchSuggestions = [];
        // The typed text is kept and used as the address label on confirm.
        _address = text;
        _isCurrentLocation = false;
      });
      return;
    }

    setState(() {
      _searchingSuggestions = false;
      _searchNotice = false;
      _isCurrentLocation = false;
      _searchSuggestions = [];
    });
    _selectSuggestion(results.first);
  }

  void _clearSearch() {
    _searchDebouncer.cancel();
    _searchSeq++;
    setState(() {
      _searchNotice = false;
      _searchingSuggestions = false;
      _searchSuggestions = [];
      _searchController.clear();
    });
  }

  /// Resolves the street address under the map pin shortly after the passenger
  /// stops moving the map, keeping the confirmation card in sync.
  void _scheduleReverseGeocode(LatLng target) {
    _reverseDebounce?.cancel();
    _reverseDebounce = Timer(const Duration(milliseconds: 700), () async {
      if (!mounted) return;
      try {
        final place = await locationService.reverseGeocode(
          latitude: target.latitude,
          longitude: target.longitude,
        );
        if (!mounted) return;
        setState(() {
          _address = place.address;
          _isCurrentLocation = false;
        });
      } catch (_) {
        // Keep the previous label; the coordinates are still correct.
      }
    });
  }

  Place _buildResult() {
    return Place(
      address: _address,
      latitude: _center.latitude,
      longitude: _center.longitude,
      isCurrentLocation: _isCurrentLocation,
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
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _center,
              initialZoom: MapDefaults.zoom,
              onPositionChanged: (camera, hasGesture) {
                setState(() => _center = camera.center);
                if (hasGesture) _scheduleReverseGeocode(camera.center);
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
                    color: widget.isPickup
                        ? AppColors.primaryGreen
                        : AppColors.error,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.white, width: 3),
                    boxShadow: const [
                      BoxShadow(color: Color(0x33000000), blurRadius: 8),
                    ],
                  ),
                  child: Icon(
                    widget.isPickup ? Icons.person : Icons.place,
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
                  showSpinner: _searchingSuggestions,
                  suggestions: _searchSuggestions,
                  onChanged: _onSearchChanged,
                  onSubmitted: _search,
                  onSuggestionTap: _selectSuggestion,
                  onCleared: _clearSearch,
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
                          ? l10n.findingLocation
                          : widget.isPickup
                              ? l10n.adjustPickup
                              : l10n.moveMapHint,
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 14),
                    PrimaryButton(
                      label: widget.isPickup
                          ? l10n.pickupConfirmed
                          : l10n.destinationConfirmed,
                      onPressed: _confirm,
                    ),
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
    required this.showSpinner,
    required this.suggestions,
    required this.onChanged,
    required this.onSubmitted,
    required this.onSuggestionTap,
    required this.onCleared,
  });

  final TextEditingController controller;
  final bool notice;
  final bool showSpinner;
  final List<Place> suggestions;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final ValueChanged<Place> onSuggestionTap;
  final VoidCallback onCleared;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
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
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            style: const TextStyle(fontSize: 15),
            decoration: InputDecoration(
              hintText: l10n.searchOrTypeAddress,
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
          if (showSpinner) ...[
            const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primaryGreen,
                  ),
                ),
              ),
            ),
          ] else if (suggestions.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: suggestions
                    .map(
                      (place) => InkWell(
                        onTap: () => onSuggestionTap(place),
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: 9,
                            horizontal: 4,
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.place_outlined,
                                color: AppColors.primaryGreen,
                                size: 18,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  place.address,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: AppColors.black,
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
          if (notice)
            Padding(
              padding: const EdgeInsets.only(left: 8, right: 8, bottom: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  l10n.noPlaceFoundMoveMap,
                  style: const TextStyle(
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