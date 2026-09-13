import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../models/payment.dart';
import '../../services/payment_service.dart';

/// Available payment methods for the passenger (step 30).
///
/// The list reflects what FEM C@BS supports. Real wallets/Momo accounts are
/// verified once the backend is connected.
class PaymentMethodsScreen extends StatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  List<PaymentMethod>? _methods;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final methods = paymentService.getAvailableMethods();
    setState(() => _methods = methods);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: const Text('Payment methods')),
      body: SafeArea(
        child: _methods == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  ..._methods!.map((m) => _MethodTile(method: m)),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline,
                            color: AppColors.secondaryText, size: 18),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Default method and wallet verification will be '
                            'managed here once the backend is connected.',
                            style: TextStyle(
                              color: AppColors.secondaryText,
                              fontSize: 12.5,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({required this.method});

  final PaymentMethod method;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.primaryGreen.withValues(alpha: 0.12),
              child: Icon(
                method.isMobileMoney
                    ? Icons.phone_android
                    : method.isCard
                        ? Icons.credit_card
                        : Icons.payments_outlined,
                color: AppColors.primaryGreen,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    method.name,
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
            const Icon(
              Icons.check_circle_outline,
              color: AppColors.secondaryText,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}