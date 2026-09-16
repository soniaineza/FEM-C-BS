import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';
import '../models/support_ticket.dart';
import 'api_client.dart';

/// Help & support requests, stored and answered through the backend.
class SupportService {
  final ApiClient _api = apiClient;

  static const _categoryByTopic = <String, String>{
    'Ride issue': 'general',
    'Payment issue': 'payment',
    'Driver issue': 'report_driver',
    'Account issue': 'app_issue',
    'Safety concern': 'general',
    'Other': 'billing',
  };

  /// Submits a support request ticket and returns its reference.
  ///
  /// [category] may be a backend category id (`payment`, `lost_item`,
  /// `report_driver`, `app_issue`, `billing`, `general`) or a friendly topic
  /// label, which is mapped to a backend category.
  Future<SupportTicket> submitRequest({
    required String category,
    required String subject,
    required String message,
    String? rideId,
  }) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Support');
    }
    final resolvedCategory = _categoryByTopic[category] ?? category;
    final data = await _api.post(
      'support',
      body: {
        'category': resolvedCategory,
        'subject': subject,
        'message': message,
        'rideId': rideId,
      },
    );
    return SupportTicket.fromBackendJson(data['ticket']);
  }

  /// This passenger's support tickets (newest first).
  Future<List<SupportTicket>> getTickets() async {
    if (!AppConstants.backendConnected) return [];
    final data = await _api.get('support');
    return (data['tickets'] as List<dynamic>? ?? [])
        .map(SupportTicket.fromBackendJson)
        .toList();
  }

  /// A ticket with its full message thread.
  Future<({SupportTicket ticket, List<SupportMessage> messages})>
      getTicketWithMessages(String ticketId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Support');
    }
    final data = await _api.get('support/$ticketId');
    return (
      ticket: SupportTicket.fromBackendJson(data['ticket']),
      messages: (data['messages'] as List<dynamic>? ?? [])
          .map(SupportMessage.fromBackendJson)
          .toList(),
    );
  }

  /// Replies to an open ticket thread.
  Future<SupportMessage> replyToTicket({
    required String ticketId,
    required String message,
  }) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Support');
    }
    final data = await _api.post(
      'support/$ticketId/messages',
      body: {'message': message},
    );
    return SupportMessage.fromBackendJson(data['message']);
  }

  /// Closes the passenger's own ticket.
  Future<SupportTicket> closeTicket(String ticketId) async {
    if (!AppConstants.backendConnected) {
      throw BackendNotConnectedException('Support');
    }
    final data = await _api.post('support/$ticketId/close');
    return SupportTicket.fromBackendJson(data['ticket']);
  }

  /// Contact details shown on the support screen.
  ///
  /// TODO(release): Confirm with FEM C@BS before publishing the app.
  String get supportEmail => AppConstants.supportEmail;
  String get supportPhone => AppConstants.supportPhone;
}

/// App-wide support service instance.
final SupportService supportService = SupportService();