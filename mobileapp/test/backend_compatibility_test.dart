import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/permissions.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/features/orders/history_page.dart';
import 'package:mobileapp/features/orders/cart_page.dart';
import 'package:mobileapp/features/orders/order_detail_page.dart';
import 'package:mobileapp/features/payments/payment_pages.dart';
import 'package:mobileapp/features/payments/receipt_scanner.dart';
import 'support.dart';

const billId = '55555555-5555-5555-5555-555555555555';

Staff worker(String role) => Staff.fromJson({
      ...staffJson(role),
      'permissions': [
        P.ordersView,
        P.ordersCreate,
        P.ordersAdd,
        P.ordersReorder,
        P.ordersServe,
        P.menuView,
        P.tablesView,
        P.billsGenerate,
        P.billsReopen,
        P.paymentsInitiate,
        P.paymentsView,
        P.paymentsRetract,
        P.kitchenView,
        P.kitchenUpdate,
        P.kitchenCancel,
        P.barView,
        P.barUpdate,
        P.barCancel
      ],
    });

class Backend {
  Json orderResponse(Json body) => {
        ...order,
        ...body,
        'orderStatus': 'PENDING',
        'items': [
          for (var index = 0; index < (body['items'] as List).length; index++)
            {
              ...jsonObject((body['items'] as List)[index]),
              'id': 'line-${index + 1}',
              'menuItemName': 'Grilled chicken',
              'itemStatus': 'ACTIVE',
              'unitPrice': 100,
            }
        ],
      };
  Json order = {
    ...orderJson(status: 'SERVED'),
    'tableNumber': 'Takeaway',
    'orderNumber': 'O-261123-001',
    'orderType': 'TAKEAWAY',
    'takeawayFee': 10,
    'subtotal': 100,
    'taxTotal': 15,
    'grandTotal': 125,
    'queuePosition': 3,
    'items': [
      {
        ...jsonObject((orderJson()['items'] as List).first),
        'itemStatus': 'SERVED'
      }
    ],
  };
  Json? payment;
  bool generated = false;
  bool timeoutPayment = false;
  double transferred = 150;
  Json get bill => {
        'id': billId,
        'tableId': null,
        'tableNumber': 'Takeaway',
        'orderType': 'TAKEAWAY',
        'billNumber': 'B-261123-001',
        'status': payment == null ? 'Requested' : 'Paid',
        'subtotal': 110,
        'taxTotal': 15,
        'discountAmount': 0,
        'tipAmount': 0,
        'grandTotal': 125,
        'items': [
          {
            'orderId': orderId,
            'orderItemId': 'line-1',
            'description': 'Dish',
            'lineTotal': 115
          },
          {
            'orderId': orderId,
            'orderItemId': null,
            'description': 'Takeaway packaging fee',
            'lineTotal': 10
          },
        ],
      };
  Json makePayment(String method) => {
        ...paymentJson(method: method, status: 'PAID'),
        'billId': billId,
        'orderNumber': order['orderNumber'],
        'baseAmount': 125,
        'tipAmount': method == 'CASH' ? 0 : transferred - 125,
        'totalAmount': method == 'CASH' ? 125 : transferred,
        'receiptUrl':
            method == 'CASH' ? null : 'https://receipt.example/transaction',
        'verificationStatus': method == 'CASH' ? 'NOT_REQUIRED' : 'VERIFIED',
        'verifiedAmount': transferred,
        'verifiedPayerName': 'Customer',
        'verifiedBank': 'CBE',
      };
  Future<FakeReply> handle(RequestOptions request) async {
    final path = request.uri.path.replaceFirst('/api/v1/', '');
    if (path == 'orders/$orderId' && request.method == 'GET') {
      return (status: 200, body: envelope(order));
    }
    if (path == 'orders') {
      if (request.method == 'GET') return (status: 200, body: paged([order]));
      order = orderResponse(jsonObject(request.data));
      return (status: 201, body: envelope(order));
    }
    if (path == 'orders/$orderId/reorder') {
      order = orderResponse(jsonObject(request.data));
      return (status: 201, body: envelope(order));
    }
    if (path == 'menu/categories') {
      return (status: 200, body: envelope([categoryJson()]));
    }
    if (path == 'tables') return (status: 200, body: envelope([]));
    if (path == 'bills/active/order/$orderId') {
      return (status: 200, body: envelope(generated ? bill : null));
    }
    if (path == 'bills/generate') {
      generated = true;
      order['paymentStatus'] = 'PAYMENTINITIATED';
      return (status: 201, body: envelope(bill));
    }
    if (path == 'bills/$billId') return (status: 200, body: envelope(bill));
    if (path == 'payments') {
      return (
        status: 200,
        body: paged(
            payment == null
                ? []
                : [
                    {
                      ...payment!,
                      'orderStatus': order['orderStatus'],
                      'orderPaymentStatus': order['paymentStatus'],
                    }
                  ],
            total: payment == null ? 0 : 1)
      );
    }
    if (path == 'payments/initiate' || path == 'payments/record') {
      if (timeoutPayment) {
        throw DioException(
            requestOptions: request, type: DioExceptionType.receiveTimeout);
      }
      final body = jsonObject(request.data);
      payment = makePayment(body['method'] as String);
      if (body['method'] == 'CASH') {
        payment!['amountTendered'] = body['amountTendered'];
        payment!['changeGiven'] = number(body['amountTendered']) - 125;
      }
      order['paymentStatus'] = 'PAID';
      return (status: 200, body: envelope(payment));
    }
    if (path == 'payments/$paymentId/status') {
      return (
        status: 200,
        body: envelope({'status': payment?['status'] ?? 'INITIATED'})
      );
    }
    if (path == 'payments/$paymentId/refund') {
      payment!['status'] = 'REFUNDED';
      order['paymentStatus'] = 'REFUNDED';
      return (status: 200, body: envelope(payment));
    }
    if (path == 'kitchen/queue' || path == 'bar/queue') {
      return (
        status: 200,
        body: paged([
          {
            ...order,
            'orderId': orderId,
            'stationStatus': order['orderStatus'],
          }
        ])
      );
    }
    if (path.endsWith('/items/line-1/status')) {
      final items = order['items'] as List;
      items.first['itemStatus'] = 'PREPARED';
      order['orderStatus'] = 'READY';
      return (status: 200, body: envelope(order));
    }
    if (path == 'orders/$orderId/items/line-1/served') {
      (order['items'] as List).first['itemStatus'] = 'SERVED';
      order['orderStatus'] = (order['items'] as List)
              .every((item) => item['itemStatus'] == 'SERVED')
          ? 'SERVED'
          : 'PREPARING';
      return (status: 200, body: envelope(order));
    }
    return (
      status: 404,
      body: {'success': false, 'message': 'Unexpected route $path'}
    );
  }
}

