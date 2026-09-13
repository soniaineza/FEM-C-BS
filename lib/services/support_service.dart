import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';

/// Help & support requests.
class SupportService {
  /// Submits a support request ticket.
  ///
  /// In production the request is stored via the backend and a confirmation
  /// with a ticket reference is returned. While the backend is offline this
  /// deliberately fails with a controlled error instead of pretending a ticket
  /// was created.
  Future<String> submitRequest({
    required String category,
    required String subject,
    required String message,
  }) async {
    // TODO(backend): insert into `support_requests` and return a reference.
    throw BackendNotConnectedException('Support');
  }

  /// Contact details shown on the support screen.
  ///
  /// TODO(release): Confirm with FEM C@BS before publishing the app.
  String get supportEmail => AppConstants.supportEmail;
  String get supportPhone => AppConstants.supportPhone;
}

/// App-wide support service instance.
final SupportService supportService = SupportService();