import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/features/orders/orders_page.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

class TipsBackend {
  double total = 12.5;
  bool fail = false;
  Completer<void>? gate;
  Future<FakeReply> handle(RequestOptions request) async {
    if (request.uri.path.endsWith('/reports/my-waiter')) {
      await gate?.future;
      if (fail) return (status: 503, body: {'success': false});
      return (
        status: 200,
        body: envelope({
          'tipsCollected': total + 500,
          'daily': [
            {
              'date': DateFormat('yyyy-MM-dd').format(DateTime.now()),
              'tips': total
            },
          ],
        }),
      );
    }
    return (status: 200, body: paged([], total: 0));
  }
}

Future<FakeAdapter> pumpOrders(
    WidgetTester tester, TipsBackend backend, String role) async {
  final deps = await setup();
  final adapter = FakeAdapter(backend.handle);
  final api =
      ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
  await tester.pumpWidget(ProviderScope(overrides: [
    preferencesProvider.overrideWithValue(deps.prefs),
    vaultProvider.overrideWithValue(deps.vault),
    apiClientProvider.overrideWithValue(api),
    sessionProvider.overrideWith((ref) =>
        fixture.SignedIn(api, deps.vault, deps.prefs, fixture.worker(role))),
  ], child: const MaterialApp(home: Scaffold(body: OrdersPage()))));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> refresh(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Refresh'));
  await tester.pumpAndSettle();
}

void main() {
  test('daily tips uses local day bounds and its daily point, not range totals',
      () async {
    final at = DateTime(2026, 11, 24, 14);
    final adapter = FakeAdapter((request) async {
      expect(request.uri.path, '/api/v1/reports/my-waiter');
      expect(DateTime.parse(request.queryParameters['from'] as String),
          DateTime(2026, 11, 24).toUtc());
      expect(
          DateTime.parse(request.queryParameters['to'] as String),
          DateTime(2026, 11, 25)
              .subtract(const Duration(microseconds: 1))
              .toUtc());
      expect(request.queryParameters['timezoneOffsetMinutes'],
          -at.timeZoneOffset.inMinutes);
      return (
        status: 200,
        body: envelope({
          'tipsCollected': 999,
          'daily': [
            {'date': '2026-11-23', 'tips': 100},
            {'date': '2026-11-24', 'tips': 42.75},
            {'date': '2026-11-25', 'tips': 200},
          ],
        }),
      );
    });
    final api = RestaurantApi(
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));
    expect(await api.dailyTips(at: at), 42.75);
  });

  testWidgets('waiter sees a small daily total even with no unpaid orders',
      (tester) async {
    try {
      await pumpOrders(tester, TipsBackend(), 'Waiter');
      expect(find.text('Your orders'), findsOneWidget);
      expect(find.text('Today’s tips: ETB 12.50'), findsOneWidget);
      expect(find.text('No orders'), findsOneWidget);
    } finally {
      await fixture.closeApp(tester);
    }
  });

  testWidgets('Cashier does not load or show the waiter tip total',
      (tester) async {
    try {
      final adapter = await pumpOrders(tester, TipsBackend(), 'Cashier');
      expect(find.textContaining('Today’s tips'), findsNothing);
      expect(adapter.requests.any((r) => r.uri.path.contains('/reports/')),
          isFalse);
    } finally {
      await fixture.closeApp(tester);
    }
  });

  testWidgets('refresh updates tips and preserves the last total on failure',
      (tester) async {
    final backend = TipsBackend();
    try {
      await pumpOrders(tester, backend, 'Waiter');
      backend.total = 50;
      await refresh(tester);
      expect(find.text('Today’s tips: ETB 50.00'), findsOneWidget);
      backend.fail = true;
      await refresh(tester);
      expect(find.text('Today’s tips: ETB 50.00 · refresh failed'),
          findsOneWidget);
      expect(find.text('No orders'), findsOneWidget);
      backend.fail = false;
      backend.total = 0;
      await refresh(tester);
      expect(find.text('Today’s tips: ETB 0.00'), findsOneWidget);
    } finally {
      await fixture.closeApp(tester);
    }
  });

  testWidgets('an unavailable total does not show a false zero or hide orders',
      (tester) async {
    try {
      await pumpOrders(tester, TipsBackend()..fail = true, 'Waiter');
      expect(find.text('Today’s tips unavailable'), findsOneWidget);
      expect(find.text('Today’s tips: ETB 0.00'), findsNothing);
      expect(find.text('No orders'), findsOneWidget);
    } finally {
      await fixture.closeApp(tester);
    }
  });

  testWidgets('slow tips do not delay orders or start overlapping requests',
      (tester) async {
    final backend = TipsBackend()..gate = Completer<void>();
    try {
      final adapter = await pumpOrders(tester, backend, 'Waiter');
      expect(find.text('No orders'), findsOneWidget);
      expect(find.text('Today’s tips: …'), findsOneWidget);
      await refresh(tester);
      expect(adapter.requests.where((r) => r.uri.path.contains('/reports/')),
          hasLength(1));
      backend.gate!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Today’s tips: ETB 12.50'), findsOneWidget);
    } finally {
      await fixture.closeApp(tester);
    }
  });
}
