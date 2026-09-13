import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/payment.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/vehicle.dart';
import '../../services/ride_service.dart';
import '../../widgets/error_message.dart';
import '../../widgets/info_row.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/trip_route_card.dart';

/// Final confirmation before the ride is requested (step 16).
class ConfirmRideScreen extends StatefulWidget {
  const ConfirmRideScreen({
    super.key,
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.estimate,
    required this.paymentMethod,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final FareEstimate? estimate;
  final PaymentMethod paymentMethod;

  @override
  State<ConfirmRideScreen> createState() => _ConfirmRideScreenState();
}

class _ConfirmRideScreenState extends State<ConfirmRideScreen> {
  bool _loading = false;
  String? _error;

  Future<void> _confirm() async {
    final fallbackError = AppLocalizations.of(context).signInFailed;
    setState(() {
      _loading = true;
      _error = null;
    });

    String? requestError;
    try {
      await rideService.requestRide(
        pickup: widget.pickup,
        destination: widget.destination,
        vehicle: widget.vehicle,
        paymentMethod: widget.paymentMethod,
        estimate: widget.estimate ??
            FareEstimate(
              vehicle: widget.vehicle,
              distanceKm: 0,
              durationMinutes: 0,
              estimatedFare: 0,
            ),
      );
    } on AppException catch (e) {
      requestError = e.message;
    } catch (_) {
      requestError = fallbackError;
    }

    if (!mounted) return;

    // Move to the driver search screen regardless: it shows the loading state
    // and, when no backend is connected, an honest "not available" notice.
    Navigator.of(context).pushReplacementNamed(
      AppRoutes.searchingDriver,
      arguments: (
        widget.pickup,
        widget.destination,
        widget.vehicle,
        widget.paymentMethod,
        widget.estimate,
        requestError,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.confirmRide)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TripRouteCard(
              pickup: widget.pickup,
              destination: widget.destination,
              distanceKm: widget.estimate?.distanceKm,
              durationMinutes: widget.estimate?.durationMinutes,
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  InfoRow(label: l10n.vehicle, value: widget.vehicle.name, bold: true),
                  const Divider(),
                  InfoRow(
                    label: l10n.paymentMethod,
                    value: widget.paymentMethod.name,
                    bold: true,
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              ErrorMessage(message: _error!),
            ],
            const SizedBox(height: 16),
            const Text(
              'By confirming, a nearby available driver is matched to your '
              'trip. You can cancel at any time before the trip starts.',
              style: TextStyle(
                color: AppColors.secondaryText,
                fontSize: 12.5,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          decoration: const BoxDecoration(
            color: AppColors.white,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              PrimaryButton(
                label: 'Confirm ride',
                loading: _loading,
                onPressed: _loading ? null : _confirm,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _loading
                    ? null
                    : () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}