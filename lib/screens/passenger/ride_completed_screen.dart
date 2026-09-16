import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/payment.dart';
import '../../models/payment_record.dart';
import '../../models/ride.dart';
import '../../services/payment_service.dart';
import '../../services/ride_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/info_row.dart';
import '../../widgets/primary_button.dart';

/// Trip summary + payment + rating once the ride ends (steps 22).
///
/// Reached for `arrived`, `paymentPending` and `completed` rides:
///  * awaiting payment -> the payment panel; cash settles with one tap, mobile
///    money / card re-checks the backend (which works the provider) and stays
///    honestly pending while the provider is not configured.
///  * paid -> the final fare + the 5-star rating, saved by the backend.
class RideCompletedScreen extends StatefulWidget {
  const RideCompletedScreen({super.key, required this.ride});

  final Ride ride;

  @override
  State<RideCompletedScreen> createState() => _RideCompletedScreenState();
}

class _RideCompletedScreenState extends State<RideCompletedScreen> {
  late Ride _ride = widget.ride;

  StreamSubscription<Ride>? _subscription;
  Timer? _paymentTimer;

  PaymentRecord? _payment;
  bool _paymentBusy = false;

  int _rating = 0;
  bool _submitting = false;
  final _comment = TextEditingController();

  String? _fare;
  Duration? _duration;

  List<RoutePoint> _routePoints = const [];
  bool _routeLoading = true;

  bool get _awaitingPayment =>
      _ride.status == RideStatus.arrived ||
      _ride.status == RideStatus.paymentPending;

  @override
  void initState() {
    super.initState();
    final ride = widget.ride;
    final finalFare = ride.finalFare;
    _fare = finalFare != null
        ? formatFare(finalFare)
        : '${formatFare(ride.estimatedFare)} (estimate)';
    final started = ride.startedAt ?? ride.createdAt;
    final ended = ride.completedAt;
    if (started != null && ended != null) {
      _duration = ended.difference(started);
    }

    _subscription = rideService.subscribeToRide(_ride.id).listen(
      _onRideUpdate,
      onError: (Object _) {},
    );
    if (_awaitingPayment) _startPayment();
    _loadRoute();
  }

  /// Fetches the actual GPS breadcrumbs recorded while the driver drove this
  /// ride, so the trip summary can show the real road path travelled instead
  /// of just a straight line between pickup and destination.
  Future<void> _loadRoute() async {
    try {
      final points = await rideService.getRideRoute(_ride.id);
      if (!mounted) return;
      setState(() {
        _routePoints = points;
        _routeLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _routeLoading = false);
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _paymentTimer?.cancel();
    _comment.dispose();
    super.dispose();
  }

  void _onRideUpdate(Ride ride) {
    if (!mounted) return;
    setState(() {
      _ride = ride;
      if (ride.completedAt != null) {
        final started = ride.startedAt ?? ride.createdAt;
        final ended = ride.completedAt;
        if (started != null && ended != null) {
          _duration = ended.difference(started);
        }
      }
      if (ride.finalFare != null) {
        _fare = formatFare(ride.finalFare!);
      }
    });
  }

  /// Ensures the backend payment exists and starts watching it.
  Future<void> _startPayment() async {
    setState(() => _paymentBusy = true);
    try {
      final payment =
          await paymentService.initiatePayment(rideId: _ride.id);
      if (!mounted) return;
      setState(() => _payment = payment);
      if (payment.status.isSettled) {
        await _reloadRide();
      } else {
        _schedulePaymentPoll();
      }
    } on AppException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _paymentBusy = false);
    }
  }

