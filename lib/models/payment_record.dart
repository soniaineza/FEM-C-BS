/// The lifecycle state of a backend-managed payment for a ride.
enum PaymentStatus {
  pending,
  processing,
  succeeded,
  failed,
  refunded;

  static PaymentStatus fromId(String? id) => switch (id) {
        'processing' => PaymentStatus.processing,
        'succeeded' => PaymentStatus.succeeded,
        'failed' => PaymentStatus.failed,
        'refunded' => PaymentStatus.refunded,
        _ => PaymentStatus.pending,
      };

  bool get isSettled =>
      this == PaymentStatus.succeeded || this == PaymentStatus.refunded;
}

/// A payment record as created and managed by the backend.
///
/// The client only ever reads and re-checks these; the backend owns the money
/// movement and marks payments settled. A `pending` payment whose provider is
/// not configured stays pending honestly instead of being faked as paid.
class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.rideId,
    required this.amount,
    required this.method,
    required this.status,
    required this.createdAt,
    this.provider,
    this.reference,
    this.externalReference,
    this.updatedAt,
  });

  final String id;
  final String rideId;
  final double amount;
  final String method;
  final PaymentStatus status;
  final DateTime createdAt;
  final String? provider;
  final String? reference;
  final String? externalReference;
  final DateTime? updatedAt;

  /// When Paypack/Paylink is not configured the backend reports a pending
  /// payment with this provider marker; the UI explains the honest state.
  bool get providerNotConfigured => provider == 'provider_not_configured';

  String get statusLabel {
    switch (status) {
      case PaymentStatus.succeeded:
        return 'Paid';
      case PaymentStatus.processing:
        return 'Processing';
      case PaymentStatus.failed:
        return 'Failed';
      case PaymentStatus.refunded:
        return 'Refunded';
      case PaymentStatus.pending:
        return 'Pending';
    }
  }

  factory PaymentRecord.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? const {};
    return PaymentRecord(
      id: map['id'] as String? ?? '',
      rideId: map['rideId'] as String? ?? '',
      amount: (map['amount'] as num?)?.toDouble() ?? 0,
      method: map['method'] as String? ?? 'cash',
      status: PaymentStatus.fromId(map['status'] as String?),
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? '') ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(map['updatedAt'] as String? ?? ''),
      provider: map['provider'] as String?,
      reference: map['reference'] as String?,
      externalReference: map['externalReference'] as String?,
    );
  }
}