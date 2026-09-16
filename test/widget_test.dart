import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:fem_cabs/main.dart';
import 'package:fem_cabs/core/localization/app_localizations.dart';
import 'package:fem_cabs/models/passenger.dart';
import 'package:fem_cabs/services/auth_service.dart';
import 'package:fem_cabs/widgets/brand_mark.dart';
import 'package:fem_cabs/widgets/primary_button.dart';

void main() {
  setUpAll(() {
    // Tests must never try to download font files.
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    authService.currentUser.value = null;
  });

  testWidgets('splash shows brand then opens the welcome screen',
      (WidgetTester tester) async {
    const l10n = AppLocalizations(Locale('rw'));
    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();

    // Splash is visible first.
    expect(find.text('Safe and reliable rides, whenever you need them.'),
        findsNothing);
    expect(find.byType(BrandMark), findsOneWidget);

    // After the splash delay the router moves to welcome.
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    expect(find.text(l10n.getStarted), findsOneWidget);
  });

  testWidgets('welcome navigates to signup', (WidgetTester tester) async {
    const l10n = AppLocalizations(Locale('rw'));
    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.getStarted));
    await tester.pumpAndSettle();

    // The signup form is shown (its heading and button share the same label).
    expect(find.text(l10n.fullName), findsOneWidget);
    expect(find.text(l10n.createAccount), findsWidgets);
  });

  testWidgets('login validates empty fields', (WidgetTester tester) async {
    const l10n = AppLocalizations(Locale('rw'));
    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.login));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.login));
    await tester.pumpAndSettle();

    expect(find.text(l10n.identifierRequired), findsOneWidget);
    expect(find.text(l10n.enterPassword), findsOneWidget);
  });

  testWidgets('login rejects an invalid identifier',
      (WidgetTester tester) async {
    const l10n = AppLocalizations(Locale('rw'));
    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.login));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'not-an-email');
    await tester.enterText(find.byType(TextFormField).at(1), 'Passw0rd1');
    await tester.tap(find.text(l10n.login));
    await tester.pumpAndSettle();

    expect(find.text(l10n.invalidIdentifier), findsOneWidget);
  });

  testWidgets('signup form validates the phone number',
      (WidgetTester tester) async {
    const l10n = AppLocalizations(Locale('rw'));
    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.getStarted));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).at(1), '0788');
    await tester.ensureVisible(find.widgetWithText(PrimaryButton, l10n.createAccount));
    await tester.tap(find.widgetWithText(PrimaryButton, l10n.createAccount));
    await tester.pumpAndSettle();

    expect(find.text(l10n.phoneInvalid), findsOneWidget);
  });

  testWidgets('a completed session opens the main passenger home',
      (WidgetTester tester) async {
    authService.currentUser.value = Passenger(
      id: 'dev_test',
      fullName: 'Test Passenger',
      phone: '+250788123456',
      email: 'test@example.com',
      isProfileComplete: true,
      isDevPreview: true,
    );

    await tester.pumpWidget(const FemCabsApp());
    await tester.pump();
    await tester.pumpAndSettle();

    // The main shell with the Home destination is shown.
    const l10n = AppLocalizations(Locale('rw'));
    expect(find.text(l10n.activity), findsOneWidget);
    expect(find.text(l10n.profile), findsOneWidget);
    expect(
      find.textContaining(RegExp(
        '${l10n.goodMorning}|${l10n.goodAfternoon}|${l10n.goodEvening}',
      )),
      findsOneWidget,
    );
    expect(find.textContaining('Test'), findsWidgets);
  });
}