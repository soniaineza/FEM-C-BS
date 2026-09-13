import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/app_exception.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../services/ride_service.dart';
import '../../widgets/custom_text_field.dart';
import '../../widgets/info_row.dart';
import '../../widgets/primary_button.dart';

/// Trip summary + rating once the ride ends (steps 22).
///
/// The rating is submitted through [RideService] and saved by the backend.
/// Until then submitting explains that saving is not connected yet — a rating
/// is never silently dropped or faked.
class RideCompletedScreen extends StatefulWidget {
  const RideCompletedScreen({super.key, required this.ride});

  final Ride ride;

  @override
  State<RideCompletedScreen> createState() => _RideCompletedScreenState();
}

class _RideCompletedScreenState extends State<RideCompletedScreen> {
  int _rating = 0;
  bool _submitting = false;
  final _comment = TextEditingController();

  String? _fare;
  Duration? _duration;

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
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submitRating() async {
    setState(() => _submitting = true);
    try {
      await rideService.rateRide(
        rideId: widget.ride.id,
        rating: _rating,
        comment: _comment.text.trim().isEmpty ? null : _comment.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thank you — your rating was saved.')),
      );
      _goHome();
    } on AppException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${e.message} Your trip is complete.')),
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
    final ride = widget.ride;
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(
        title: const Text('Trip completed'),
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
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.check_circle,
                    color: AppColors.success,
                    size: 44,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Trip completed',
                    style: TextStyle(
                      color: AppColors.black,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Divider(height: 28),
                  InfoRow(label: 'Pickup', value: ride.pickup.address),
                  const Divider(),
                  InfoRow(
                    label: 'Destination',
                    value: ride.destination.address,
                  ),
                  const Divider(),
                  InfoRow(
                    label: 'Duration',
                    value: _duration == null
                        ? '${ride.durationMinutes} min'
                        : '${_duration!.inMinutes} min',
                  ),
                  const Divider(),
                  InfoRow(
                    label: 'Distance',
                    value: '${ride.distanceKm.toStringAsFixed(1)} km',
                  ),
                  const Divider(),
                  InfoRow(label: 'Final fare', value: _fare!, bold: true),
                  const Divider(),
                  InfoRow(
                    label: 'Payment method',
                    value: ride.paymentMethod.name,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'How was your ride?',
              style: TextStyle(
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
              label: 'Comment (optional)',
              hintText: 'Tell us about your experience…',
              maxLines: 3,
            ),
            const SizedBox(height: 20),
            PrimaryButton(
              label: 'Submit rating',
              loading: _submitting,
              onPressed: _submitting ? null : _submitRating,
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _submitting ? null : _goHome,
              child: const Text('Skip'),
            ),
          ],
        ),
      ),
    );
  }
}