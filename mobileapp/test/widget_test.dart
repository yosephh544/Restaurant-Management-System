import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/core/widgets.dart';
import 'package:mobileapp/main.dart';
import 'support.dart';

Future<void> finish(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

void go(WidgetTester tester, String route) =>
    ProviderScope.containerOf(tester.element(find.byType(RmsApp)))
        .read(routerProvider)
        .go(route);
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cashier creates a phone test session with the entered tip',
      (tester) async {
    final backend = FakeRestaurant('Cashier');
    final adapter = FakeAdapter(backend.handle);
    await pumpApp(tester, backend, adapter: adapter);
    go(tester, '/orders/$orderId');
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Create test payment'));
    await tester.enterText(find.byType(TextFormField).at(0), '+251922222222');
    await tester.enterText(find.byType(TextFormField).at(1), '50.00');
    await tapVisible(tester, find.text('Create test session'));
    final request = adapter.requests
        .firstWhere((r) => r.uri.path.endsWith('/arifpay/initiate'));
    expect(request.data['method'], 'PHONE_PUSH');
    expect(request.data['tipAmount'], 50);
    expect(request.data['customerPhone'], '+251922222222');
    expect(find.text('Test payment session'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('cashier retracts a pending session and sees the updated status',
      (tester) async {
    final backend = FakeRestaurant('Cashier');
    final vault = MemoryVault();
    await LocalWorkspace(vault, testServer, userId)
        .saveSession(PaymentSession.fromJson(paymentJson()));
    await pumpApp(tester, backend, vault: vault);
    go(tester, '/sessions/$paymentId');
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Retract test session'));
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(backend.sessionStatus, 'RETRACTED');
    expect(
        find.text('Backend-reported test status: Retracted.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('sign-in validates PIN and opens the waiter workspace',
      (tester) async {
    await pumpApp(tester, FakeRestaurant(), signedIn: false);
    await tapVisible(tester, find.text('Sign in'));
    await tester.pump();
    expect(find.text('Enter a 4–6 digit PIN.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), '+251911111111');
    await tester.enterText(find.byType(TextFormField).at(1), '1234');
    await tapVisible(tester, find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Hello, Abebe.'), findsOneWidget);
    expect(find.text('Table T12'), findsOneWidget);
    expect(find.text('Tips'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('menu blocks unavailable dishes and works on a narrow phone',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpApp(tester, FakeRestaurant()..available = false);
    go(tester, '/menu');
    await tester.pumpAndSettle();
    final button = tester.widget<OutlinedButton>(find
        .ancestor(
            of: find.text('Add to order'),
            matching: find.byWidgetPredicate((w) => w is OutlinedButton))
        .first);
    expect(button.onPressed, isNull);
    expect(find.text('Unavailable'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets(
      'cart preserves a draft and blocks repeated submission after timeout',
      (tester) async {
    final backend = FakeRestaurant()..timeoutCreate = true;
    final adapter = FakeAdapter(backend.handle);
    final vault = await pumpApp(tester, backend, adapter: adapter);
    go(tester, '/orders/new?item=$itemId');
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'T12');
    await tapVisible(tester, find.text('Create order'));
    expect(find.text('Check existing orders'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(find
                .ancestor(
                    of: find.text('Create order'),
                    matching: find.byWidgetPredicate((w) => w is FilledButton))
                .first)
            .onPressed,
        isNull);
    await tester.pump(const Duration(milliseconds: 500));
    expect(vault.values.keys.any((k) => k.startsWith('draft/')), isTrue);
    expect(
        adapter.requests
            .where((r) => r.method == 'POST' && r.uri.path.endsWith('/orders'))
            .length,
        1);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('kitchen starts preparation then marks an order ready',
      (tester) async {
    final backend = FakeRestaurant('Kitchen');
    await pumpApp(tester, backend);
    await tapVisible(tester, find.text('Open order'));
    expect(find.text('No spicy sauce'), findsOneWidget);
    await tapVisible(tester, find.text('Start preparation'));
    expect(backend.status, 'PREPARING');
    await tapVisible(tester, find.text('Mark ready'));
    expect(backend.status, 'READY');
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('cancellation requires a written explanation', (tester) async {
    final backend = FakeRestaurant('Kitchen');
    final adapter = FakeAdapter(backend.handle);
    await pumpApp(tester, backend, adapter: adapter);
    go(tester, '/orders/$orderId');
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Cancel item'));
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm cancellation'));
    await tester.pumpAndSettle();
    expect(
        find.text('A cancellation explanation is required.'), findsOneWidget);
    await tester.enterText(
        find.byType(TextFormField), 'Ingredient unavailable');
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm cancellation'));
    await tester.pumpAndSettle();
    final request =
        adapter.requests.firstWhere((r) => r.uri.path.endsWith('/cancel'));
    expect(request.data['reasonNote'], 'Ingredient unavailable');
    expect(request.data['orderItemId'], 'line-1');
    expect(find.textContaining('still included in the server total'),
        findsOneWidget);
    await finish(tester);
  });
  testWidgets(
      'cashier test QR uses returned payload and reflects backend status',
      (tester) async {
    final backend = FakeRestaurant('Cashier');
    final vault = MemoryVault();
    await LocalWorkspace(vault, testServer, userId)
        .saveSession(PaymentSession.fromJson(paymentJson()));
    await pumpApp(tester, backend, vault: vault);
    go(tester, '/sessions/$paymentId');
    await tester.pumpAndSettle();
    expect(find.text('TEST QR — NOT FOR PAYMENT'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.text(paymentJson()['qrData'] as String), findsOneWidget);
    backend.sessionStatus = 'PAID';
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.text('Backend-reported test status: Paid.'), findsOneWidget);
    expect(find.text('Retract test session'), findsNothing);
    await finish(tester);
  });
  testWidgets(
      'cancelled lines block cashier checkout and preserve server total',
      (tester) async {
    await pumpApp(tester, FakeRestaurant('Cashier')..cancelledItem = true);
    go(tester, '/orders/$orderId');
    await tester.pumpAndSettle();
    expect(find.text('Create test payment'), findsNothing);
    expect(find.textContaining('still included in the server total'),
        findsOneWidget);
    expect(find.text('ETB 517.50'), findsOneWidget);
    await finish(tester);
  });
  testWidgets('tip ledger labels page totals and account scope',
      (tester) async {
    await pumpApp(tester, FakeRestaurant());
    go(tester, '/tips');
    await tester.pumpAndSettle();
    expect(find.text('Tips on this page'), findsOneWidget);
    expect(find.text('ETB 50.00'), findsNWidgets(2));
    expect(find.text('Unsettled'), findsOneWidget);
    await finish(tester);
  });
  testWidgets('polling pauses in background, resumes, and stops on disposal',
      (tester) async {
    var calls = 0;
    final pending = Completer<int>();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: AsyncPane<int>(
                interval: const Duration(seconds: 5),
                load: () async {
                  calls++;
                  return calls == 2 ? pending.future : calls;
                },
                builder: (data, refresh) => Text('$data')))));
    await tester.pumpAndSettle();
    expect(calls, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 20));
    expect(calls, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(calls, 2);
    await tester.pump(const Duration(seconds: 15));
    expect(calls, 2);
    pending.complete(2);
    await tester.pumpAndSettle();
    await finish(tester);
    await tester.pump(const Duration(seconds: 20));
    expect(calls, 2);
  });
}
