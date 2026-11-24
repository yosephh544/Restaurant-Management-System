import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/session.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

class AdditionsBackend extends fixture.Backend {
  @override
  Future<FakeReply> handle(RequestOptions request) async {
    if (request.method == 'POST' &&
        request.uri.path.endsWith('/orders/$orderId/items')) {
      final body = jsonObject(request.data);
      order = {
        ...order,
        'orderStatus': 'PREPARING',
        'items': [
          ...order['items'] as List,
          for (final item in body['items'] as List)
            {
              ...jsonObject(item),
              'id': 'added-line',
              'menuItemName': 'Grilled chicken',
              'itemStatus': 'ACTIVE',
              'unitPrice': 450,
            },
        ],
      };
      return (status: 200, body: envelope(order));
    }
    return super.handle(request);
  }
}

void main() {
  for (final status in ['READY', 'SERVED']) {
    for (final payment in ['UNPAID', 'RETRACTED']) {
      testWidgets('waiter adds items to $payment $status order',
          (tester) async {
        final backend = AdditionsBackend();
        backend.order['orderStatus'] = status;
        backend.order['paymentStatus'] = payment;
        final priorItemStatus = status == 'SERVED' ? 'SERVED' : 'PREPARED';
        (backend.order['items'] as List).first['itemStatus'] = priorItemStatus;
        final vault = MemoryVault();
        await LocalWorkspace(vault, testServer, userId).saveDraft({
          'route': '/orders/$orderId/add',
          'lines': [
            {'item': menuJson(), 'quantity': 2, 'note': 'No chilli'},
          ],
        });
        final deps = await fixture.pumpMobile(
            tester, backend, 'Waiter', '/orders/$orderId',
            vault: vault);
        try {
          expect(find.text('Add items'), findsOneWidget);
          await fixture.tap(tester, 'Add items');
          await fixture.tap(tester, 'Review order');
          await fixture.tap(tester, 'Add items');
          final request = deps.adapter.requests.singleWhere((r) =>
              r.method == 'POST' &&
              r.uri.path.endsWith('/orders/$orderId/items'));
          final body = jsonObject(request.data);
          expect(body.keys, ['items']);
          expect(jsonObject((body['items'] as List).single), {
            'menuItemId': itemId,
            'quantity': 2,
            'customerNotes': 'No chilli'
          });
          expect((backend.order['items'] as List).first['itemStatus'],
              priorItemStatus);
          expect((backend.order['items'] as List).last['itemStatus'], 'ACTIVE');
          expect(backend.order['orderStatus'], 'PREPARING');
          expect(find.text('Take payment'), findsNothing);
          expect(
              await LocalWorkspace(vault, testServer, userId).draft(), isNull);
        } finally {
          await fixture.closeApp(tester);
        }
      });
    }

    for (final payment in [
      'PAID',
      'PAYMENTINITIATED',
      'TRANSFERRED',
      'REFUNDPENDING',
      'REFUNDED'
    ]) {
      test('$payment $status order still blocks additions', () {
        final order = RestaurantOrder.fromJson(
            orderJson(status: status, payment: payment));
        expect(order.canAdd, isFalse);
      });
    }

    testWidgets('Cashier cannot add items to $status orders', (tester) async {
      final backend = AdditionsBackend();
      backend.order['orderStatus'] = status;
      await fixture.pumpMobile(tester, backend, 'Cashier', '/orders/$orderId');
      try {
        expect(find.text('Add items'), findsNothing);
      } finally {
        await fixture.closeApp(tester);
      }
    });
  }

  testWidgets('payment starting during review prevents item submission',
      (tester) async {
    final backend = AdditionsBackend();
    backend.order['orderStatus'] = 'SERVED';
    final vault = MemoryVault();
    await LocalWorkspace(vault, testServer, userId).saveDraft({
      'route': '/orders/$orderId/add',
      'lines': [
        {'item': menuJson(), 'quantity': 1, 'note': ''},
      ],
    });
    final deps = await fixture.pumpMobile(
        tester, backend, 'Waiter', '/orders/$orderId/add',
        vault: vault);
    try {
      await fixture.tap(tester, 'Review order');
      backend.order['paymentStatus'] = 'PAYMENTINITIATED';
      await fixture.tap(tester, 'Add items');
      expect(
          deps.adapter.requests.where((r) =>
              r.method == 'POST' &&
              r.uri.path.endsWith('/orders/$orderId/items')),
          isEmpty);
      expect(find.textContaining('The order changed'), findsOneWidget);
      expect(
          await LocalWorkspace(vault, testServer, userId).draft(), isNotNull);
    } finally {
      await fixture.closeApp(tester);
    }
  });
}
