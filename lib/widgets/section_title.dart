import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';

/// Section heading used consistently across screens.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.black,
        fontSize: 16,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}