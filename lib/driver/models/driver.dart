/// A driver account on the FEM c@bs platform.
class Driver {
  const Driver({
    this.id,
    required this.fullName,
    required this.phone,
    this.email,
    this.photoUrl,
    this.licenseNumber,
    this.verified = false,
    this.status = 'offline',
    this.currentVehicleId,
    this.rating,
    this.totalTrips = 0,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.preferredLanguage = 'en',
    this.isProfileComplete = false,
    this.vehicleMake,
    this.vehicleModel,
    this.vehicleYear,
    this.vehicleColor,
    this.vehiclePlate,
    this.totalEarnings = 0,
    this.todayEarnings = 0,
    this.isDevPreview = false,
  });

  final String? id;
  final String fullName;
  final String phone;
  final String? email;
  final String? photoUrl;
  final String? licenseNumber;
  final bool verified;
  final String status;
  final String? currentVehicleId;
  final double? rating;
  final int totalTrips;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? preferredLanguage;
  final bool isProfileComplete;
  final String? vehicleMake;
  final String? vehicleModel;
  final int? vehicleYear;
  final String? vehicleColor;
  final String? vehiclePlate;
  final double totalEarnings;
  final double todayEarnings;
  final bool isDevPreview;

  bool get isOnline => status == 'active';
  bool get isBusy => status == 'busy';
  bool get isOffline => status == 'offline';
  bool get isSuspended => status == 'suspended';

  String get vehicleDisplay {
    final parts = <String>[
      if (vehicleMake != null && vehicleMake!.isNotEmpty) vehicleMake!,
      if (vehicleModel != null && vehicleModel!.isNotEmpty) vehicleModel!,
    ];
    return parts.isEmpty ? 'Vehicle not set' : parts.join(' ');
  }

  Driver copyWith({
    String? id,
    String? fullName,
    String? phone,
    String? email,
    String? photoUrl,
    String? licenseNumber,
    bool? verified,
    String? status,
    String? currentVehicleId,
    double? rating,
    int? totalTrips,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? preferredLanguage,
    bool? isProfileComplete,
    String? vehicleMake,
    String? vehicleModel,
    int? vehicleYear,
    String? vehicleColor,
    String? vehiclePlate,
    double? totalEarnings,
    double? todayEarnings,
    bool? isDevPreview,
  }) {
    return Driver(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      photoUrl: photoUrl ?? this.photoUrl,
      licenseNumber: licenseNumber ?? this.licenseNumber,
      verified: verified ?? this.verified,
      status: status ?? this.status,
      currentVehicleId: currentVehicleId ?? this.currentVehicleId,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      emergencyContactName: emergencyContactName ?? this.emergencyContactName,
      emergencyContactPhone: emergencyContactPhone ?? this.emergencyContactPhone,
      preferredLanguage: preferredLanguage ?? this.preferredLanguage,
      isProfileComplete: isProfileComplete ?? this.isProfileComplete,
      vehicleMake: vehicleMake ?? this.vehicleMake,
      vehicleModel: vehicleModel ?? this.vehicleModel,
      vehicleYear: vehicleYear ?? this.vehicleYear,
      vehicleColor: vehicleColor ?? this.vehicleColor,
      vehiclePlate: vehiclePlate ?? this.vehiclePlate,
      totalEarnings: totalEarnings ?? this.totalEarnings,
      todayEarnings: todayEarnings ?? this.todayEarnings,
      isDevPreview: isDevPreview ?? this.isDevPreview,
    );
  }

  factory Driver.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? {};
    return Driver(
      id: map['id'] as String?,
      fullName: map['fullName'] as String? ?? '',
      phone: map['phone'] as String? ?? '',
      email: map['email'] as String?,
      photoUrl: map['photoUrl'] as String?,
      licenseNumber: map['licenseNumber'] as String?,
      verified: map['verified'] as bool? ?? false,
      status: map['status'] as String? ?? 'offline',
      currentVehicleId: map['vehicleId'] as String?,
      rating: (map['rating'] as num?)?.toDouble(),
      totalTrips: (map['totalTrips'] as num?)?.toInt() ?? 0,
      emergencyContactName: map['emergencyContactName'] as String?,
      emergencyContactPhone: map['emergencyContactPhone'] as String?,
      preferredLanguage: map['preferredLanguage'] as String?,
      isProfileComplete: map['isProfileComplete'] as bool? ?? false,
      vehicleMake: map['vehicleMake'] as String?,
      vehicleModel: map['vehicleModel'] as String?,
      vehicleYear: (map['vehicleYear'] as num?)?.toInt(),
      vehicleColor: map['vehicleColor'] as String?,
      vehiclePlate: map['vehiclePlate'] as String?,
    );
  }
}
