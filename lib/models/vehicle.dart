/// A ride category offered to passengers.
///
/// The real catalogue comes from the backend. The list returned by
/// `RideService.getAvailableVehicles()` is marked `isMock: true` while the
/// backend is not connected, so the UI stays honestly labeled.
class Vehicle {
  const Vehicle({
    required this.id,
    required this.name,
    required this.description,
    required this.capacity,
    required this.baseFare,
    required this.farePerKm,
    required this.etaMinutes,
    this.isMock = false,
  });

  final String id;
  final String name;
  final String description;
  final int capacity;
  final double baseFare;
  final double farePerKm;
  final int etaMinutes;

  /// True for development-only data until the backend serves vehicles.
  final bool isMock;

  Vehicle copyWith({
    String? id,
    String? name,
    String? description,
    int? capacity,
    double? baseFare,
    double? farePerKm,
    int? etaMinutes,
    bool? isMock,
  }) {
    return Vehicle(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      capacity: capacity ?? this.capacity,
      baseFare: baseFare ?? this.baseFare,
      farePerKm: farePerKm ?? this.farePerKm,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      isMock: isMock ?? this.isMock,
    );
  }

  /// Parses a vehicle returned by the FEM C@BS backend.
  factory Vehicle.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>;
    return Vehicle(
      id: map['id'] as String,
      name: map['name'] as String? ?? '',
      description: map['description'] as String? ?? '',
      capacity: (map['capacity'] as num?)?.toInt() ?? 4,
      baseFare: (map['baseFare'] as num?)?.toDouble() ?? 0,
      farePerKm: (map['farePerKm'] as num?)?.toDouble() ?? 0,
      etaMinutes: (map['etaMinutes'] as num?)?.toInt() ?? 5,
      isMock: map['isMock'] as bool? ?? false,
    );
  }
}