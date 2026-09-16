import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/utils/validators.dart';
import '../../models/place.dart';
import '../../models/saved_place.dart';
import '../../services/user_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/primary_button.dart';

/// Saved places: home, work and other (step 27).
///
/// Places are stored on-device today; they will move to the backend
/// `saved_places` table when it is connected.
class SavedPlacesScreen extends StatefulWidget {
  const SavedPlacesScreen({super.key});

  @override
  State<SavedPlacesScreen> createState() => _SavedPlacesScreenState();
}

class _SavedPlacesScreenState extends State<SavedPlacesScreen> {
  List<SavedPlace>? _places;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final places = await userService.getSavedPlaces();
    if (!mounted) return;
    setState(() => _places = places);
  }

  Future<void> _addOrEdit([SavedPlace? existing]) async {
    final result = await showModalBottomSheet<SavedPlace>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => _PlaceFormSheet(place: existing),
    );
    if (result != null) await _load();
  }

  Future<void> _delete(SavedPlace place) async {
    await userService.deletePlace(place.id);
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.placeRemoved(place.name))),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.savedPlaces)),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primaryGreen,
        foregroundColor: AppColors.white,
        onPressed: () => _addOrEdit(),
        icon: const Icon(Icons.add),
        label: Text(l10n.addPlace),
      ),
      body: SafeArea(
        child: _places == null
            ? const Center(child: CircularProgressIndicator())
            : _places!.isEmpty
                ? EmptyState(
                    icon: Icons.place_outlined,
                    title: l10n.noSavedPlaces,
                    subtitle: l10n.savePlacesHint,
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 88),
                    children: _places!.map((p) => _PlaceTile(
                          place: p,
                          l10n: l10n,
                          onEdit: () => _addOrEdit(p),
                          onDelete: () => _delete(p),
                        )).toList(),
                  ),
      ),
    );
  }
}

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({
    required this.place,
    required this.l10n,
    required this.onEdit,
    required this.onDelete,
  });

  final SavedPlace place;
  final AppLocalizations l10n;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  IconData get _icon => switch (place.type) {
        SavedPlaceType.home => Icons.home_outlined,
        SavedPlaceType.work => Icons.business_outlined,
        SavedPlaceType.other => Icons.star_outline,
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(_icon, color: AppColors.primaryGreen, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${place.name} · ${place.typeLabelFor(l10n)}',
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    place.place.address,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined,
                  color: AppColors.secondaryText, size: 20),
              tooltip: l10n.editTooltip,
            ),
            IconButton(
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline,
                  color: AppColors.error, size: 20),
              tooltip: l10n.deleteTooltip,
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaceFormSheet extends StatefulWidget {
  const _PlaceFormSheet({this.place});

  final SavedPlace? place;

  @override
  State<_PlaceFormSheet> createState() => _PlaceFormSheetState();
}

class _PlaceFormSheetState extends State<_PlaceFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.place?.name ?? '');
  late final _address =
      TextEditingController(text: widget.place?.place.address ?? '');
  late SavedPlaceType _type = widget.place?.type ?? SavedPlaceType.other;

  bool get _isEditing => widget.place != null;

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    final place = SavedPlace(
      id: _isEditing ? widget.place!.id : 'sp_${DateTime.now().millisecondsSinceEpoch}',
      type: _type,
      name: _name.text.trim(),
      place: Place(address: _address.text.trim()),
    );
    await userService.savePlace(place);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isEditing ? l10n.editPlace : l10n.addAPlace,
            style: const TextStyle(
              color: AppColors.black,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: SavedPlaceType.values.map((type) {
              final label = switch (type) {
                SavedPlaceType.home => l10n.home,
                SavedPlaceType.work => l10n.work,
                SavedPlaceType.other => l10n.other,
              };
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(label),
                  selected: _type == type,
                  onSelected: (_) => setState(() => _type = type),
                  selectedColor: AppColors.primaryGreen,
                  labelStyle: TextStyle(
                    color: _type == type ? AppColors.white : AppColors.black,
                    fontWeight: FontWeight.w600,
                  ),
                  showCheckmark: false,
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Form(
            key: _formKey,
            child: Column(
              children: [
                CustomTextField(
                  controller: _name,
                  label: l10n.placeName,
                  hintText: l10n.placeNameHint,
                  validator: Validators.required,
                ),
                const SizedBox(height: 14),
                CustomTextField(
                  controller: _address,
                  label: l10n.addressLabel,
                  hintText: l10n.addressHint,
                  validator: Validators.required,
                  onFieldSubmitted: (_) => _save(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: _isEditing ? l10n.saveChanges : l10n.savePlace,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}