  void _schedulePaymentPoll() {
    _paymentTimer?.cancel();
    _paymentTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_payment == null || _payment!.status.isSettled) return;
      try {
        final updated = await paymentService
            .refreshPaymentStatus(paymentId: _payment!.id);
        if (!mounted) return;
        setState(() => _payment = updated);
        if (updated.status.isSettled) {
          _paymentTimer?.cancel();
          await _reloadRide();
        }
      } catch (_) {
        // Transient gateway problem; the next tick retries.
      }
    });
  }

  Future<void> _refreshPayment() async {
    setState(() => _paymentBusy = true);
    try {
      final payment =
          await paymentService.refreshPaymentStatus(paymentId: _payment!.id);
      if (!mounted) return;
      setState(() => _payment = payment);
      if (payment.status.isSettled) {
        _paymentTimer?.cancel();
        await _reloadRide();
      }
    } on AppException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _paymentBusy = false);
    }
  }

  Future<void> _confirmCash() async {
    setState(() => _paymentBusy = true);
    try {
      final settled =
          await paymentService.confirmCashPayment(rideId: _ride.id);
      if (!mounted) return;
      setState(() {
        _payment = settled;
        _paymentBusy = false;
      });
      _paymentTimer?.cancel();
      await _reloadRide();
    } on AppException catch (e) {
      if (mounted) {
        setState(() => _paymentBusy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }

  Future<void> _reloadRide() async {
    try {
      final ride = await rideService.getRideDetails(_ride.id);
      if (!mounted) return;
      setState(() => _ride = ride);
    } catch (_) {
      // The stream will still deliver the completed state shortly.
    }
  }

  Future<void> _submitRating() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _submitting = true);
    try {
      await rideService.rateRide(
        rideId: _ride.id,
        rating: _rating,
        comment: _comment.text.trim().isEmpty ? null : _comment.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.ratingSaved)),
      );
      _goHome();
    } on AppException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.ratingSaveFailed)),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _goHome() {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRoutes.home,
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final ride = _ride;

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(
        title: Text(l10n.completed),
        automaticallyImplyLeading: false,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _goHome,
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _routeMap(),
            if (_routeMapVisible) const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  Icon(
                    _awaitingPayment
                        ? Icons.payments_outlined
                        : Icons.check_circle,
                    color: _awaitingPayment
                        ? AppColors.secondaryText
                        : AppColors.success,
                    size: 44,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _awaitingPayment ? l10n.waitingForPayment : l10n.completed,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Cover the trip summary so the payment context is clear.
                  Text(
                    ride.pickup.address,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Icon(Icons.arrow_downward,
                      size: 16, color: AppColors.secondaryText),
                  Text(
                    ride.destination.address,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.black,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Divider(height: 28),
                  InfoRow(label: 'Duration', value: _durationText),
                  const Divider(),
                  InfoRow(
                    label: 'Distance',
                    value: '${ride.distanceKm.toStringAsFixed(1)} km',
                  ),
                  const Divider(),
                  InfoRow(label: 'Final fare', value: _fare!, bold: true),
                  if (ride.appliedDiscount != null &&
                      ride.appliedDiscount! > 0) ...[
                    const Divider(),
                    InfoRow(
                      label: 'Promotion discount',
                      value: '- ${formatFare(ride.appliedDiscount!)}',
                      bold: true,
                    ),
                  ],
                  const Divider(),
                  InfoRow(
                    label: 'Payment method',
                    value: ride.paymentMethod.name,
                  ),
                  if (_payment != null) ...[
                    const Divider(),
                    InfoRow(
                      label: 'Payment status',
                      value: _payment!.statusLabel,
                      bold: _payment!.status.isSettled,
                    ),
                  ],
                ],
              ),
            ),
            if (_awaitingPayment) ...[
              const SizedBox(height: 16),
              _paymentPanel(l10n),
            ] else ...[
              const SizedBox(height: 24),
              Text(
                l10n.howWasRide,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: List.generate(5, (i) {
                  final star = i + 1;
                  return IconButton(
                    onPressed: () {
                      setState(() {
                        _rating = _rating == star ? 0 : star;
                      });
                    },
                    iconSize: 36,
                    icon: Icon(
                      star <= _rating ? Icons.star : Icons.star_border,
                      color: star <= _rating
                          ? const Color(0xFFF59E0B)
                          : AppColors.border,
                    ),
                    tooltip: '$star star${star == 1 ? '' : 's'}',
                  );
                }),
              ),
              const SizedBox(height: 16),
              CustomTextField(
                controller: _comment,
                label: l10n.commentOptional,
                hintText: l10n.tellExperience,
                maxLines: 3,
              ),
              const SizedBox(height: 20),
              PrimaryButton(
                label: l10n.submitRating,
                loading: _submitting,
                onPressed: _submitting ? null : _submitRating,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _submitting ? null : _goHome,
                child: Text(l10n.skip),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String get _durationText {
    if (_duration != null) return '${_duration!.inMinutes} min';
    return '${_ride.durationMinutes} min';
  }

  bool get _routeMapVisible =>
      _ride.pickup.hasCoordinates && _ride.destination.hasCoordinates;

  /// The actual road path the trip took, drawn from recorded GPS breadcrumbs.
  /// Falls back to a straight pickup -> destination line only while those
  /// breadcrumbs are still loading or none were recorded for this trip (e.g.
  /// a very short ride, or an older trip from before this feature).
  Widget _routeMap() {
    if (!_routeMapVisible) return const SizedBox.shrink();

    final pickup = _ride.pickup;
    final destination = _ride.destination;
    final pickupPoint = LatLng(pickup.latitude!, pickup.longitude!);
    final destinationPoint = LatLng(
      destination.latitude!,
      destination.longitude!,
    );

    final hasActualRoute = _routePoints.length >= 2;
    final routeLine = hasActualRoute
        ? _routePoints.map((p) => LatLng(p.latitude, p.longitude)).toList()
        : [pickupPoint, destinationPoint];

    final allPoints = [pickupPoint, destinationPoint, ...routeLine];
    final latMin =
        allPoints.map((p) => p.latitude).reduce((a, b) => a < b ? a : b);
    final latMax =
        allPoints.map((p) => p.latitude).reduce((a, b) => a > b ? a : b);
    final lngMin =
        allPoints.map((p) => p.longitude).reduce((a, b) => a < b ? a : b);
    final lngMax =
        allPoints.map((p) => p.longitude).reduce((a, b) => a > b ? a : b);
    final center = LatLng((latMin + latMax) / 2, (lngMin + lngMax) / 2);
    final latSpan =
        (latMax - latMin).abs() < 0.001 ? 0.0015 : (latMax - latMin) * 1.4;
    final lngSpan =
        (lngMax - lngMin).abs() < 0.001 ? 0.0015 : (lngMax - lngMin) * 1.4;
    final zoom = latSpan > 0.09 || lngSpan > 0.09
        ? 12.0
        : latSpan > 0.02 || lngSpan > 0.02
            ? 13.5
            : 15.0;

    return Container(
      height: 220,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          FlutterMap(
            options: MapOptions(initialCenter: center, initialZoom: zoom),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.femcabs.fem_cabs',
              ),
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: routeLine,
                    strokeWidth: 4,
                    color: AppColors.primaryGreen,
                  ),
                ],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: pickupPoint,
                    width: 34,
                    height: 34,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.primaryGreen,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.white, width: 3),
                      ),
                      child: const Icon(Icons.person,
                          color: AppColors.white, size: 16),
                    ),
                  ),
                  Marker(
                    point: destinationPoint,
                    width: 34,
                    height: 34,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.darkGreen,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.white, width: 3),
                      ),
                      child: const Icon(Icons.square_foot,
                          color: AppColors.white, size: 16),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (_routeLoading)
            const Positioned(
              top: 8,
              right: 8,
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.primaryGreen,
                ),
              ),
            ),
          if (!_routeLoading && !hasActualRoute)
            Positioned(
              left: 8,
              bottom: 8,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Route not recorded for this trip',
                  style: TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _paymentPanel(AppLocalizations l10n) {
    if (_payment == null && _paymentBusy) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(color: AppColors.primaryGreen),
        ),
      );
    }

    final method = _ride.paymentMethod;

    if (method.type == PaymentMethodType.cash) {
      return PrimaryButton(
        label: l10n.confirmCashPayment,
        loading: _paymentBusy,
        onPressed: _paymentBusy ? null : _confirmCash,
      );
    }

    if (_payment == null) {
      return PrimaryButton(
        label: l10n.preparePayment,
        loading: _paymentBusy,
        onPressed: _paymentBusy ? null : _startPayment,
      );
    }

    if (_payment!.status.isSettled) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(8),
          child: Text(
            'Payment received',
            style: TextStyle(
              color: AppColors.success,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      );
    }

    final reference = _payment!.externalReference ?? _payment!.reference;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.lightGray,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.paymentPendingNotice,
                style: const TextStyle(
                  color: AppColors.black,
                  fontSize: 13,
                  height: 1.45,
                ),
              ),
              if (reference != null) ...[
                const SizedBox(height: 6),
                Text(
                  l10n.paymentReference(reference),
                  style: const TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        PrimaryButton(
          label: l10n.checkPaymentStatus,
          loading: _paymentBusy,
          onPressed: _paymentBusy ? null : _refreshPayment,
        ),
      ],
    );
  }
}