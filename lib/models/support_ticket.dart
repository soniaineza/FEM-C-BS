/// A support ticket submitted by the passenger.
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.category,
    required this.subject,
    required this.message,
    required this.status,
    required this.createdAt,
    this.rideId,
    this.updatedAt,
  });

  final String id;
  final String? rideId;
  final String category;
  final String subject;
  final String message;
  final String status;
  final DateTime createdAt;
  final DateTime? updatedAt;

  bool get isResolved => status == 'resolved' || status == 'closed';

  factory SupportTicket.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? const {};
    return SupportTicket(
      id: map['id'] as String? ?? '',
      rideId: map['rideId'] as String?,
      category: map['category'] as String? ?? 'general',
      subject: map['subject'] as String? ?? '',
      message: map['message'] as String? ?? '',
      status: map['status'] as String? ?? 'open',
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? '') ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(map['updatedAt'] as String? ?? ''),
    );
  }
}

/// A single message inside a support ticket thread.
class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.senderRole,
    required this.message,
    required this.createdAt,
  });

  final String id;
  final String senderRole;
  final String message;
  final DateTime createdAt;

  bool get fromPassenger => senderRole == 'passenger';

  factory SupportMessage.fromBackendJson(Object? json) {
    final map = json as Map<String, dynamic>? ?? const {};
    return SupportMessage(
      id: map['id'] as String? ?? '',
      senderRole: map['senderRole'] as String? ?? 'agent',
      message: (map['content'] as String?) ??
          (map['message'] as String? ?? ''),
      createdAt: DateTime.tryParse(map['createdAt'] as String? ?? '') ??
          DateTime.now(),
    );
  }
}