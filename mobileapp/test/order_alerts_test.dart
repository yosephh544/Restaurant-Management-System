import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/order_alerts.dart';
import 'package:mobileapp/core/order_alert_providers.dart';
import 'package:mobileapp/core/permissions.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/features/orders/order_detail_page.dart';
import 'package:mobileapp/main.dart';
import 'support.dart';

class AlertSink implements OrderNotificationSink {
  final shown = <OrderAlert>[];
  bool allowed = true;
  void Function(OrderAlert)? onTap;
  @override
  bool get supported => true;
  @override
  Future<void> initialize(void Function(OrderAlert) onTap) async {
    this.onTap = onTap;
  }

  @override
  Future<bool> requestPermission({bool force = false}) async => allowed;
  @override
  Future<void> show(OrderAlert alert) async {
    if (allowed) shown.add(alert);
  }

  @override
  Future<void> cancelAll() async {}
}

Staff alertStaff(String role, {String id = userId}) => Staff(
    id: id,
    name: role,
    phone: '',
    role: role,
    active: true,
    permissions: switch (role) {
      'Waiter' => [P.ordersView],
      'Kitchen' => [P.kitchenView],
      'Bartender' => [P.barView],
      _ => [P.ordersView],
    });
AlertOrder record(String id, {Set<String> items = const {}}) =>
    AlertOrder(id, 'ORD-$id', 'T12', itemIds: items);
Json pageReply(List<Json> records, int page, int pages) => {
      'success': true,
      'data': records,
      'pagination': {
        'page': page,
        'pageSize': 20,
        'totalPages': pages,
        'totalCount': records.length
      },
    };
Json ticket(String id) => {
      'orderId': id,
      'orderNumber': 'ORD-$id',
      'tableNumber': 'T12',
      'orderStatus': 'PENDING',
      'stationStatus': 'PENDING',
      'paymentStatus': 'UNPAID',
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'items': [
        {
          'id': '$id-item',
          'menuItemId': itemId,
          'quantity': 1,
          'menuItemName': 'Dish',
          'itemStatus': 'ACTIVE'
        }
      ],
    };

class AlertSession extends SessionController {
  AlertSession(super.api, super.vault, super.preferences, Staff staff) {
    state = SessionState(
        ready: true,
        session: Session(
            accessToken: 'access', refreshToken: 'refresh', staff: staff));
  }
}

