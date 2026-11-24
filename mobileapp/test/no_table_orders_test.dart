import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/session.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

class DineInBackend extends fixture.Backend {
  List<Json> tables = [];
  String tableSessionStatus = 'Active';

  DineInBackend() {
    order = {
      ...order,
      'tableNumber': '',
      'orderType': 'DINE_IN',
      'takeawayFee': 0,
      'grandTotal': 115,
    };
  }

  @override
  Json get bill => {
        ...super.bill,
        'tableNumber': '',
        'orderType': 'DINE_IN',
        'subtotal': 100,
        'grandTotal': 115,
        'items': [(super.bill['items'] as List).first],
      };

  @override
  Future<FakeReply> handle(RequestOptions request) async {
    if (request.uri.path.endsWith('/tables')) {
      return (status: 200, body: envelope(tables));
    }
    if (request.uri.path.endsWith('/tables/table-id/session')) {
      return (
        status: 200,
        body: envelope({'status': tableSessionStatus}),
      );
    }
    return super.handle(request);
  }
}

const configuredTable = {
  'id': 'table-id',
  'number': 'T12',
  'name': '',
  'status': 'Available',
};

Future<MemoryVault> saveDraft(String route, {String table = ''}) async {
  final vault = MemoryVault();
  await LocalWorkspace(vault, testServer, userId).saveDraft({
    'route': route,
    'table': table,
    'orderType': 'DINE_IN',
    'note': 'Serve together',
    'lines': [
      {'item': menuJson(), 'quantity': 2, 'note': 'No chilli'}
    ],
  });
  return vault;
}

void main() {
  for (final hasConfiguredTables in [false, true]) {
    testWidgets(
        'dine-in draft requires a table when configured tables exist: $hasConfiguredTables',
        (tester) async {
      final backend = DineInBackend();
      if (hasConfiguredTables) backend.tables = [configuredTable];
      final vault = await saveDraft('/orders/new');
      final deps = await fixture
          .pumpMobile(tester, backend, 'Waiter', '/orders/new', vault: vault);
      try {
        await fixture.tap(tester, 'Review order');
        expect(find.text('No table'), findsNothing);
        await fixture.tap(tester, 'Send order');
        expect(
            deps.adapter.requests.where(
                (r) => r.method == 'POST' && r.uri.path.endsWith('/orders')),
            isEmpty);
        expect(find.text('Choose a table.'), findsOneWidget);
        expect(
            deps.adapter.requests.any((r) => r.uri.path.endsWith('/session')),
            isFalse);
        expect(
            await LocalWorkspace(vault, testServer, userId).draft(), isNotNull);
      } finally {
        await fixture.closeApp(tester);
      }
    });
  }

  testWidgets('replacement dine-in order also requires a table',
      (tester) async {
    final backend = DineInBackend();
    backend.order['orderStatus'] = 'CANCELLEDBYKITCHEN';
    final route = '/orders/$orderId/replace';
    final vault = await saveDraft(route);
    final deps = await fixture.pumpMobile(tester, backend, 'Waiter', route,
        vault: vault);
    try {
      await fixture.tap(tester, 'Review order');
      await fixture.tap(tester, 'Send order');
      final requests = deps.adapter.requests.where((r) =>
          r.method == 'POST' &&
          r.uri.path.endsWith('/orders/$orderId/reorder'));
      expect(requests, isEmpty);
      expect(find.text('Choose a table.'), findsOneWidget);
      expect(deps.adapter.requests.any((r) => r.uri.path.endsWith('/session')),
          isFalse);
    } finally {
      await fixture.closeApp(tester);
    }
  });

  for (final sessionStatus in ['Active', 'BillRequested']) {
    testWidgets('selected table still checks its $sessionStatus session',
        (tester) async {
      final backend = DineInBackend()
        ..tables = [configuredTable]
        ..tableSessionStatus = sessionStatus;
      final vault = await saveDraft('/orders/new', table: 'T12');
      final deps = await fixture
          .pumpMobile(tester, backend, 'Waiter', '/orders/new', vault: vault);
      try {
        await fixture.tap(tester, 'Review order');
        await fixture.tap(tester, 'Send order');
        expect(
            deps.adapter.requests
                .where((r) => r.uri.path.endsWith('/tables/table-id/session')),
            hasLength(1));
        final submissions = deps.adapter.requests
            .where((r) => r.method == 'POST' && r.uri.path.endsWith('/orders'));
        if (sessionStatus == 'Active') {
          expect(jsonObject(submissions.single.data)['tableNumber'], 'T12');
        } else {
          expect(submissions, isEmpty);
          expect(find.textContaining('bill awaiting payment'), findsOneWidget);
        }
      } finally {
        await fixture.closeApp(tester);
      }
    });
  }

  test('dine-in without a table cannot use order-only payment preview',
      () async {
    final backend = DineInBackend();
    final adapter = FakeAdapter(backend.handle);
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    await expectLater(
        api.previewBill(
            RestaurantOrder.fromJson(backend.order), fixture.worker('Waiter')),
        throwsA(isA<ApiException>().having((e) => e.message, 'message',
            contains('table is no longer active'))));
    expect(
        adapter.requests.any((r) => r.uri.path.contains('/bills/')), isFalse);
  });

  testWidgets('takeaway payment still generates a bill without a table',
      (tester) async {
    final backend = fixture.Backend();
    final deps =
        await fixture.pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      expect(find.text('#001'), findsOneWidget);
      expect(find.text('O-261123-001'), findsNothing);
      await fixture.tap(tester, 'Take payment');
      expect(find.text('Takeaway bill'), findsOneWidget);
      await fixture.tap(tester, 'Generate bill');
      final request = deps.adapter.requests
          .singleWhere((r) => r.uri.path.endsWith('/bills/generate'));
      expect(jsonObject(request.data), {'orderId': orderId});
      expect(deps.adapter.requests.any((r) => r.uri.path.contains('/tables')),
          isFalse);
    } finally {
      await fixture.closeApp(tester);
    }
  });
}
