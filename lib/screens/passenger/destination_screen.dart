import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/utils/debouncer.dart';
import '../../models/place.dart';
import '../../models/saved_place.dart';
import '../../services/location_service.dart';
import '../../services/user_service.dart';
import '../../widgets/section_title.dart';
import 'pickup_screen.dart';

/// Destination search. Pops back with the chosen [Place].
///
/// Typing runs a debounced live search against the mapping service when one is
/// connected, showing all matches as suggestions (the user picks one — nothing
/// is selected for them). Saved and recent places stay available, the typed
/// address can still be confirmed manually, and no fake locations are
/// generated when the mapping service is offline.
class DestinationScreen extends StatefulWidget {
  const DestinationScreen({super.key, required this.pickup});

  final Place pickup;

  @override
  State<DestinationScreen> createState() => _DestinationScreenState();
}

class _DestinationScreenState extends State<DestinationScreen> {
  final _controller = TextEditingController();
  final _debouncer = Debouncer();

  bool _searching = false;
  bool _searched = false;

  /// Bumped on every query so a slow, superseded search result is ignored.
  int _querySeq = 0;

  List<Place> _results = [];
  List<SavedPlace> _savedPlaces = [];
  List<Place> _recentPlaces = [];

  @override
  void initState() {
    super.initState();
    _loadPlaces();
  }

  @override
  void dispose() {
    _debouncer.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadPlaces() async {
    final saved = await userService.getSavedPlaces();
    final recent = await userService.getRecentPlaces();
    if (!mounted) return;
    setState(() {
      _savedPlaces = saved;
      _recentPlaces = recent;
    });
  }

  void _onQueryChanged(String query) {
    setState(() {});
    _debouncer.call(() => _runSearch(query));
  }

  /// Runs the live search and shows every match; the passenger chooses.
  Future<void> _runSearch(String query) async {
    final text = query.trim();
    if (text.isEmpty) {
      setState(() {
        _searching = false;
        _searched = false;
        _results = [];
      });
      return;
    }

    setState(() {
      _searching = true;
      _searched = false;
    });
    final seq = ++_querySeq;
    final results = await locationService.searchLocations(text);
    if (!mounted || seq != _querySeq) return;

    setState(() {
      _searching = false;
      _searched = true;
      _results = results.take(6).toList();
    });
  }

  void _select(Place place) {
    Navigator.of(context).pop(place);
  }

  /// Confirms the address typed by the passenger as a real user-entered place.
  void _confirmManual() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _select(Place(address: text));
  }

