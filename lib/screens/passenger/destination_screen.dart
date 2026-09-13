import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/place.dart';
import '../../models/saved_place.dart';
import '../../services/location_service.dart';
import '../../services/user_service.dart';
import '../../widgets/section_title.dart';

/// Destination search. Pops back with the chosen [Place].
///
/// Suggestions come from the mapping service when one is connected. Until
/// then the passenger picks a saved/recent place or types an address
/// manually — no fake locations are generated.
class DestinationScreen extends StatefulWidget {
  const DestinationScreen({super.key, required this.pickup});

  final Place pickup;

  @override
  State<DestinationScreen> createState() => _DestinationScreenState();
}

class _DestinationScreenState extends State<DestinationScreen> {
  final _controller = TextEditingController();

  bool _searching = false;
  bool _searched = false;

  List<SavedPlace> _savedPlaces = [];
  List<Place> _recentPlaces = [];

  @override
  void initState() {
    super.initState();
    _loadPlaces();
  }

  @override
  void dispose() {
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

  Future<void> _search(String query) async {
    final text = query.trim();
    if (text.isEmpty) {
      setState(() {
        _searching = false;
        _searched = false;
      });
      return;
    }

    setState(() {
      _searching = true;
      _searched = false;
    });
    final results = await locationService.searchLocations(text);
    if (!mounted) return;

    setState(() {
      _searching = false;
      _searched = true;
    });

    if (results.isEmpty && !locationService.hasSearchProvider) {
      // Manual entry: user selects the typed address below.
      return;
    }
    if (results.isNotEmpty) {
      _select(results.first);
    }
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
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
                onSubmitted: _search,
                decoration: InputDecoration(
                  hintText: l10n.searchDestination,
                  prefixIcon: const Icon(
                    Icons.search,
                    color: AppColors.secondaryText,
                  ),
                  suffixIcon: _controller.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            _controller.clear();
                            setState(() {
                              _searching = false;
                              _searched = false;
                            });
                          },
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
                  if (_searching)
                    const _SearchingTile()
                  else if (_searched &&
                      _controller.text.trim().isNotEmpty &&
                      !locationService.hasSearchProvider)
                    const _SearchUnavailableNote()
                  else ...[
                    if (_controller.text.trim().isNotEmpty)
                      _ManualSelectTile(
                        label: _controller.text.trim(),
                        onTap: _confirmManual,
                      ),
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
                          padding: EdgeInsets.only(top: 12),
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(SavedPlaceType type) => switch (type) {
        SavedPlaceType.home => Icons.home_outlined,
        SavedPlaceType.work => Icons.business_outlined,
        SavedPlaceType.other => Icons.star_outline,
      };
}

class _SearchingTile extends StatelessWidget {
  const _SearchingTile();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          ),
          SizedBox(width: 12),
          Text(
            'Searching…',
            style: TextStyle(color: AppColors.secondaryText, fontSize: 14),
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
    return const Padding(
      padding: EdgeInsets.only(top: 12, bottom: 12),
      child: Center(
        child: Text(
          'Live search is not connected yet. '
          'Type the address and confirm it below, or choose a saved place.',
          textAlign: TextAlign.center,
          style: TextStyle(
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
    return _PlaceTile(
      icon: Icons.add_location_alt_outlined,
      title: label,
      subtitle: 'Use this address',
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