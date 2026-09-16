import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../models/driver_ride.dart';
import '../../services/driver_ride_service.dart';

/// Detailed view of a completed/cancelled ride for the driver.
class DriverRideDetailsScreen extends StatefulWidget {
  const DriverRideDetailsScreen({super.key, this.rideId});

  final String? rideId;

  @override
  State<DriverRideDetailsScreen> createState() => _DriverRideDetailsScreenState();
}

class _DriverRideDetailsScreenState extends State<DriverRideDetailsScreen> {
  DriverRide? _ride;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.rideId == null) {
      setState(() { _loading = false; });
      return;
    }
    try {
      final ride = await driverRideService.getRideDetails(widget.rideId!);
      if (mounted) setState(() { _ride = ride; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final ride = _ride;

    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.rideDetails)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ride == null
              ? const Center(child: Text('Ride not found'))
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    _InfoCard(
                      children: [
                        _DetailRow(label: 'Status', value: ride.status.toUpperCase()),
                        _DetailRow(label: 'Ride type', value: ride.rideType),
                        _DetailRow(label: 'Distance', value: '${ride.distanceKm.toStringAsFixed(1)} km'),
                        _DetailRow(label: 'Duration', value: '${ride.durationMinutes} min'),
                        _DetailRow(label: 'Estimated fare', value: '${ride.estimatedFare.round()} RWF'),
                        if (ride.finalFare != null)
                          _DetailRow(label: 'Final fare', value: '${ride.finalFare!.round()} RWF'),
                        _DetailRow(label: 'Payment', value: ride.paymentMethod),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _InfoCard(
                      children: [
                        const Text('Pickup', style: TextStyle(color: AppColors.secondaryText, fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(ride.pickupAddress, style: const TextStyle(
                          color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 16),
                        const Text('Destination', style: TextStyle(color: AppColors.secondaryText, fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(ride.destAddress, style: const TextStyle(
                          color: AppColors.black, fontSize: 14, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    if (ride.rating != null) ...[
                      const SizedBox(height: 16),
                      _InfoCard(
                        children: [
                          Row(
                            children: [
                              const Text('Rating', style: TextStyle(color: AppColors.secondaryText)),
                              const Spacer(),
                              ...List.generate(5, (i) => Icon(
                                i < ride.rating! ? Icons.star : Icons.star_border,
                                color: const Color(0xFFF59E0B),
                                size: 20,
                              )),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(label, style: const TextStyle(color: AppColors.secondaryText, fontSize: 13)),
          const Spacer(),
          Text(value, style: const TextStyle(color: AppColors.black, fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
