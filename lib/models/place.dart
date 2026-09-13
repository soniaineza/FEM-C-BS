import 'dart:convert';

/// A location chosen by the passenger: pickup or destination.
///
/// Coordinates are kept as plain doubles so the model has no dependency on a
/// specific map package. [latitude]/[longitude] can be null when the place was
/// typed manually.
class Place {
  const Place({
    this.id,
    required this.address,
    this.latitude,
    this.longitude,
    this.isCurrentLocation = false,
  });

  final String? id;
  final String address;
  final double? latitude;
  final double? longitude;
  final bool isCurrentLocation;

  bool get hasCoordinates => latitude != null && longitude != null;

  Place copyWith({
    String? id,
    String? address,
    double? latitude,
    double? longitude,
    bool? isCurrentLocation,
  }) {
    return Place(
      id: id ?? this.id,
      address: address ?? this.address,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      isCurrentLocation: isCurrentLocation ?? this.isCurrentLocation,
    );
  }

  Map<String, dynamic> toJson() => {
        'address': address,
        'latitude': latitude,
        'longitude': longitude,
        'isCurrentLocation': isCurrentLocation,
      };

  factory Place.fromJson(Map<String, dynamic> json) => Place(
        address: json['address'] as String? ?? '',
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        isCurrentLocation: json['isCurrentLocation'] as bool? ?? false,
      );

  String toJsonString() => jsonEncode(toJson());

  static Place? fromJsonString(String raw) {
    try {
      return Place.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  @override
  String toString() => address;
}