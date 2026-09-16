import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/localization/app_localizations.dart';
import 'routes/driver_root_router.dart';
import 'services/driver_auth_service.dart';

final appLocaleController = AppLocaleController();

/// FEM C@BS driver ride-hailing application.
///
/// This is a separate entry point from the passenger app. Build with:
///     flutter run -t lib/driver/main.dart
///     flutter build apk -t lib/driver/main.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await appLocaleController.initialize();
  await driverAuthService.initialize();
  runApp(const FemCabsDriverApp());
}

/// FEM C@BS driver application.
class FemCabsDriverApp extends StatelessWidget {
  const FemCabsDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: appLocaleController,
      builder: (context, _) => MaterialApp(
        title: 'FEM C@BS Driver',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        locale: appLocaleController.locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          AppLocalizations.materialDelegate,
          AppLocalizations.widgetsDelegate,
          AppLocalizations.cupertinoDelegate,
        ],
        home: const DriverRootRouter(),
      ),
    );
  }
}
