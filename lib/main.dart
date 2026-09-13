import 'package:flutter/material.dart';

import 'core/routes/root_router.dart';
import 'core/theme/app_theme.dart';
import 'core/localization/app_localizations.dart';

final appLocaleController = AppLocaleController();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await appLocaleController.initialize();
  runApp(const FemCabsApp());
}

/// FEM C@BS passenger ride-hailing application for Rwanda.
class FemCabsApp extends StatelessWidget {
  const FemCabsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: appLocaleController,
      builder: (context, _) => MaterialApp(
        title: 'FEM C@BS',
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
        home: const RootRouter(),
      ),
    );
  }
}