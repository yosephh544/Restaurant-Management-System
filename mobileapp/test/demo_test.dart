import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/main.dart';
import 'support.dart';

Json newOrder({String table = '20', int quantity = 1}) => {
      'tableNumber': table,
      'customerNotes': 'Drinks first',
      'items': [
        {
          'menuItemId': 'shiro',
          'quantity': quantity,
          'customerNotes': 'No chilli'
        }
      ],
    };

void expectNoPreviewLabels() {
  final previewText = RegExp(
      r'\bdemo\b|\btest\b|\bsample\b|pretend|no money|no backend',
      caseSensitive: false);
  expect(
      find.byWidgetPredicate((w) =>
          w is Text &&
          previewText.hasMatch(w.data ?? w.textSpan?.toPlainText() ?? '')),
      findsNothing);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
      'order moves through all roles and cash payment without network or persistent writes',
      () async {
    final deps = await setup();
    deps.vault.values['unrelated-secret'] = 'keep';
    final saved = Map<String, String>.from(deps.vault.values);
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.restore();
    await session.startDemo('Waiter');
    final api = RestaurantApi(deps.api);
    final order = await api.submitOrder(newOrder());
    expect(order.items.single.note, 'No chilli');
    expect(order.note, 'Drinks first');
    await session.workspace!.saveDraft({'table': '21'});
    await session.switchDemoRole('Kitchen');
    expect(
        (await api.queue(1)).items.any((t) => t.orderId == order.id), isTrue);
    await api.kitchenStatus(order.id, 'PREPARING');
    await api.kitchenStatus(order.id, 'READY');
    expect(
        (await api.queue(1)).items.any((t) => t.orderId == order.id), isFalse);
    await session.revalidate();
    expect(await session.refresh(), isTrue);
    await session.switchDemoRole('Waiter');
    expect(await session.workspace!.draft(), {'table': '21'});
    await api.served(order.id);
    final payment = await api.initiate(order.id, 'CASH', 10, '', tendered: 250);
    expect(payment.paid, isTrue);
    expect(payment.total, 217);
    expect(payment.change, 33);
    await session.workspace!.saveSession(payment);
    await session.switchDemoRole('Cashier');
    expect(
        (await api.orders(page: 1, payment: 'PAID', todayOnly: true))
            .items
            .any((o) => o.id == order.id),
        isTrue);
    expect((await session.workspace!.sessions()).any((p) => p.id == payment.id),
        isTrue);
    expect(session.state.isDemo, isTrue);
    expect(deps.adapter.requests, isEmpty);
    expect(deps.vault.values, saved);
    expect(deps.prefs.getString('server'), testServer);

    await session.signOut();
    expect(session.state.isDemo, isFalse);
    expect(session.state.session, isNull);
    expect(deps.api.dio.httpClientAdapter, same(deps.adapter));
    expect(deps.adapter.requests, isEmpty);
    expect(deps.vault.values, saved);
    await deps.api.call('GET', 'auth/me');
    expect(deps.adapter.requests.single.headers['Authorization'], isNull);
    await session.startDemo('Waiter');
    expect((await api.orders(page: 1)).items.any((o) => o.id == order.id),
        isFalse);
  });

  test('demo access follows role and waiter ownership permissions', () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Cashier');
    final api = RestaurantApi(deps.api);
    final all = (await api.orders(page: 1)).items;
    final other = all.firstWhere((o) => o.waiterId == 'demo-other-waiter');
    await expectLater(api.submitOrder(newOrder()),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
    await session.switchDemoRole('Waiter');
    expect(
        (await api.orders(page: 1))
            .items
            .every((o) => o.waiterId == 'demo-waiter'),
        isTrue);
    await expectLater(api.order(other.id),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
    final ready = (await api.orders(page: 1, status: 'READY')).items.single;
    await expectLater(api.initiate(ready.id, 'CASH', 0, '', tendered: 1000),
        throwsA(isA<ApiException>()));
    await session.switchDemoRole('Kitchen');
    await expectLater(api.orders(page: 1),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
    expect(deps.adapter.requests, isEmpty);
  });

  test('cancellations adjust totals and allow an unpaid replacement', () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Waiter');
    final api = RestaurantApi(deps.api);
    final order = await api.submitOrder(newOrder());
    final added = await api.submitOrder({
      'items': [
        {'menuItemId': 'coffee', 'quantity': 1}
      ]
    }, orderId: order.id);
    expect(added.total, 276);
    await session.switchDemoRole('Kitchen');
    await expectLater(
        api.cancel(order.id, 'OUT_OF_STOCK', ''), throwsA(isA<ApiException>()));
    await api.cancel(order.id, 'OUT_OF_STOCK', 'No coffee left',
        itemId: added.items.last.id);
    await session.switchDemoRole('Waiter');
    final partial = await api.order(order.id);
    expect(partial.total, 207);
    expect(partial.hasCancelledItems, isTrue);
    await session.switchDemoRole('Kitchen');
    await api.cancel(order.id, 'OUT_OF_STOCK', 'No ingredients left');
    await session.switchDemoRole('Waiter');
    final cancelled = await api.order(order.id);
    expect(cancelled.cancelled, isTrue);
    expect(cancelled.total, 0);
    final replacement =
        await api.submitOrder(newOrder(), orderId: order.id, replacement: true);
    expect(replacement.parentId, order.id);
    expect(replacement.paymentStatus, 'UNPAID');
  });

  test('electronic demo payments stay pending and can be retracted', () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Cashier');
    final api = RestaurantApi(deps.api);
    final order = (await api.orders(page: 1, status: 'READY')).items.single;
    final payment = await api.initiate(order.id, 'QR_SCAN', 0, '');
    expect(payment.qrData, startsWith('MAJETE-CORNER:PAYMENT:'));
    expect(await api.paymentStatus(payment.id), 'INITIATED');
    await expectLater(api.initiate(order.id, 'CASH', 0, '', tendered: 1000),
        throwsA(isA<ApiException>()));
    expect(await api.retract(payment.id), 'RETRACTED');
    expect((await api.order(order.id)).canPay, isTrue);
    expect(deps.adapter.requests, isEmpty);
  });

  test('cashier can transfer and refund a demo payment', () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Cashier');
    final api = RestaurantApi(deps.api);
    final source = (await session.workspace!.sessions()).single;
    final target = (await api.orders(page: 1, status: 'SERVED'))
        .items
        .firstWhere((o) => !o.paid);
    await expectLater(
        api.transfer(source.id, source.orderId), throwsA(isA<ApiException>()));
    final transferred = await api.transfer(source.id, target.id);
    expect(transferred.total, source.total);
    expect(await api.paymentStatus(source.id), 'TRANSFERRED');
    expect((await api.order(target.id)).paid, isTrue);
    expect((await api.refund(transferred.id)).status, 'REFUNDED');
    expect((await api.order(target.id)).paymentStatus, 'REFUNDED');
    await expectLater(api.refund(transferred.id), throwsA(isA<ApiException>()));
  });

  test('menu availability and pagination work with today and search filters',
      () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Waiter');
    final api = RestaurantApi(deps.api);
    final menu = await api.menu();
    expect(menu.length, 2);
    expect((await api.item('doro-wot')).available, isFalse);
    await expectLater(
        api.submitOrder({
          'tableNumber': '1',
          'items': [
            {'menuItemId': 'doro-wot', 'quantity': 1}
          ]
        }),
        throwsA(isA<ApiException>()));
    await expectLater(
        api.submitOrder(newOrder(quantity: 0)), throwsA(isA<ApiException>()));
    for (var i = 0; i < 22; i++) {
      await api.submitOrder(newOrder(table: 'demo-table-$i'));
    }
    final first = await api.orders(page: 1, todayOnly: true, excludePaid: true);
    final second =
        await api.orders(page: 2, todayOnly: true, excludePaid: true);
    expect(first.items.length, 20);
    expect(second.items.length, first.totalCount - 20);
    expect(first.items.every((o) => !o.paid), isTrue);
    expect(
        first.items
            .map((o) => o.id)
            .toSet()
            .intersection(second.items.map((o) => o.id).toSet()),
        isEmpty);
    final searched =
        await api.orders(page: 1, search: 'demo-table-21', todayOnly: true);
    expect(searched.items.single.table, 'demo-table-21');
  });

  test('demo does not overwrite a stored live session, even after revalidation',
      () async {
    final deps = await setup();
    deps.vault.values['session'] = 'a pre-existing live session';
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    addTearDown(session.dispose);
    await session.startDemo('Waiter');
    await session.revalidate();
    await session.refresh();
    await session.signOut();
    expect(deps.vault.values['session'], 'a pre-existing live session');
    expect(deps.prefs.getString('server'), testServer);
    expect(deps.api.dio.httpClientAdapter, isA<HttpClientAdapter>());
    expect(deps.adapter.requests, isEmpty);
  });

  for (final role in ['Waiter', 'Kitchen', 'Cashier']) {
    testWidgets(
        'opens $role demo from sign-in, changes role, and exits on a phone',
        (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final deps = await setup();
      await tester.pumpWidget(ProviderScope(overrides: [
        preferencesProvider.overrideWithValue(deps.prefs),
        vaultProvider.overrideWithValue(deps.vault),
        apiClientProvider.overrideWithValue(deps.api),
      ], child: const RmsApp()));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Continue'));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(role));
      await tester.pumpAndSettle();
      final container =
          ProviderScope.containerOf(tester.element(find.byType(RmsApp)));
      expect(container.read(sessionProvider).session!.staff.role, role);
      expectNoPreviewLabels();
      container.read(routerProvider).go('/profile');
      await tester.pumpAndSettle();
      expectNoPreviewLabels();
      await tester.ensureVisible(find.text('Change role'));
      await tester.tap(find.text('Change role'));
      await tester.pumpAndSettle();
      final nextRole = role == 'Kitchen' ? 'Waiter' : 'Kitchen';
      expectNoPreviewLabels();
      await tester.tap(find.text(nextRole));
      await tester.pumpAndSettle();
      expect(container.read(sessionProvider).session!.staff.role, nextRole);
      container.read(routerProvider).go('/profile');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Sign out'));
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Continue'), findsOneWidget);
      expectNoPreviewLabels();
      expect(deps.adapter.requests, isEmpty);
      expect(deps.vault.values, isEmpty);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    });
  }
}
