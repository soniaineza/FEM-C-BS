import 'dart:async';

/// Cancels and restarts a pending [Timer] so [action] only runs after
/// [duration] of silence. Used to defer live search requests until the user
/// stops typing.
class Debouncer {
  Debouncer({this.duration = const Duration(milliseconds: 400)});

  final Duration duration;
  Timer? _timer;

  bool get isPending => _timer?.isActive ?? false;

  void call(void Function() action) {
    _timer?.cancel();
    _timer = Timer(duration, action);
  }

  void cancel() {
    _timer?.cancel();
    _timer = null;
  }
}