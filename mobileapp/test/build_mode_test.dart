import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/session.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign-in shows developer controls only in debug', (tester) async {
    await pumpApp(tester, FakeRestaurant(), signedIn: false);
    expect(find.text('Sign in'), findsWidgets);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(find.text('Server'), kDebugMode ? findsOneWidget : findsNothing);
    expect(find.text('Add quick sign-in account'),
        kDebugMode ? findsOneWidget : findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  test('saved test servers override the build URL only in debug', () async {
    const savedServer = 'https://saved-test.example/api/v1';
    SharedPreferences.setMockInitialValues({'server': savedServer});
    final preferences = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      preferencesProvider.overrideWithValue(preferences),
    ]);
    addTearDown(container.dispose);

    final api = container.read(apiClientProvider);
    final expectedServer = kDebugMode ? savedServer : defaultServer;
    expect(api.dio.options.baseUrl,
        expectedServer.isEmpty ? '' : '$expectedServer/');
    api.dio.close();
  });

  test('server changes are rejected outside debug without changing storage',
      () async {
    const oldServer = 'https://restaurant.example/api/v1';
    const newServer = 'https://another-test.example/api/v1';
    SharedPreferences.setMockInitialValues({'server': oldServer});
    final preferences = await SharedPreferences.getInstance();
    final api = ApiClient(oldServer, transport: Dio());
    final controller = SessionController(api, MemoryVault(), preferences);
    addTearDown(controller.dispose);
    addTearDown(api.dio.close);

    if (kDebugMode) {
      await controller.setServer(newServer);
      expect(controller.server, newServer);
      expect(preferences.getString('server'), newServer);
    } else {
      await expectLater(
          controller.setServer(newServer), throwsA(isA<ApiException>()));
      expect(controller.server, oldServer);
      expect(preferences.getString('server'), oldServer);
    }
  });

  test('non-debug startup clears test accounts even without a configured URL',
      () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final vault = MemoryVault();
    vault.values['temporary_quick_login'] = '{"accounts":[]}';
    final api = ApiClient('');
    final controller = SessionController(api, vault, preferences);
    addTearDown(controller.dispose);
    addTearDown(api.dio.close);

    await controller.restore();

    expect(controller.state.ready, isTrue);
    expect(vault.values.containsKey('temporary_quick_login'), kDebugMode);
    expect(await controller.quickLoginAccounts(), isEmpty);
  });
}
