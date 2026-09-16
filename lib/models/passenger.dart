import 'dart:convert';

/// A passenger account.
///
/// [isDevPreview] is true when the session was created by the local
/// development fallback because the backend is not connected yet.
class Passenger {
  const Passenger({
    this.id,
    required this.fullName,
    required this.phone,
    required this.email,
    this.photoUrl,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.isProfileComplete = false,
    this.isDevPreview = false,
  });

  final String? id;
  final String fullName;
  final String phone;
  final String email;
  final String? photoUrl;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final bool isProfileComplete;
  final bool isDevPreview;

  bool get hasEmergencyContact =>
      emergencyContactName != null && emergencyContactPhone != null;

  Passenger copyWith({
    String? id,
    String? fullName,
    String? phone,
    String? email,
    String? photoUrl,
    String? emergencyContactName,
    String? emergencyContactPhone,
    bool? isProfileComplete,
    bool? isDevPreview,
  }) {
    return Passenger(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      photoUrl: photoUrl ?? this.photoUrl,
      emergencyContactName: emergencyContactName ?? this.emergencyContactName,
      emergencyContactPhone:
          emergencyContactPhone ?? this.emergencyContactPhone,
      isProfileComplete: isProfileComplete ?? this.isProfileComplete,
      isDevPreview: isDevPreview ?? this.isDevPreview,
    );
  }

  Map<String, dynamic> toJson() => {
        'fullName': fullName,
        'phone': phone,
        'email': email,
        'photoUrl': photoUrl,
        'emergencyContactName': emergencyContactName,
        'emergencyContactPhone': emergencyContactPhone,
        'isProfileComplete': isProfileComplete,
      };

  factory Passenger.fromJson(Map<String, dynamic> json) => Passenger(
        id: json['id'] as String?,
        fullName: json['fullName'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        email: json['email'] as String? ?? '',
        photoUrl: json['photoUrl'] as String?,
        emergencyContactName: json['emergencyContactName'] as String?,
        emergencyContactPhone: json['emergencyContactPhone'] as String?,
        isProfileComplete: json['isProfileComplete'] as bool? ?? false,
      );

  /// Parses a passenger returned by the FEM C@BS backend.
  factory Passenger.fromBackendJson(Object? json) =>
      Passenger.fromJson(json as Map<String, dynamic>);

  String toJsonString() => jsonEncode(toJson());

  static Passenger? fromJsonString(String raw, {bool isDevPreview = false}) {
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return Passenger.fromJson(json).copyWith(isDevPreview: isDevPreview);
    } catch (_) {
      return null;
    }
  }
}