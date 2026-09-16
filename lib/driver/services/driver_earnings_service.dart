import '../../core/constants/app_constants.dart';
import 'driver_api_client.dart';

/// Earnings data for the driver.
class DriverEarningsData {
  const DriverEarningsData({
    this.todayAmount = 0,
    this.todayRides = 0,
    this.weekAmount = 0,
    this.weekRides = 0,
    this.monthAmount = 0,
    this.monthRides = 0,
    this.totalAmount = 0,
    this.totalRides = 0,
    this.pendingBalance = 0,
    this.rating,
    this.totalTrips = 0,
  });

  final double todayAmount;
  final int todayRides;
  final double weekAmount;
  final int weekRides;
  final double monthAmount;
  final int monthRides;
  final double totalAmount;
  final int totalRides;
  final double pendingBalance;
  final double? rating;
  final int totalTrips;

  factory DriverEarningsData.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? {};
    return DriverEarningsData(
      todayAmount: (map['today']?['amount'] as num?)?.toDouble() ?? 0,
      todayRides: (map['today']?['rides'] as num?)?.toInt() ?? 0,
      weekAmount: (map['week']?['amount'] as num?)?.toDouble() ?? 0,
      weekRides: (map['week']?['rides'] as num?)?.toInt() ?? 0,
      monthAmount: (map['month']?['amount'] as num?)?.toDouble() ?? 0,
      monthRides: (map['month']?['rides'] as num?)?.toInt() ?? 0,
      totalAmount: (map['total']?['amount'] as num?)?.toDouble() ?? 0,
      totalRides: (map['total']?['rides'] as num?)?.toInt() ?? 0,
      pendingBalance: (map['pendingBalance'] as num?)?.toDouble() ?? 0,
      rating: (map['rating'] as num?)?.toDouble(),
      totalTrips: (map['totalTrips'] as num?)?.toInt() ?? 0,
    );
  }
}

/// A single earning record.
class EarningRecord {
  const EarningRecord({
    required this.id,
    required this.rideId,
    required this.grossAmount,
    required this.commission,
    required this.netAmount,
    required this.paymentMethod,
    required this.status,
    required this.pickupAddress,
    required this.destAddress,
    required this.distanceKm,
    required this.rideType,
    required this.createdAt,
    this.settledAt,
  });

  final String id;
  final String rideId;
  final double grossAmount;
  final double commission;
  final double netAmount;
  final String paymentMethod;
  final String status;
  final String pickupAddress;
  final String destAddress;
  final double distanceKm;
  final String rideType;
  final DateTime createdAt;
  final DateTime? settledAt;

  factory EarningRecord.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? {};
    return EarningRecord(
      id: map['id'] as String? ?? '',
      rideId: map['rideId'] as String? ?? '',
      grossAmount: (map['grossAmount'] as num?)?.toDouble() ?? 0,
      commission: (map['commission'] as num?)?.toDouble() ?? 0,
      netAmount: (map['netAmount'] as num?)?.toDouble() ?? 0,
      paymentMethod: map['paymentMethod'] as String? ?? 'cash',
      status: map['status'] as String? ?? 'pending',
      pickupAddress: map['pickupAddress'] as String? ?? '',
      destAddress: map['destAddress'] as String? ?? '',
      distanceKm: (map['distanceKm'] as num?)?.toDouble() ?? 0,
      rideType: map['rideType'] as String? ?? 'private',
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? '') ?? DateTime.now(),
      settledAt: DateTime.tryParse(map['settledAt'] as String? ?? ''),
    );
  }
}

class DriverEarningsService {
  Future<DriverEarningsData> getEarningsSummary() async {
    if (!AppConstants.backendConnected) return const DriverEarningsData();
    final data = await driverApiClient.get('driver/earnings');
    return DriverEarningsData.fromBackendJson(data['earnings']);
  }

  Future<List<EarningRecord>> getEarningsHistory() async {
    if (!AppConstants.backendConnected) return [];
    final data = await driverApiClient.get('driver/earnings/history');
    return (data['earnings'] as List<dynamic>? ?? [])
        .map(EarningRecord.fromBackendJson)
        .toList();
  }
}

final DriverEarningsService driverEarningsService = DriverEarningsService();
