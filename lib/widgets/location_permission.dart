import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../core/constants/app_colors.dart';
import '../core/diagnostics/app_logger.dart';
import '../core/localization/app_localizations.dart';
import '../services/location_service.dart';

enum LocationOutcome { granted, denied, deniedForever, servicesDisabled, cancelled }

/// Asks for location once, with a clear explanation *before* the operating
/// system permission dialog appears.
///
/// The passenger chooses "Allow location" or "Not now". On "Not now" the app
/// never reopens the system dialog automatically — the flow falls back to
/// manual pickup entry.
Future<LocationOutcome> ensureLocationPermission(BuildContext context) async {
  final service = locationService;

  final serviceEnabled = await service.isServiceEnabled();
  AppLogger.event('LOCATION_SERVICE_STATUS', serviceEnabled ? 'enabled' : 'disabled');
  if (!serviceEnabled) {
    return LocationOutcome.servicesDisabled;
  }

  final current = await service.checkPermission();
  if (current == LocationPermission.whileInUse ||
      current == LocationPermission.always) {
    AppLogger.event('LOCATION_PERMISSION_RESULT', 'already granted ($current)');
    return LocationOutcome.granted;
  }
  if (current == LocationPermission.deniedForever) {
    AppLogger.event('LOCATION_PERMISSION_RESULT', 'deniedForever');
    return LocationOutcome.deniedForever;
  }

  if (!context.mounted) return LocationOutcome.cancelled;

  AppLogger.event('LOCATION_PERMISSION_REQUESTED');
  final proceed = await showDialog<bool>(
    context: context,
    builder: (context) => const _LocationExplanationDialog(),
  );

  if (proceed != true) {
    AppLogger.event('LOCATION_PERMISSION_RESULT', 'explanation dialog declined');
    return LocationOutcome.cancelled;
  }

  final requested = await service.requestPermission();
  AppLogger.event('LOCATION_PERMISSION_RESULT', '$requested');
  return switch (requested) {
    LocationPermission.whileInUse ||
    LocationPermission.always =>
      LocationOutcome.granted,
    LocationPermission.deniedForever => LocationOutcome.deniedForever,
    LocationPermission.denied => LocationOutcome.denied,
    LocationPermission.unableToDetermine => LocationOutcome.denied,
  };
}

class _LocationExplanationDialog extends StatelessWidget {
  const _LocationExplanationDialog();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AlertDialog(
      backgroundColor: AppColors.white,
      title: Text(
        l10n.allowLocation,
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
      content: Text(
        l10n.locationExplanation,
        style: TextStyle(color: AppColors.secondaryText, height: 1.5),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.notNow),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(l10n.allow),
        ),
      ],
    );
  }
}