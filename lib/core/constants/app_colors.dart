import 'package:flutter/material.dart';

/// FEM C@BS brand palette.
///
/// Green is used for primary actions, important indicators and branding.
/// Black is used for major headings and important text.
/// White surfaces keep the design clean and consistent.
class AppColors {
  AppColors._();

  static const Color primaryGreen = Color(0xFF16A34A);
  static const Color darkGreen = Color(0xFF15803D);
  static const Color black = Color(0xFF111111);
  static const Color white = Color(0xFFFFFFFF);
  static const Color lightBackground = Color(0xFFF7F7F7);
  static const Color lightGray = Color(0xFFF5F5F5);
  static const Color border = Color(0xFFE5E7EB);
  static const Color secondaryText = Color(0xFF6B7280);
  static const Color error = Color(0xFFDC2626);
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);

  /// A slightly deeper shade of the brand green, used for gradients so flat
  /// green surfaces (the brand mark, hero panels) read as intentional rather
  /// than a plain fill.
  static const Color greenGradientEnd = Color(0xFF0F7A38);
}

/// Soft, low-opacity shadows used sparingly to lift key surfaces (the
/// primary CTA, floating cards) off the flat, bordered-card look without
/// tipping the app into a heavy, skeuomorphic style.
class AppShadows {
  AppShadows._();

  static const List<BoxShadow> card = [
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  static const List<BoxShadow> raised = [
    BoxShadow(
      color: Color(0x14000000),
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];

  static List<BoxShadow> tinted(Color color, {double opacity = 0.28}) => [
        BoxShadow(
          color: color.withValues(alpha: opacity),
          blurRadius: 18,
          offset: const Offset(0, 8),
        ),
      ];
}