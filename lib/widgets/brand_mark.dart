import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';

/// FEM C@BS wordmark used on the splash and welcome screens.
class BrandMark extends StatelessWidget {
  const BrandMark({
    super.key,
    this.fontSize = 28,
    this.withIcon = true,
  });

  final double fontSize;
  final bool withIcon;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (withIcon) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: AppColors.primaryGreen,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.directions_car_filled,
              color: AppColors.white,
              size: 34,
            ),
          ),
          const SizedBox(height: 18),
        ],
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'FEM',
              style: TextStyle(
                color: AppColors.black,
                fontSize: fontSize,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              'C@BS',
              style: TextStyle(
                color: AppColors.primaryGreen,
                fontSize: fontSize,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      ],
    );
  }
}