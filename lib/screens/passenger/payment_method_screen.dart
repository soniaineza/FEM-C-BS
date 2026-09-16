import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/routes/app_routes.dart';
import '../../models/payment.dart';
import '../../models/place.dart';
import '../../models/ride.dart';
import '../../models/ride_type.dart';
import '../../models/vehicle.dart';
import '../../services/payment_service.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/section_title.dart';

/// Payment method selection (step 15).
///
/// Choosing here only records the passenger's preference. Processing runs on
/// the backend through real providers — this app never stores card numbers,
/// CVVs or mobile-money PINs.
class PaymentMethodScreen extends StatefulWidget {
  const PaymentMethodScreen({
    super.key,
    required this.pickup,
    required this.destination,
    required this.vehicle,
    required this.estimate,
    required this.rideType,
  });

  final Place pickup;
  final Place destination;
  final Vehicle vehicle;
  final FareEstimate? estimate;
  final RideType rideType;

  @override
  State<PaymentMethodScreen> createState() => _PaymentMethodScreenState();
}

class _PaymentMethodScreenState extends State<PaymentMethodScreen> {
  late final List<PaymentMethod> _methods =
      paymentService.getAvailableMethods();
  String _selectedId = PaymentMethod.defaults.first.id;

  PaymentMethod get _selected =>
      _methods.firstWhere((m) => m.id == _selectedId);

  void _continue() {
    Navigator.of(context).pushNamed(
      AppRoutes.confirmRide,
      arguments: (
        widget.pickup,
        widget.destination,
        widget.vehicle,
        widget.estimate,
        _selected,
        widget.rideType,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.paymentMethod)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            SectionTitle(l10n.howPay),
            const SizedBox(height: 12),
            ..._methods.map(
              (m) => _PaymentTile(
                method: m,
                selected: m.id == _selectedId,
                onTap: () => setState(() => _selectedId = m.id),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.paymentSecurityNotice,
              style: TextStyle(
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
          color: AppColors.white,
          child: PrimaryButton(
            label: l10n.continueLabel,
            onPressed: _continue,
          ),
        ),
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({
    required this.method,
    required this.selected,
    required this.onTap,
  });

  final PaymentMethod method;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? AppColors.primaryGreen : AppColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                _LeadingIcon(method: method),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.paymentName(method),
                        style: const TextStyle(
                          color: AppColors.black,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        method.detail,
                        style: const TextStyle(
                          color: AppColors.secondaryText,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: selected
                      ? AppColors.primaryGreen
                      : AppColors.secondaryText,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LeadingIcon extends StatelessWidget {
  const _LeadingIcon({required this.method});

  final PaymentMethod method;

  @override
  Widget build(BuildContext context) {
    final icon = switch (method.type) {
      PaymentMethodType.cash => Icons.payments_outlined,
      PaymentMethodType.mobileMoney => Icons.smartphone,
      PaymentMethodType.card => Icons.credit_card,
    };
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.1),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: AppColors.primaryGreen, size: 22),
    );
  }
}