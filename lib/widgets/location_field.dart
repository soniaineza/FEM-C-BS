import 'package:flutter/material.dart';

import '../core/constants/app_colors.dart';
import '../core/localization/app_localizations.dart';
import '../models/place.dart';

/// Tappable pickup/destination field used on Home and booking screens.
///
/// [value] is optional so the field can show an empty placeholder ready state.
class LocationField extends StatelessWidget {
  const LocationField({
    super.key,
    required this.label,
    required this.value,
    this.onTap,
    this.isPickup = false,
  });

  final String label;
  final Place? value;
  final VoidCallback? onTap;
  final bool isPickup;

  @override
  Widget build(BuildContext context) {
    final hasValue = value != null;
    final color = isPickup ? AppColors.primaryGreen : AppColors.black;
    final IconData icon = isPickup ? Icons.circle : Icons.circle_outlined;

    return Material(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: AppColors.secondaryText,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                        hasValue
                          ? value!.address
                          : (isPickup
                            ? AppLocalizations.of(context).setPickup
                            : AppLocalizations.of(context).chooseDestination),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: hasValue ? AppColors.black : AppColors.secondaryText,
                        fontSize: 15,
                        fontWeight: hasValue ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              if (onTap != null)
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.secondaryText,
                  size: 22,
                ),
            ],
          ),
        ),
      ),
    );
  }

}