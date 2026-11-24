import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/session.dart';
import 'core/language.dart';
import 'core/widgets.dart';
import 'core/router.dart';
import 'core/order_alerts.dart';
import 'core/order_alert_providers.dart';
import 'features/notifications/notifications_sheet.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  runApp(ProviderScope(
      overrides: [preferencesProvider.overrideWithValue(preferences)],
      child: const RmsApp()));
}

class RmsApp extends ConsumerStatefulWidget {
  const RmsApp({super.key});
  @override
  ConsumerState<RmsApp> createState() => _RmsAppState();
}

class _RmsAppState extends ConsumerState<RmsApp> with WidgetsBindingObserver {
  late SessionController _session;
  late OrderAlertsController _alerts;
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  @override
  void initState() {
    super.initState();
    _session = ref.read(sessionProvider.notifier);
    _alerts = ref.read(orderAlertsProvider.notifier);
    _alerts.onOpen = (alert) {
      if (mounted) ref.read(routerProvider).go(alert.route);
    };
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _alerts.setForeground(
        lifecycle == null || lifecycle == AppLifecycleState.resumed);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _alerts.setForeground(state == AppLifecycleState.resumed);
    if (mounted && state == AppLifecycleState.resumed) {
      unawaited(_session.revalidate());
    }
  }

  @override
  void dispose() {
    _alerts.setForeground(false);
    _alerts.onOpen = null;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(orderAlertsProvider, (before, after) {
      if (before?.delivery == after.delivery || after.recent.isEmpty) return;
      final alerts = after.recent;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            !_alerts.foreground ||
            _alerts.currentScope != alerts.first.scope) {
          return;
        }
        final strings = AppStrings(ref.read(languageProvider));
        final message = alerts.length == 1
            ? '${strings.text(alerts.first.title)}: ${strings.text(alerts.first.body)}'
            : strings.text('${alerts.length} new order alerts');
        final messenger = _messenger.currentState;
        messenger?.hideCurrentSnackBar();
        messenger?.showSnackBar(SnackBar(
            content: AppText(message, translate: false),
            duration: const Duration(seconds: 5),
            persist: false,
            action: SnackBarAction(
                label: strings.text('View'),
                onPressed: () {
                  if (_alerts.currentScope != alerts.first.scope) return;
                  if (alerts.length == 1) {
                    _alerts.open(alerts.first);
                  } else {
                    final context = ref
                        .read(routerProvider)
                        .routerDelegate
                        .navigatorKey
                        .currentState
                        ?.overlay
                        ?.context;
                    if (context != null) showOrderNotifications(context);
                  }
                })));
      });
    });
    return MaterialApp.router(
        locale: ref.watch(languageProvider),
        supportedLocales: supportedAppLocales,
        localizationsDelegates: const [
          AppStringsDelegate(),
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        scaffoldMessengerKey: _messenger,
        title: restaurantName,
        debugShowCheckedModeBanner: false,
        theme: serviceTheme(),
        routerConfig: ref.watch(routerProvider));
  }
}
