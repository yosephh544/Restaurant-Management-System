import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/session.dart';
import 'core/widgets.dart';
import 'core/router.dart';

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
  @override
  void initState() {
    super.initState();
    _session = ref.read(sessionProvider.notifier);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (mounted && state == AppLifecycleState.resumed) {
      unawaited(_session.revalidate());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
      title: 'RMS Service',
      debugShowCheckedModeBanner: false,
      theme: serviceTheme(),
      routerConfig: ref.watch(routerProvider));
}
