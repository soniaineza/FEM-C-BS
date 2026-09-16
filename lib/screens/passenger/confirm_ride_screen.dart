import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/payment.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/ride_type.dart';
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
    required this.rideType,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final FareEstimate? estimate;
  final PaymentMethod paymentMethod;
  final RideType rideType;

  @override
  State<ConfirmRideScreen> createState() => _ConfirmRideScreenState();
}

class _ConfirmRideScreenState extends State<ConfirmRideScreen> {
  bool _loading = false;
  String? _error;
  final TextEditingController _noteController = TextEditingController();

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    final fallbackError = AppLocalizations.of(context).signInFailed;
    setState(() {
      _loading = true;
      _error = null;
    });

    String? requestError;
    Ride? createdRide;
    try {
      createdRide = await rideService.requestRide(
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
              rideType: widget.rideType,
            ),
        rideType: widget.rideType,
        note: _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
      );
    } on AppException catch (e) {
      requestError = e.message;
    } catch (_) {
      requestError = fallbackError;
    }

    if (!mounted) return;

    // Move to the driver search screen regardless: it shows the loading state
    // and, when no backend is connected, an honest "not available" notice.
    // When the backend created the ride we pass it along so the search screen
    // tracks the real ride by id.
    Navigator.of(context).pushReplacementNamed(
      AppRoutes.searchingDriver,
      arguments: SearchingDriverArgs(
        pickup: widget.pickup,
        destination: widget.destination,
        vehicle: widget.vehicle,
        paymentMethod: widget.paymentMethod,
        estimate: widget.estimate,
        requestError: requestError,
        rideType: widget.rideType,
        rideNote: _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
        createdRide: createdRide,
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
                  InfoRow(
                    label: l10n.rideType,
                    value: widget.rideType == RideType.shared
                        ? l10n.shareRide
                        : l10n.privateRide,
                    bold: true,
                  ),
                  const Divider(),
                  InfoRow(label: l10n.vehicle, value: widget.vehicle.name, bold: true),
                  const Divider(),
                  InfoRow(
                    label: l10n.paymentMethod,
                    value: widget.paymentMethod.name,
                    bold: true,
                  ),
                  const Divider(),
                  InfoRow(
                    label: l10n.fare,
                    value: '${widget.estimate?.estimatedFare.toStringAsFixed(0) ?? '--'} RWF',
                    bold: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: _RideNoteField(controller: _noteController, l10n: l10n),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              ErrorMessage(message: _error!),
            ],
            const SizedBox(height: 16),
            Text(
              l10n.confirmRideNotice,
              style: const TextStyle(
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
                label: l10n.requestRide,
                loading: _loading,
                onPressed: _loading ? null : _confirm,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _loading
                    ? null
                    : () => Navigator.of(context).pop(),
                child: Text(l10n.cancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Optional note the passenger leaves for the driver.
class _RideNoteField extends StatelessWidget {
  const _RideNoteField({required this.controller, required this.l10n});

  final TextEditingController controller;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: 3,
      maxLength: 200,
      decoration: InputDecoration(
        labelText: l10n.rideNoteOptional,
        hintText: l10n.rideNoteHint,
        border: InputBorder.none,
        counterText: '',
        contentPadding: const EdgeInsets.symmetric(vertical: 14),
      ),
      style: const TextStyle(fontSize: 15, height: 1.4),
    );
  }
}

/// Arguments handed from the confirmation screen to the driver search screen.
class SearchingDriverArgs {
  const SearchingDriverArgs({
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.paymentMethod,
    required this.estimate,
    required this.requestError,
    required this.rideType,
    this.rideNote,
    this.createdRide,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final PaymentMethod paymentMethod;
  final FareEstimate? estimate;
  final String? requestError;
  final RideType rideType;
  final String? rideNote;
  final Ride? createdRide;
}