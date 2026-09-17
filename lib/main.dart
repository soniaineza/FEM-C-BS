import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import 'core/routes/root_router.dart';
import 'core/theme/app_theme.dart';
import 'core/localization/app_localizations.dart';
import 'core/diagnostics/app_logger.dart';

final appLocaleController = AppLocaleController();

Future<void> main() async {
  // runZonedGuarded + FlutterError.onError so an exception thrown outside an
  // explicit try/catch (in a widget build, an animation callback, a stream
  // listener, etc.) is logged instead of vanishing silently — previously
  // there was no global handler at all, so a release build could hit a
  // real error and simply go quiet with zero trace of what happened, which
  // looks identical to a freeze from the outside.
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    FlutterError.onError = (FlutterErrorDetails details) {
      AppLogger.exception('FlutterError', details.exception);
      FlutterError.presentError(details);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      AppLogger.exception('PlatformDispatcher', error);
      return true;
    };
    AppLogger.event('APP_START');
    await appLocaleController.initialize();
    runApp(const FemCabsApp());
  }, (error, stack) {
    AppLogger.exception('runZonedGuarded', error);
  });
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