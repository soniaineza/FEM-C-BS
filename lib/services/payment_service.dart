import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/payment.dart';
import '../models/payment_record.dart';
import 'api_client.dart';

/// Payments for rides.
///
/// Everything goes through the backend: it creates the payment, works the
/// provider (MTN MoMo / Airtel Money / Paypack) and only marks it settled once
/// money really moves. The client never fakes a successful payment — when the
/// provider is not configured the backend keeps the payment pending and the UI
/// shows that honest state.
class PaymentService {
  final ApiClient _api = apiClient;

  /// The payment methods offered to passengers (configuration, not data).
  List<PaymentMethod> getAvailableMethods() => PaymentMethod.defaults;

  /// Creates (or returns the existing, idempotently) backend payment for the
  /// ride and starts the provider charge.
  Future<PaymentRecord> initiatePayment({
    required String rideId,
  }) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Payments');
    }
    final data = await _api.post(
      'payments',
      body: {'rideId': rideId},
    );
    return PaymentRecord.fromBackendJson(data['payment']);
  }

  /// The current payment for a ride (never initiates a charge).
  Future<PaymentRecord> getPayment({required String rideId}) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Payments');
    }
    final data = await _api.get('rides/$rideId/payment');
    final payment = data['payment'];
    if (payment == null) {
      throw AppException('No payment for this ride yet.');
    }
    return PaymentRecord.fromBackendJson(payment);
  }

  /// Asks the gateway for the latest status of a pending payment.
  Future<PaymentRecord> refreshPaymentStatus({required String paymentId}) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Payments');
    }
    final data = await _api.post('payments/$paymentId/refresh');
    return PaymentRecord.fromBackendJson(data['payment']);
  }

  /// Passenger confirms they paid the driver in cash.
  Future<PaymentRecord> confirmCashPayment({required String rideId}) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Payments');
    }
    final data = await _api.post('rides/$rideId/pay-cash');
    return PaymentRecord.fromBackendJson(data['payment']);
  }
}

/// App-wide payment service instance.
final PaymentService paymentService = PaymentService();