import '../core/errors/app_exception.dart';
import '../models/payment.dart';

/// Payments for rides.
///
/// Real processing will go through providers such as MTN Mobile Money,
/// Airtel Money and card gateways, orchestrated by the backend. This client
/// only offers the method to the passenger and lets the backend execute the
/// charge — fare calculation and payment confirmation are never trusted from
/// the client.
class PaymentService {
  /// The payment methods offered to passengers (configuration, not data).
  List<PaymentMethod> getAvailableMethods() => PaymentMethod.defaults;

  /// Initiates payment for a completed (or pre-authorized) fare.
  Future<void> processPayment({
    required double amount,
    required PaymentMethod method,
  }) async {
    // TODO(backend): initiate payment via the backend provider integration
    // (MTN MoMo / Airtel Money / card). Never handle card details here.
    throw BackendNotConnectedException('Payments');
  }
}

/// App-wide payment service instance.
final PaymentService paymentService = PaymentService();