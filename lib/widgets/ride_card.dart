import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';
import '../models/ride.dart';

/// A single ride shown in history — date, route, fare and status.
class RideCard extends StatelessWidget {
  const RideCard({
    super.key,
    required this.ride,
    this.onTap,
  });

  final Ride ride;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  _formatDate(ride.createdAt ?? DateTime.now()),
                  style: const TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                _StatusChip(status: ride.status),
              ],
            ),
            const SizedBox(height: 12),
            _RouteRow(
              icon: Icons.circle,
              iconColor: AppColors.primaryGreen,
              label: ride.pickup.address,
            ),
            const SizedBox(height: 8),
            _RouteRow(
              icon: Icons.location_on_outlined,
              iconColor: AppColors.black,
              label: ride.destination.address,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.directions_car_outlined,
                    size: 16, color: AppColors.secondaryText),
                const SizedBox(width: 6),
                Text(
                  ride.vehicle.name,
                  style: const TextStyle(
                    color: AppColors.secondaryText,
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                Text(
                  formatFare(ride.finalFare ?? ride.estimatedFare),
                  style: const TextStyle(
                    color: AppColors.black,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final onDate = DateTime(date.year, date.month, date.day);
    final today = DateTime(now.year, now.month, now.day);
    final dayDiff = today.difference(onDate).inDays;
    final time =
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    switch (dayDiff) {
      case 0:
        return 'Today, $time';
      case 1:
        return 'Yesterday, $time';
      default:
        const months = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        ];
        return '${date.day} ${months[date.month - 1]} ${date.year}, $time';
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final RideStatus status;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (status) {
      RideStatus.completed => (AppColors.success.withValues(alpha: 0.12), AppColors.darkGreen),
      RideStatus.cancelled => (AppColors.error.withValues(alpha: 0.08), AppColors.error),
      _ => (AppColors.lightGray, AppColors.secondaryText),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: fg,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({
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
      children: [
        Icon(icon, size: 10, color: iconColor),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.black,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}