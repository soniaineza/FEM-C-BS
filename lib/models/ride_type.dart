/// How the passenger chooses to share the ride.
///
///  * [RideType.private]  — a solo ride: the vehicle is yours alone. No extra
///    stops, standard fare.
///  * [RideType.shared]   — a pooled ride: you share the vehicle with other
///    passengers going the same way. You pay less per seat in exchange for a
///    possible short detour while other riders are picked up or dropped off.
enum RideType {
  private,
  shared;

  String get id => switch (this) {
        RideType.private => 'private',
        RideType.shared => 'shared',
      };

  static RideType fromId(String? id) =>
      id == 'shared' ? RideType.shared : RideType.private;

  /// Multiplier applied to the base fare so pooled rides are cheaper.
  /// A shared ride costs ~30% less than the same private trip.
  double get fareFactor => switch (this) {
        RideType.private => 1.0,
        RideType.shared => 0.7,
      };

  /// The advertised saving for a shared ride (30 for shared, 0 for private).
  int get discountPercent => ((1 - fareFactor) * 100).round();
}