class SignedIn extends SessionController {
  SignedIn(super.api, super.vault, super.preferences, Staff staff) {
    workspace = LocalWorkspace(vault, testServer, staff.id);
    state = SessionState(
        ready: true,
        session: Session(
            accessToken: 'token', refreshToken: 'refresh', staff: staff));
  }
}

Future<({FakeAdapter adapter, MemoryVault vault})> pumpMobile(
    WidgetTester tester, Backend backend, String role, String route,
    {MemoryVault? vault}) async {
  final deps = await setup();
  final storage = vault ?? deps.vault;
  final adapter = FakeAdapter(backend.handle);
  final api =
      ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
  final router = GoRouter(initialLocation: route, routes: [
    GoRoute(
        path: '/orders/new',
        builder: (_, __) => const Scaffold(body: CartPage())),
    GoRoute(
        path: '/orders/:id/replace',
        builder: (_, __) => const Scaffold(
            body: CartPage(orderId: orderId, replacement: true))),
    GoRoute(
        path: '/orders/:id',
        builder: (_, __) => const Scaffold(body: OrderDetailPage(id: orderId))),
    GoRoute(
        path: '/sessions/:id',
        builder: (_, __) => const Scaffold(body: PaymentPage(id: paymentId))),
    GoRoute(
        path: '/history',
        builder: (_, __) => const Scaffold(body: PaidOrdersPage())),
    GoRoute(
        path: '/payment-records',
        builder: (_, __) => const Scaffold(body: SessionsPage())),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(overrides: [
    preferencesProvider.overrideWithValue(deps.prefs),
    vaultProvider.overrideWithValue(storage),
    apiClientProvider.overrideWithValue(api),
    sessionProvider.overrideWith(
        (ref) => SignedIn(api, storage, deps.prefs, worker(role))),
  ], child: MaterialApp.router(routerConfig: router)));
  await tester.pumpAndSettle();
  return (adapter: adapter, vault: storage);
}

Future<void> tap(WidgetTester tester, String text) async {
  final finder = find.text(text).last;
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> closeApp(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

void main() {
  test(
      'takeaway bill decodes without a table and includes untaxed packaging once',
      () async {
    final backend = Backend();
    final adapter = FakeAdapter(backend.handle);
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final preview = await api.previewBill(
        RestaurantOrder.fromJson(backend.order), worker('Waiter'));
    expect(preview.table, isNull);
    expect(preview.total, 125);
    expect(preview.takeawayFee, 10);
    final bill = await api.generateBill(orderId: orderId);
    expect(bill.tableId, isNull);
    expect(bill.takeawayFee, 10);
    expect(jsonObject(adapter.requests.last.data), {'orderId': orderId});
    expect(
        adapter.requests.any((r) => r.uri.path.contains('/tables')), isFalse);
  });

  test(
      'cash checkout sends no tip and preserves receipt metadata through storage',
      () async {
    final backend = Backend();
    final adapter = FakeAdapter(backend.handle);
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final cash =
        await api.initiate(orderId, 'CASH', '', billId: billId, tendered: 150);
    expect(jsonObject(adapter.requests.last.data).containsKey('tipAmount'),
        isFalse);
    expect(cash.total, 125);
    expect(cash.change, 25);
    final digital = await api.recordDigital(billId, 'CBE',
        transactionNumber: 'FT123', amountPaid: 145);
    expect(digital.tip, 25); // The server's verified amount takes precedence.
    expect(digital.total, 150);
    expect(digital.testPayment, isFalse);
    final vault = MemoryVault();
    final workspace = LocalWorkspace(vault, testServer, userId);
    await workspace
        .saveSession(digital.withRequest('CBE', '').withStatus('PAID'));
    final recovered =
        (await LocalWorkspace(vault, testServer, userId).sessions()).single;
    expect(recovered.verification, 'VERIFIED');
    expect(recovered.metadata['verifiedPayerName'], 'Customer');
    expect(recovered.metadata['receiptUrl'],
        'https://receipt.example/transaction');
  });

  test(
      'refund and item eligibility follow the new backend while reserving serving for Waiter',
      () {
    final backend = Backend();
    backend.order['orderStatus'] = 'PREPARING';
    backend.order['paymentStatus'] = 'PAID';
    (backend.order['items'] as List).first['itemStatus'] = 'PREPARED';
    final order = RestaurantOrder.fromJson(backend.order);
    expect(order.canKitchenCancel, isTrue);
    expect(worker('Waiter').canServeItem(order, order.items.single), isTrue);
    expect(worker('Cashier').canServeItem(order, order.items.single), isFalse);
    expect(worker('Cashier').canCreateOrders, isFalse);
    final served = RestaurantOrder.fromJson({
      ...backend.order,
      'items': [
        {...(backend.order['items'] as List).first, 'itemStatus': 'SERVED'}
      ]
    });
    expect(served.canKitchenCancel, isFalse);
    final cancelled = RestaurantOrder.fromJson({
      ...backend.order,
      'orderStatus': 'CANCELLEDBYKITCHEN',
      'paymentStatus': 'REFUNDPENDING'
    });
    expect(
        PaymentDetail(
                PaymentSession.fromJson(backend.makePayment('CASH')), cancelled)
            .refundable,
        isTrue);
    expect(
        PaymentDetail(
                PaymentSession.fromJson(backend.makePayment('CASH'))
                    .withStatus('REFUNDED'),
                cancelled)
            .refundable,
        isFalse);
  });

  test(
      'remote payment refresh retains a saved QR while replacing settlement details',
      () {
    final saved =
        PaymentSession.fromJson(paymentJson()).withRequest('QR_SCAN', '');
    final remote = PaymentSession.fromJson({
      ...paymentJson(status: 'PAID'),
      'qrData': null,
      'tipAmount': 0,
      'totalAmount': 517.5
    });
    final current = remote.withSavedDetails(saved);
    expect(current.qrData, saved.qrData);
    expect(current.total, 517.5);
    expect(current.paid, isTrue);
  });

  test(
      'payment records are reserved for Cashier without granting waiter actions',
      () {
    for (final role in ['Waiter', 'Cashier']) {
      final state = SessionState(
          ready: true,
          session: Session(
              accessToken: 'token',
              refreshToken: 'refresh',
              staff: worker(role)));
      expect(routeRedirect(state, '/payment-records'),
          role == 'Cashier' ? isNull : isNotNull);
    }
  });

  test('dine-in bills continue to use table IDs and table-wide totals',
      () async {
    final backend = Backend();
    backend.order = {
      ...backend.order,
      'orderType': 'DINE_IN',
      'tableNumber': 'T12',
      'takeawayFee': 0,
      'subtotal': 110
    };
    final adapter = FakeAdapter((request) async {
      final path = request.uri.path;
      if (path.endsWith('/tables')) {
        return (
          status: 200,
          body: envelope([
            {
              'id': 'table-id',
              'number': 'T12',
              'name': '',
              'status': 'Occupied'
            },
          ])
        );
      }
      if (path.endsWith('/bills/active/table-id')) {
        return (status: 200, body: envelope(null));
      }
      if (path.endsWith('/tables/table-id/session')) {
        return (status: 200, body: envelope({'status': 'Active'}));
      }
      if (path.endsWith('/bills/generate')) {
        return (
          status: 201,
          body: envelope({
            ...backend.bill,
            'orderType': 'DINE_IN',
            'tableId': 'table-id',
            'tableNumber': 'T12',
          })
        );
      }
      return backend.handle(request);
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final preview = await api.previewBill(
        RestaurantOrder.fromJson(backend.order), worker('Waiter'));
    expect(preview.total, 125);
    expect(preview.table!.id, 'table-id');
    final bill = await api.generateBill(tableId: preview.table!.id);
    expect(bill.locationLabel, 'Table T12');
    expect(jsonObject(adapter.requests.last.data), {'tableId': 'table-id'});
  });

  testWidgets('Cashier can open all server payment records from History',
      (tester) async {
    final backend = Backend();
    backend.order['paymentStatus'] = 'REFUNDPENDING';
    backend.payment = backend.makePayment('CASH');
    await pumpMobile(tester, backend, 'Cashier', '/history');
    try {
      await tap(tester, 'All payment records');
      expect(find.byType(SessionsPage), findsOneWidget);
      expect(find.text('O-261123-001'), findsOneWidget);
    } finally {
      await closeApp(tester);
    }
  });

  testWidgets(
      'CBE accepts a transaction number without requiring a receipt link',
      (tester) async {
    final backend = Backend();
    final deps =
        await pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      await tap(tester, 'Take payment');
      await tap(tester, 'Generate bill');
      await tap(tester, 'Cash');
      await tap(tester, 'CBE receipt');
      await tester.enterText(
          find.byKey(const ValueKey('payment-transaction')), 'FT123');
      await tester.enterText(
          find.byKey(const ValueKey('payment-amount-paid')), '150');
      await tap(tester, 'Record transfer');
      final request = deps.adapter.requests
          .singleWhere((r) => r.uri.path.endsWith('/payments/record'));
      expect(jsonObject(request.data)['transactionNumber'], 'FT123');
      expect(jsonObject(request.data).containsKey('receiptUrl'), isFalse);
      expect(find.byType(PaymentPage), findsOneWidget);
    } finally {
      await closeApp(tester);
    }
  });

  testWidgets(
      'a payment changed elsewhere cannot be refunded from a stale screen',
      (tester) async {
    final backend = Backend()..generated = true;
    backend.payment = backend.makePayment('CASH');
    final deps =
        await pumpMobile(tester, backend, 'Cashier', '/sessions/$paymentId');
    try {
      await tap(tester, 'Record refund');
      backend.payment!['status'] = 'TRANSFERRED';
      await tap(tester, 'Record refund');
      expect(deps.adapter.requests.where((r) => r.uri.path.endsWith('/refund')),
          isEmpty);
      expect(find.textContaining('Only a settled payment'), findsOneWidget);
    } finally {
      await closeApp(tester);
    }
  });

  test('receipt links reject non-links and keep bank receipt URLs intact', () {
    expect(receiptLink(' https://receipt.example/r?id=123 '),
        'https://receipt.example/r?id=123');
    for (final value in [
      '12345',
      'javascript:alert(1)',
      'https:/missing-host',
      ''
    ]) {
      expect(receiptLink(value), isNull);
    }
  });

  testWidgets(
      'takeaway cash checkout uses the generated bill and server change',
      (tester) async {
    final backend = Backend();
    final deps =
        await pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      await tap(tester, 'Take payment');
      expect(find.text('Packaging included: ETB 10.00'), findsOneWidget);
      await tap(tester, 'Generate bill');
      expect(find.byKey(const ValueKey('payment-tip')), findsNothing);
      await tester.enterText(
          find.byKey(const ValueKey('cash-tendered')), '150');
      await tap(tester, 'Accept cash');
      expect(find.byType(PaymentPage), findsOneWidget);
      expect(find.text('ETB 125.00'), findsOneWidget);
      expect(find.text('ETB 25.00'), findsOneWidget);
      expect(
          deps.adapter.requests
              .where((r) => r.uri.path.endsWith('/payments/initiate'))
              .length,
          1);
    } finally {
      await closeApp(tester);
    }
  });

  testWidgets(
      'Telebirr receipts record verified overpayment without a false total error',
      (tester) async {
    final backend = Backend();
    final deps =
        await pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      await tap(tester, 'Take payment');
      await tap(tester, 'Generate bill');
      await tap(tester, 'Cash');
      await tap(tester, 'Telebirr receipt');
      await tester.enterText(find.byKey(const ValueKey('payment-receipt')),
          'https://receipt.example/transaction');
      await tester.enterText(
          find.byKey(const ValueKey('payment-amount-paid')), '145');
      await tap(tester, 'Record transfer');
      expect(find.byType(PaymentPage), findsOneWidget);
      expect(find.text('Receipt: Verified'), findsOneWidget);
      expect(find.text(testPaymentNotice), findsNothing);
      expect(find.text('ETB 150.00'), findsOneWidget);
      final request = deps.adapter.requests
          .singleWhere((r) => r.uri.path.endsWith('/payments/record'));
      expect(jsonObject(request.data)['billId'], billId);
      expect(jsonObject(request.data)['method'], 'TELEBIRR');
    } finally {
      await closeApp(tester);
    }
  });

  testWidgets('ambiguous checkout is protected from a second submission',
      (tester) async {
    final backend = Backend()..timeoutPayment = true;
    final deps =
        await pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      await tap(tester, 'Take payment');
      await tap(tester, 'Generate bill');
      await tester.enterText(
          find.byKey(const ValueKey('cash-tendered')), '150');
      await tap(tester, 'Accept cash');
      final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Accept cash'));
      expect(button.onPressed, isNull);
      expect(
          deps.adapter.requests
              .where((r) => r.uri.path.endsWith('/payments/initiate'))
              .length,
          1);
    } finally {
      await closeApp(tester);
    }
  });

  testWidgets('Cashier refunds a cancelled prepaid bill from another device',
      (tester) async {
    final backend = Backend()..generated = true;
    backend.order['orderStatus'] = 'CANCELLEDBYKITCHEN';
    backend.order['paymentStatus'] = 'REFUNDPENDING';
    backend.payment = backend.makePayment('CASH');
    final deps =
        await pumpMobile(tester, backend, 'Cashier', '/sessions/$paymentId');
    try {
      await tap(tester, 'Record refund');
      expect(find.textContaining('This refunds the full bill'), findsOneWidget);
      await tap(tester, 'Record refund');
      expect(find.text('Refunded'), findsOneWidget);
      expect(
          deps.adapter.requests
              .where((r) => r.uri.path.endsWith('/refund'))
              .length,
          1);
    } finally {
      await closeApp(tester);
    }
  });

  for (final role in ['Kitchen', 'Bartender', 'Waiter', 'Cashier']) {
    testWidgets('$role receives only its permitted item controls',
        (tester) async {
      final backend = Backend();
      backend.order['orderStatus'] = 'PREPARING';
      (backend.order['items'] as List).first['itemStatus'] =
          role == 'Waiter' || role == 'Cashier' ? 'PREPARED' : 'ACTIVE';
      if (role == 'Waiter' || role == 'Cashier') {
        (backend.order['items'] as List).add(<String, dynamic>{
          ...(backend.order['items'] as List).first,
          'id': 'line-2',
          'menuItemName': 'Still cooking',
          'itemStatus': 'ACTIVE',
        });
      }
      final deps = await pumpMobile(tester, backend, role, '/orders/$orderId');
      try {
        expect(find.text('Queue 3'), findsOneWidget);
        if (role == 'Cashier') {
          expect(find.text('Serve item'), findsNothing);
          expect(find.text('Serve all'), findsNothing);
          expect(find.text('Add items'), findsNothing);
        } else {
          await tap(tester, role == 'Waiter' ? 'Serve item' : 'Ready item');
          final expected = role == 'Waiter'
              ? 'orders/$orderId/items/line-1/served'
              : '${role == 'Bartender' ? 'bar' : 'kitchen'}/orders/$orderId/items/line-1/status';
          expect(
              deps.adapter.requests
                  .where((r) =>
                      r.method == 'PATCH' && r.uri.path.endsWith(expected))
                  .length,
              1);
          if (role == 'Waiter') {
            expect(backend.order['orderStatus'], 'PREPARING');
            expect(find.text('Serve all'), findsNothing);
          }
        }
      } finally {
        await closeApp(tester);
      }
    });
  }

  testWidgets(
      'takeaway draft survives reload and submits without a table session',
      (tester) async {
    final backend = Backend();
    final vault = MemoryVault();
    await LocalWorkspace(vault, testServer, userId).saveDraft({
      'route': '/orders/new',
      'table': '',
      'orderType': 'TAKEAWAY',
      'note': 'Pack separately',
      'lines': [
        {'item': menuJson(), 'quantity': 2, 'note': 'No chilli'}
      ],
    });
    final deps = await pumpMobile(tester, backend, 'Waiter', '/orders/new',
        vault: vault);
    try {
      await tap(tester, 'Review order');
      expect(find.text('Takeaway'), findsOneWidget);
      expect(find.text('Pack separately'), findsOneWidget);
      await tap(tester, 'Send order');
      final request = deps.adapter.requests.singleWhere(
          (r) => r.method == 'POST' && r.uri.path.endsWith('/orders'));
      final body = jsonObject(request.data);
      expect(body['orderType'], 'TAKEAWAY');
      expect(body['tableNumber'], 'Takeaway');
      expect((body['items'] as List).single['quantity'], 2);
      expect(deps.adapter.requests.any((r) => r.uri.path.endsWith('/session')),
          isFalse);
      expect(await LocalWorkspace(vault, testServer, userId).draft(), isNull);
    } finally {
      await closeApp(tester);
    }
  });
}
