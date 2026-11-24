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
  testWidgets('cashier retracts a pending session and sees the updated status',
      (tester) async {
    final backend = FakeRestaurant('Cashier');
    final vault = MemoryVault();
    await LocalWorkspace(vault, testServer, userId)
        .saveSession(PaymentSession.fromJson(paymentJson()));
    await pumpApp(tester, backend, vault: vault);
    go(tester, '/sessions/$paymentId');
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Cancel test payment'));
    await tester.tap(find.widgetWithText(FilledButton, 'Cancel payment'));
    await tester.pumpAndSettle();
    expect(backend.sessionStatus, 'RETRACTED');
    expect(find.text('Retracted'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  testWidgets('sign-in validates PIN and opens the waiter workspace',
      (tester) async {
    await pumpApp(tester, FakeRestaurant(), signedIn: false);
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(find.text('Enter a 4–6 digit PIN.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), '+251911111111');
    await tester.enterText(find.byType(TextFormField).at(1), '1234');
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Your orders'), findsOneWidget);
    expect(find.text('Table T12'), findsOneWidget);
    expect(find.text('New order'), findsWidgets);
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
    go(tester, '/orders/new');
    await tester.pumpAndSettle();
    expect(find.text('Unavailable'), findsOneWidget);
    expect(
        tester
            .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.add))
            .onPressed,
        isNull);
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
    await tapVisible(tester, find.text('Review order'));
    final tableField = find
        .byWidgetPredicate((w) => w is DropdownButtonFormField<String>)
        .last;
    await tester.tap(tableField);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Table T12').last);
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Send order'));
    expect(find.text('Check Orders before sending this order again.'),
        findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(find
                .ancestor(
                    of: find.text('Send order'),
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
    await tapVisible(tester, find.text('#1042'));
    expect(find.text('No spicy sauce'), findsOneWidget);
    await tapVisible(tester, find.text('Start preparing'));
    expect(backend.status, 'PREPARING');
    await tapVisible(tester, find.text('Ready all'));
    expect(backend.status, 'READY');
    expect(tester.takeException(), isNull);
    await finish(tester);
  });
  for (final item in [false, true]) {
    testWidgets('cancel ${item ? 'item' : 'order'} without written details',
        (tester) async {
      final backend = FakeRestaurant('Kitchen');
      final adapter = FakeAdapter(backend.handle);
      await pumpApp(tester, backend, adapter: adapter);
      try {
        go(tester, '/orders/$orderId');
        await tester.pumpAndSettle();
        await tapVisible(
            tester,
            item
                ? find.widgetWithText(TextButton, 'Cancel item')
                : find.widgetWithText(OutlinedButton, 'Cancel order'));
        expect(find.text('Reason details (optional)'), findsOneWidget);
        if (item) {
          await tester.enterText(find.byType(TextFormField), '   ');
        } else {
          await tester.tap(find.text('Out of stock'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Other').last);
          await tester.pumpAndSettle();
        }
        await tester.tap(find.widgetWithText(
            FilledButton, item ? 'Cancel item' : 'Cancel order'));
        await tester.pumpAndSettle();
        final request =
            adapter.requests.singleWhere((r) => r.uri.path.endsWith('/cancel'));
        expect(request.data['reasonCode'], item ? 'OUT_OF_STOCK' : 'OTHER');
        expect(request.data['reasonNote'], isNull);
        expect(request.data['orderItemId'], item ? 'line-1' : null);
        expect(find.byType(AlertDialog), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await finish(tester);
      }
    });
  }
  testWidgets('cancellation preserves an optional written explanation',
      (tester) async {
    final backend = FakeRestaurant('Kitchen');
    final adapter = FakeAdapter(backend.handle);
    await pumpApp(tester, backend, adapter: adapter);
    go(tester, '/orders/$orderId');
    await tester.pumpAndSettle();
    await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel item'));
    await tester.enterText(
        find.byType(TextFormField), 'Ingredient unavailable');
    await tester.tap(find.widgetWithText(FilledButton, 'Cancel item'));
    await tester.pumpAndSettle();
    final request =
        adapter.requests.firstWhere((r) => r.uri.path.endsWith('/cancel'));
    expect(request.data['reasonNote'], 'Ingredient unavailable');
    expect(request.data['orderItemId'], 'line-1');
    expect(backend.cancelledItem, isTrue);
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
    expect(find.text('Test QR · No money collected'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    final saved =
        (await LocalWorkspace(vault, testServer, userId).sessions()).single;
    expect(saved.qrData, paymentJson()['qrData']);
    backend.sessionStatus = 'PAID';
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.text('Paid'), findsOneWidget);
    expect(find.text('Cancel test payment'), findsNothing);
    await finish(tester);
  });
  testWidgets('cancelled lines stay marked and a pending order cannot be paid',
      (tester) async {
    await pumpApp(tester, FakeRestaurant('Cashier')..cancelledItem = true);
    go(tester, '/orders/$orderId');
    await tester.pumpAndSettle();
    expect(find.text('Take payment'), findsNothing);
    expect(find.text('Cancelled'), findsWidgets);
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
