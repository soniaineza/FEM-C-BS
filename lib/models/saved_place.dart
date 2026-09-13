import 'dart:convert';

import 'place.dart';
import '../core/localization/app_localizations.dart';

enum SavedPlaceType { home, work, other }

/// A place the passenger saved for quick re-use.
class SavedPlace {
  const SavedPlace({
    required this.id,
    required this.type,
    required this.name,
    required this.place,
  });

  final String id;
  final SavedPlaceType type;
  final String name;
  final Place place;

  String get typeLabel => switch (type) {
        SavedPlaceType.home => 'Home',
        SavedPlaceType.work => 'Work',
        SavedPlaceType.other => 'Other',
      };

  String typeLabelFor(AppLocalizations l10n) => switch (type) {
        SavedPlaceType.home => l10n.home,
        SavedPlaceType.work => l10n.work,
        SavedPlaceType.other => l10n.other,
      };

  SavedPlace copyWith({
    String? id,
    SavedPlaceType? type,
    String? name,
    Place? place,
  }) {
    return SavedPlace(
      id: id ?? this.id,
      type: type ?? this.type,
      name: name ?? this.name,
      place: place ?? this.place,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.name,
        'name': name,
        'place': place.toJson(),
      };

  factory SavedPlace.fromJson(Map<String, dynamic> json) => SavedPlace(
        id: json['id'] as String? ?? '',
        type: SavedPlaceType.values.firstWhere(
          (t) => t.name == json['type'],
          orElse: () => SavedPlaceType.other,
        ),
        name: json['name'] as String? ?? '',
        place: Place.fromJson(json['place'] as Map<String, dynamic>),
      );

  String toJsonString() => jsonEncode(toJson());

  static SavedPlace? fromJsonString(String raw) {
    try {
      return SavedPlace.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}