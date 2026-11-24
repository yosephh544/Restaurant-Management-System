import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/order_alerts.dart';
import 'package:mobileapp/core/order_alert_providers.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/features/orders/order_detail_page.dart';
import 'package:mobileapp/main.dart';
import 'order_alerts_test.dart' as fixture;
import 'support.dart';

Json readyOrder(List<String> ids) => {
      ...orderJson(status: 'READY'),
      'items': [
        for (final id in ids)
          {
            ...jsonObject((orderJson()['items'] as List).first),
            'id': id,
            'itemStatus':
                ids.length > 1 && id == ids.first ? 'SERVED' : 'PREPARED',
          },
      ],
    };

void main() {
  for (final sawPreparing in [false, true]) {
    test(
        'same order alerts for each new ready batch; saw preparing: $sawPreparing',
        () {
      final detector = OrderAlertDetector(AlertAudience.waiter);
      expect(
          detector
              .accept([
                fixture.record(orderId, items: {'first'})
              ])
              .single
              .announce,
          isFalse);
      if (sawPreparing) expect(detector.accept([]), isEmpty);
      final added = fixture.record(orderId, items: {'first', 'second'});
      final changes = detector.accept([added, added]);
      expect(changes, hasLength(1));
      expect(changes.single.kind, OrderAlertKind.ready);
      expect(changes.single.announce, isTrue);
      expect(detector.accept([added]), isEmpty);
      expect(detector.accept([]), isEmpty);
      expect(detector.accept([added]), isEmpty);
      expect(
          detector.accept([
            fixture.record(orderId, items: {'first', 'second', 'third'}),
          ]),
          hasLength(1));
    });
  }

  test('removing or returning known lines does not repeat a ready alert', () {
    final detector = OrderAlertDetector(AlertAudience.waiter);
    detector.accept([
      fixture.record(orderId, items: {'first', 'second'})
    ]);
    expect(
        detector.accept([
          fixture.record(orderId, items: {'first'})
        ]),
        isEmpty);
    expect(
        detector.accept([
          fixture.record(orderId, items: {'first', 'second'})
        ]),
        isEmpty);
  });

  test('waiter snapshot remembers ready item IDs and excludes cancelled extras',
      () async {
    final json = readyOrder(['first', 'extra']);
    (json['items'] as List).add({
      ...jsonObject((json['items'] as List).first),
      'id': 'cancelled-extra',
      'itemStatus': 'CANCELLED',
    });
    final adapter =
        FakeAdapter((_) async => (status: 200, body: paged([json])));
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final records = await fetchAlertOrders(api, fixture.alertStaff('Waiter'));
    expect(records.single.itemIds, {'first', 'extra'});
  });

  test('added items ready after serving create one new waiter notification',
      () async {
    var phase = 0;
    final adapter = FakeAdapter((request) async {
      expect(request.queryParameters['orderStatus'], 'Ready');
      expect(request.queryParameters['waiterId'], userId);
      return (
        status: 200,
        body: paged(phase == 0
            ? [
                readyOrder(['first'])
              ]
            : phase == 1
                ? [] // Served, then preparing the added items.
                : [
                    readyOrder(['first', 'extra'])
                  ]),
      );
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final sink = fixture.AlertSink();
    final controller = OrderAlertsController(
        fetch: (staff) => fetchAlertOrders(api, staff), sink: sink);
    addTearDown(controller.dispose);
    controller.configure(fixture.alertStaff('Waiter'), testServer);
    await controller.pollNow();
    expect(sink.shown, isEmpty);
    phase = 1;
    await controller.pollNow();
    phase = 2;
    await controller.pollNow();
    expect(sink.shown.single.orderId, orderId);
    expect(sink.shown.single.kind, OrderAlertKind.ready);
    expect(sink.shown.single.route, '/orders/$orderId');
    expect(controller.state.recent, hasLength(1));
    expect(controller.state.entries, hasLength(2));
    await controller.pollNow();
    expect(sink.shown, hasLength(1));
  });

  test('failed ready pagination does not consume the additional-items alert',
      () async {
    var added = false, failSecondPage = false;
    final adapter = FakeAdapter((request) async {
      final page = request.queryParameters['page'] as int;
      if (page == 2 && failSecondPage) {
        return (status: 500, body: {'success': false});
      }
      return (
        status: 200,
        body: fixture.pageReply(
            page == 1
                ? [
                    readyOrder(added ? ['first', 'extra'] : ['first'])
                  ]
                : [],
            page,
            2),
      );
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    final sink = fixture.AlertSink();
    final controller = OrderAlertsController(
        fetch: (staff) => fetchAlertOrders(api, staff), sink: sink);
    addTearDown(controller.dispose);
    controller.configure(fixture.alertStaff('Waiter'), testServer);
    await controller.pollNow();
    added = true;
    failSecondPage = true;
    await controller.pollNow();
    expect(controller.state.error, isNotNull);
    expect(sink.shown, isEmpty);
    failSecondPage = false;
    await controller.pollNow();
    expect(controller.state.error, isNull);
    expect(sink.shown.single.orderId, orderId);
    await controller.pollNow();
    expect(sink.shown, hasLength(1));
  });

  testWidgets(
      'added ready items display another popup and View opens the order',
      (tester) async {
    final deps = await setup();
    final staff = fixture.alertStaff('Waiter');
    var records = [
      AlertOrder(orderId, 'ORD-1042', 'T12', itemIds: {'first'})
    ];
    final sink = fixture.AlertSink();
    final controller =
        OrderAlertsController(fetch: (_) async => records, sink: sink);
    controller.configure(staff, testServer);
    await controller.pollNow();
    final adapter =
        FakeAdapter((request) async => request.uri.path.endsWith('/orders')
            ? (
                status: 200,
                body: paged([
                  readyOrder(['first', 'extra'])
                ])
              )
            : (status: 200, body: envelope(readyOrder(['first', 'extra']))));
    final api =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    try {
      await tester.pumpWidget(ProviderScope(overrides: [
        preferencesProvider.overrideWithValue(deps.prefs),
        vaultProvider.overrideWithValue(deps.vault),
        apiClientProvider.overrideWithValue(api),
        sessionProvider.overrideWith(
            (ref) => fixture.AlertSession(api, deps.vault, deps.prefs, staff)),
        orderAlertsProvider.overrideWith((ref) => controller),
      ], child: const RmsApp()));
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsNothing);
      records = [
        AlertOrder(orderId, 'ORD-1042', 'T12', itemIds: {'first', 'extra'}),
      ];
      await controller.pollNow();
      await tester.pumpAndSettle();
      expect(find.text('Order ready: #1042 · Table T12'), findsOneWidget);
      expect(sink.shown, hasLength(1));
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.byType(OrderDetailPage), findsOneWidget);
      expect(controller.state.unread, 0);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    }
  });
}
