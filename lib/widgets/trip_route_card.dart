import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';
import '../models/place.dart';

/// Compact pickup → destination summary used on booking screens.
class TripRouteCard extends StatelessWidget {
  const TripRouteCard({
    super.key,
    required this.pickup,
    required this.destination,
    this.distanceKm,
    this.durationMinutes,
  });

  final Place pickup;
  final Place destination;
  final double? distanceKm;
  final int? durationMinutes;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _AddressLine(
                  icon: Icons.circle,
                  iconColor: AppColors.primaryGreen,
                  label: pickup.address,
                ),
                Container(
                  height: 18,
                  margin: const EdgeInsets.only(left: 4.5),
                  child: const VerticalDivider(
                    color: AppColors.border,
                    thickness: 1.6,
                    width: 1,
                  ),
                ),
                _AddressLine(
                  icon: Icons.location_on_outlined,
                  iconColor: AppColors.black,
                  label: destination.address,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (distanceKm != null)
            Column(
              children: [
                const Icon(
                  Icons.straighten,
                  color: AppColors.secondaryText,
                  size: 16,
                ),
                const SizedBox(height: 4),
                Text(
                  '${distanceKm!.toStringAsFixed(1)} km',
                  style: const TextStyle(
                    color: AppColors.black,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (durationMinutes != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    '~$durationMinutes min',
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

class _AddressLine extends StatelessWidget {
  const _AddressLine({
    required this.icon,
    required this.iconColor,
    required this.label,
  });

  final IconData icon;
  final Color iconColor;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Icon(icon, size: 10, color: iconColor),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.black,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}