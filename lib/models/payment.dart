import '../core/localization/app_localizations.dart';

enum PaymentMethodType { cash, mobileMoney, card }

/// A way for the passenger to pay.
///
/// Selection only — processing is handled by `PaymentService` and, later, by
/// real providers (MTN Mobile Money, Airtel Money, card). Raw card numbers or
/// CVVs are never stored in this application.
class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.name,
    required this.type,
    this.detail = '',
  });

  final String id;
  final String name;
  final PaymentMethodType type;
  final String detail;

  bool get isMobileMoney => type == PaymentMethodType.mobileMoney;
  bool get isCard => type == PaymentMethodType.card;

  String get nameForLocale => name;

  String detailFor(AppLocalizations l10n) => switch (id) {
        'cash' => l10n.payDriverDirectly,
        'mtn_momo' => l10n.payWithMomo,
        'airtel_money' => l10n.payWithAirtel,
        'card' => l10n.payWithCard,
        _ => detail,
      };

  static const List<PaymentMethod> defaults = [
    PaymentMethod(
      id: 'cash',
      name: 'Cash',
      type: PaymentMethodType.cash,
      detail: 'Pay the driver directly',
    ),
    PaymentMethod(
      id: 'mtn_momo',
      name: 'MTN Mobile Money',
      type: PaymentMethodType.mobileMoney,
      detail: 'Pay with MoMo',
    ),
    PaymentMethod(
      id: 'airtel_money',
      name: 'Airtel Money',
      type: PaymentMethodType.mobileMoney,
      detail: 'Pay with Airtel Money',
    ),
    PaymentMethod(
      id: 'card',
      name: 'Card',
      type: PaymentMethodType.card,
      detail: 'Pay with a bank card',
    ),
  ];
}