void main() {
  test('ready backlog is silent and later ready orders alert exactly once', () {
    final detector = OrderAlertDetector(AlertAudience.waiter);
    final initial = detector.accept([record('old')]);
    expect(initial.single.announce, isFalse);
    final later =
        detector.accept([record('old'), record('new'), record('new')]);
    expect(later.single.order.id, 'new');
    expect(later.single.announce, isTrue);
    expect(later.single.kind, OrderAlertKind.ready);
    expect(detector.accept([record('new')]), isEmpty);
    expect(detector.accept([record('old'), record('new')]), isEmpty);
  });

  for (final audience in [AlertAudience.kitchen, AlertAudience.bar]) {
    test('$audience alerts for new tickets and new items without repeats', () {
      final detector = OrderAlertDetector(audience);
      expect(
          detector.accept([
            record('old', items: {'a'})
          ]),
          isEmpty);
      final incoming = detector.accept([
        record('old', items: {'a'}),
        record('new')
      ]);
      expect(incoming.single.kind, OrderAlertKind.newOrder);
      final added = detector.accept([
        record('old', items: {'a', 'b'})
      ]);
      expect(added.single.kind, OrderAlertKind.itemsAdded);
      expect(
          detector.accept([
            record('old', items: {'a', 'b'}),
            record('new')
          ]),
          isEmpty);
    });
  }

  test(
      'ready polling reads every page, only owns orders, and includes older active orders',
      () async {
    final adapter = FakeAdapter((request) async {
      expect(request.method, 'GET');
      expect(request.queryParameters['orderStatus'], 'Ready');
      expect(request.queryParameters['waiterId'], userId);
      expect(request.queryParameters.containsKey('from'), isFalse);
      expect(request.queryParameters.containsKey('to'), isFalse);
      final page = request.queryParameters['page'] as int;
      return (
        status: 200,
        body: pageReply(
            page == 1
                ? [
                    {...orderJson(status: 'READY'), 'id': 'old-ready'},
                    {
                      ...orderJson(status: 'READY'),
                      'id': 'other',
                      'waiterId': 'another-waiter'
                    },
                  ]
                : [
                    {...orderJson(status: 'READY'), 'id': 'new-ready'}
                  ],
            page,
            2)
      );
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final records = await fetchAlertOrders(api, alertStaff('Waiter'));
    expect(records.map((r) => r.id), ['old-ready', 'new-ready']);
    expect(adapter.requests.length, 2);
  });

  test('failed queue pagination does not consume or lose new-order events',
      () async {
    var phase = 0;
    final adapter = FakeAdapter((request) async {
      expect(request.uri.path, '/api/v1/kitchen/queue');
      final page = request.queryParameters['page'] as int;
      if (phase == 0) return (status: 200, body: pageReply([], page, 0));
      if (phase == 1 && page == 2) {
        return (status: 500, body: {'success': false});
      }
      return (
        status: 200,
        body: pageReply(page == 1 ? [ticket('new')] : [], page, 2)
      );
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final sink = AlertSink();
    final controller = OrderAlertsController(
        fetch: (staff) => fetchAlertOrders(api, staff), sink: sink);
    addTearDown(controller.dispose);
    controller.configure(alertStaff('Kitchen'), testServer);
    await controller.pollNow();
    phase = 1;
    await controller.pollNow();
    expect(controller.state.error, isNotNull);
    expect(sink.shown, isEmpty);
    phase = 2;
    await controller.pollNow();
    expect(controller.state.error, isNull);
    expect(sink.shown.single.orderId, 'new');
    await controller.pollNow();
    expect(sink.shown.length, 1);
  });

  test('alerts pause in background and catch new ready orders on resume',
      () async {
    var calls = 0;
    var records = <AlertOrder>[];
    final sink = AlertSink();
    final controller = OrderAlertsController(
        fetch: (_) async {
          calls++;
          return records;
        },
        sink: sink);
    addTearDown(controller.dispose);
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    controller.setForeground(false);
    records = [record('ready')];
    await controller.pollNow();
    expect(calls, 1);
    expect(sink.shown, isEmpty);
    controller.setForeground(true);
    await controller.pollNow();
    expect(sink.shown.single.orderId, 'ready');
  });

  test(
      'account changes discard an old in-flight response and preserve per-account detection',
      () async {
    final gate = Completer<List<AlertOrder>>();
    var hold = false;
    var records = <AlertOrder>[];
    final sink = AlertSink();
    final controller = OrderAlertsController(
        fetch: (staff) async {
          if (staff.id == userId && hold) return gate.future;
          return staff.id == userId ? records : [];
        },
        sink: sink);
    addTearDown(controller.dispose);
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    hold = true;
    final pending = controller.pollNow();
    controller.configure(alertStaff('Waiter', id: 'second'), testServer);
    await controller.pollNow();
    gate.complete([record('ready')]);
    await pending;
    expect(sink.shown, isEmpty);
    expect(controller.state.entries, isEmpty);
    hold = false;
    records = [record('ready')];
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    expect(sink.shown.single.orderId, 'ready');
  });

  test(
      'permission denial preserves in-app alerts and notification taps are account scoped',
      () async {
    var records = <AlertOrder>[];
    final sink = AlertSink()..allowed = false;
    final controller =
        OrderAlertsController(fetch: (_) async => records, sink: sink);
    addTearDown(controller.dispose);
    final opened = <OrderAlert>[];
    controller.onOpen = opened.add;
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    records = [record('ready')];
    await controller.pollNow();
    expect(sink.shown, isEmpty);
    expect(controller.state.phoneEnabled, isFalse);
    expect(controller.state.unread, 1);
    final alert = controller.state.entries.single;
    controller.open(alert);
    expect(opened.single.route, '/orders/ready');
    expect(controller.state.unread, 0);
    controller.configure(alertStaff('Waiter', id: 'other'), testServer);
    await controller.pollNow();
    sink.onTap!(alert);
    expect(opened.length, 1);
  });

  test(
      'cashiers and users without viewing permission do not poll preparation alerts',
      () async {
    var calls = 0;
    final controller = OrderAlertsController(
        fetch: (_) async {
          calls++;
          return [];
        },
        sink: AlertSink());
    addTearDown(controller.dispose);
    controller.configure(alertStaff('Cashier'), testServer);
    await controller.pollNow();
    controller.configure(
        const Staff(
            id: 'no-access',
            name: 'Staff',
            phone: '',
            role: 'Kitchen',
            active: true),
        testServer);
    await controller.pollNow();
    expect(calls, 0);
    expect(controller.state.enabled, isFalse);
  });

  test('a cold notification cannot linger through a cashier sign-in', () async {
    final controller =
        OrderAlertsController(fetch: (_) async => [], sink: AlertSink());
    addTearDown(controller.dispose);
    final opened = <OrderAlert>[];
    controller.onOpen = opened.add;
    final alert = OrderAlert(
        id: 'cold',
        scope: '$testServer/$userId/waiter',
        orderId: orderId,
        number: 'ORD-1042',
        table: 'T12',
        kind: OrderAlertKind.ready,
        audience: AlertAudience.waiter,
        created: DateTime.utc(2026, 11, 21));
    controller.open(alert);
    controller.configure(alertStaff('Cashier'), testServer);
    controller.open(alert);
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    expect(opened, isEmpty);
    controller.open(alert);
    expect(opened.single.orderId, orderId);
  });

  test('a fetch completed in background is detected after resume', () async {
    final gate = Completer<List<AlertOrder>>();
    var hold = false;
    var records = <AlertOrder>[];
    final sink = AlertSink();
    final controller = OrderAlertsController(
        fetch: (_) async => hold ? gate.future : records, sink: sink);
    addTearDown(controller.dispose);
    controller.configure(alertStaff('Waiter'), testServer);
    await controller.pollNow();
    hold = true;
    final pending = controller.pollNow();
    controller.setForeground(false);
    records = [record('ready')];
    gate.complete(records);
    await pending;
    expect(sink.shown, isEmpty);
    hold = false;
    controller.setForeground(true);
    await controller.pollNow();
    expect(sink.shown.single.orderId, 'ready');
  });

  testWidgets('grouped snackbar View opens the notification list',
      (tester) async {
    final deps = await setup();
    final staff = alertStaff('Waiter');
    var records = <AlertOrder>[];
    final controller =
        OrderAlertsController(fetch: (_) async => records, sink: AlertSink());
    controller.configure(staff, testServer);
    await controller.pollNow();
    final adapter = FakeAdapter((request) async =>
        (status: 200, body: paged([orderJson(status: 'READY')])));
    final api =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    try {
      await tester.pumpWidget(ProviderScope(overrides: [
        preferencesProvider.overrideWithValue(deps.prefs),
        vaultProvider.overrideWithValue(deps.vault),
        apiClientProvider.overrideWithValue(api),
        sessionProvider.overrideWith(
            (ref) => AlertSession(api, deps.vault, deps.prefs, staff)),
        orderAlertsProvider.overrideWith((ref) => controller),
      ], child: const RmsApp()));
      await tester.pumpAndSettle();
      records = [record('one'), record('two')];
      await controller.pollNow();
      await tester.pumpAndSettle();
      expect(find.text('2 new order alerts'), findsOneWidget);
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Order ready'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    }
  });

  testWidgets(
      'notification badge opens a readable list and alert opens its order',
      (tester) async {
    final deps = await setup();
    final staff = alertStaff('Waiter');
    var records = <AlertOrder>[];
    final controller =
        OrderAlertsController(fetch: (_) async => records, sink: AlertSink());
    controller.configure(staff, testServer);
    await controller.pollNow();
    final adapter = FakeAdapter((request) async =>
        request.uri.path.endsWith('/orders')
            ? (status: 200, body: paged([orderJson(status: 'READY')]))
            : (status: 200, body: envelope(orderJson(status: 'READY'))));
    final api =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    try {
      await tester.pumpWidget(ProviderScope(overrides: [
        preferencesProvider.overrideWithValue(deps.prefs),
        vaultProvider.overrideWithValue(deps.vault),
        apiClientProvider.overrideWithValue(api),
        sessionProvider.overrideWith(
            (ref) => AlertSession(api, deps.vault, deps.prefs, staff)),
        orderAlertsProvider.overrideWith((ref) => controller),
      ], child: const RmsApp()));
      await tester.pumpAndSettle();
      records = [AlertOrder(orderId, 'ORD-1042', 'T12')];
      await controller.pollNow();
      await tester.pumpAndSettle();
      expect(controller.state.unread, 1);
      await tester.tap(find.byTooltip('Notifications'));
      await tester.pumpAndSettle();
      expect(find.text('Notifications'), findsOneWidget);
      await tester.tap(find.text('Order ready'));
      await tester.pumpAndSettle();
      expect(find.byType(OrderDetailPage), findsOneWidget);
      expect(controller.state.unread, 0);
      expect(
          ProviderScope.containerOf(tester.element(find.byType(RmsApp)))
              .read(routerProvider)
              .routeInformationProvider
              .value
              .uri
              .path,
          '/orders/$orderId');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    }
  });
}
