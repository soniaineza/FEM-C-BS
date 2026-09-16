import '../core/constants/app_constants.dart';
import '../models/notification_model.dart';
import 'api_client.dart';

/// In-app notifications for the passenger.
///
/// Against the configured backend these are stored per-account (and reach real
/// devices through push, connected later). In preview mode the empty list is
/// returned — no fake notifications are generated.
class NotificationService {
  /// Notifications for the current passenger.
  Future<List<NotificationItem>> getNotifications() async {
    if (!AppConstants.backendConnected) return const [];
    final data = await apiClient.get('notifications');
    return (data['notifications'] as List<dynamic>? ?? [])
        .map((json) => NotificationItem.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<void> markAsRead(String id) async {
    if (!AppConstants.backendConnected) return;
    await apiClient.post('notifications/$id/read', body: {});
  }

  /// Uses the backend's read-all endpoint (single round trip) instead of
  /// marking item by item.
  Future<void> markAllRead(List<NotificationItem> items) async {
    if (!AppConstants.backendConnected) return;
    await apiClient.post('notifications/read-all', body: {});
  }

  /// Number of unread notifications (drives the home badge).
  Future<int> getUnreadCount() async {
    if (!AppConstants.backendConnected) return 0;
    final data = await apiClient.get('notifications/unread-count');
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  /// Registers this device so the backend can send it push notifications.
  Future<void> registerDeviceToken(String token, {String? platform}) async {
    if (!AppConstants.backendConnected) return;
    await apiClient.post(
      'notifications/device-token',
      body: {'token': token, 'platform': platform},
    );
  }
}

/// App-wide notification service instance.
final NotificationService notificationService = NotificationService();