  void _clear() {
    _debouncer.cancel();
    _querySeq++;
    _controller.clear();
    setState(() {
      _searching = false;
      _searched = false;
      _results = [];
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final query = _controller.text.trim();
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(title: Text(l10n.whereGoing)),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: _onQueryChanged,
                onSubmitted: _runSearch,
                decoration: InputDecoration(
                  hintText: l10n.searchDestination,
                  prefixIcon: const Icon(
                    Icons.search,
                    color: AppColors.secondaryText,
                  ),
                  suffixIcon: _controller.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: _clear,
                          icon: const Icon(
                            Icons.close,
                            color: AppColors.secondaryText,
                          ),
                        ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  if (query.isEmpty)
                    ..._buildIdle(l10n)
                  else ...[
                    if (_searching) const _SearchingTile(),
                    if (_results.isNotEmpty)
                      ..._results.map(
                        (place) => _PlaceTile(
                          icon: Icons.place_outlined,
                          title: place.address,
                          onTap: () => _select(place),
                        ),
                      ),
                    if (_searched &&
                        _results.isEmpty &&
                        locationService.hasSearchProvider)
                      Padding(
                        padding:
                            const EdgeInsets.only(top: 2, bottom: 12),
                        child: _CenteredNote(text: l10n.noLocationsFound),
                      ),
                    if (_searched &&
                        _results.isEmpty &&
                        !locationService.hasSearchProvider)
                      const _SearchUnavailableNote(),
                    _ManualSelectTile(
                      label: query,
                      onTap: _confirmManual,
                    ),
                    _PickOnMapTile(
                      onTap: () async {
                        final place = await Navigator.of(context).push<Place>(
                          MaterialPageRoute(
                            builder: (_) => const PickupScreen(isPickup: false),
                          ),
                        );
                        if (place != null && mounted) _select(place);
                      },
                    ),
                  ],
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 2, 4, 14),
                    child: Text(
                      l10n.moveMapHint,
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12.5,
                        height: 1.5,
                      ),
                    ),
                  ),
                  if (query.isEmpty &&
                      _savedPlaces.isNotEmpty) ...[
                    SectionTitle(l10n.savedPlaces),
                    const SizedBox(height: 8),
                    ..._savedPlaces.map(
                      (p) => _PlaceTile(
                        icon: _iconFor(p.type),
                        title: p.name,
                        subtitle: p.place.address,
                        onTap: () => _select(p.place),
                      ),
                    ),
                  ],
                  if (query.isEmpty &&
                      _recentPlaces.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    SectionTitle(l10n.recentPlaces),
                    const SizedBox(height: 8),
                    ..._recentPlaces.map(
                      (p) => _PlaceTile(
                        icon: Icons.history,
                        title: p.address,
                        onTap: () => _select(p),
                      ),
                    ),
                  ],
                  if (query.isEmpty &&
                      _savedPlaces.isEmpty &&
                      _recentPlaces.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Center(
                        child: Text(
                          l10n.typeAddress,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.secondaryText,
                            fontSize: 13.5,
                            height: 1.5,
                          ),
                        ),
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

  List<Widget> _buildIdle(AppLocalizations l10n) {
    return [
      if (_savedPlaces.isNotEmpty) ...[
        SectionTitle(l10n.savedPlaces),
        const SizedBox(height: 8),
        ..._savedPlaces.map(
          (p) => _PlaceTile(
            icon: _iconFor(p.type),
            title: p.name,
            subtitle: p.place.address,
            onTap: () => _select(p.place),
          ),
        ),
      ],
      if (_recentPlaces.isNotEmpty) ...[
        const SizedBox(height: 20),
        SectionTitle(l10n.recentPlaces),
        const SizedBox(height: 8),
        ..._recentPlaces.map(
          (p) => _PlaceTile(
            icon: Icons.history,
            title: p.address,
            onTap: () => _select(p),
          ),
        ),
      ],
      if (_savedPlaces.isEmpty && _recentPlaces.isEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Center(
            child: Text(
              l10n.typeAddress,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.secondaryText,
                fontSize: 13.5,
                height: 1.5,
              ),
            ),
          ),
        ),
    ];
  }

  IconData _iconFor(SavedPlaceType type) => switch (type) {
        SavedPlaceType.home => Icons.home_outlined,
        SavedPlaceType.work => Icons.business_outlined,
        SavedPlaceType.other => Icons.star_outline,
      };
}

class _CenteredNote extends StatelessWidget {
  const _CenteredNote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: AppColors.secondaryText,
          fontSize: 13.5,
          height: 1.5,
        ),
      ),
    );
  }
}

class _PickOnMapTile extends StatelessWidget {
  const _PickOnMapTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.primaryGreen.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primaryGreen),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.map_outlined,
                  color: AppColors.primaryGreen,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.selectOnMap,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.secondaryText,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SearchingTile extends StatelessWidget {
  const _SearchingTile();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          ),
          const SizedBox(width: 12),
          Text(
            l10n.searching,
            style: const TextStyle(color: AppColors.secondaryText, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class _SearchUnavailableNote extends StatelessWidget {
  const _SearchUnavailableNote();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 12),
      child: Center(
        child: Text(
          l10n.liveSearchUnavailable,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.secondaryText,
            fontSize: 13.5,
            height: 1.5,
          ),
        ),
      ),
    );
  }
}

class _ManualSelectTile extends StatelessWidget {
  const _ManualSelectTile({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return _PlaceTile(
      icon: Icons.add_location_alt_outlined,
      title: label,
      subtitle: l10n.useThisAddress,
      onTap: onTap,
      highlight: true,
    );
  }
}

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
    this.highlight = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: highlight ? AppColors.primaryGreen.withValues(alpha: 0.05) : AppColors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: highlight ? AppColors.primaryGreen : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Icon(icon, color: AppColors.primaryGreen, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.black,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.secondaryText,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.secondaryText,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}