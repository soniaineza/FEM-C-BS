import '../models/notification_model.dart';

/// In-app notifications for the passenger.
///
/// Planned integration: **Firebase Cloud Messaging** (a device token is
/// registered by this service and the backend pushes notifications through it).
class NotificationService {
  /// Notifications for the current passenger.
  ///
  /// While the backend is offline this returns a real empty list — no fake
  /// notifications are generated.
  Future<List<NotificationItem>> getNotifications() async {
    // TODO(backend): fetch notifications for the current passenger + FCM.
    return const [];
  }

  Future<void> markAsRead(String id) async {
    // TODO(backend): update the notification read state.
  }

  /// Registers this device so the backend can send it push notifications.
  Future<void> registerDeviceToken(String token) async {
    // TODO(backend): store the FCM token against the passenger account.
  }
}

/// App-wide notification service instance.
final NotificationService notificationService = NotificationService();