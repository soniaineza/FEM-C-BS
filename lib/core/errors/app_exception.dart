/// A user-facing error produced by a service.
///
/// Services throw [AppException] with a message that is safe to show to the
/// passenger. Technical details are never exposed.
class AppException implements Exception {
  const AppException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Thrown when an operation needs a backend that is not connected yet.
///
/// UI that catches this shows the standard "not connected yet" state instead
/// of pretending the action succeeded.
class BackendNotConnectedException extends AppException {
  BackendNotConnectedException(
    this.feature, {
    String? message,
  }) : super(message ?? _defaultFor(feature));

  final String feature;

  static String _defaultFor(String feature) =>
      '$feature is not available yet. '
      'The FEM C@BS service will be connected soon.';
}