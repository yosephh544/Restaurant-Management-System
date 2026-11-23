import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/permissions.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/features/kitchen/queue_page.dart';
import 'package:mobileapp/features/orders/order_detail_page.dart';
import 'package:mobileapp/main.dart';
import 'support.dart';

class _StationSession extends SessionController {
  _StationSession(super.api, super.vault, super.preferences, String role) {
    final bartender = role == 'Bartender';
    state = SessionState(
        ready: true,
        session: Session(
            accessToken: 'station-access',
            refreshToken: 'station-refresh',
            staff: Staff(
                id: userId,
                name: 'Station staff',
                phone: '',
                role: role,
                active: true,
                permissions: bartender
                    ? [P.barView, P.barUpdate, P.barCancel]
                    : [P.kitchenView, P.kitchenUpdate, P.kitchenCancel])));
  }
}

Future<GoRouter> _pumpStation(WidgetTester tester, String role) async {
  final deps = await setup();
  final station = role == 'Bartender' ? 'bar' : 'kitchen';
  final adapter = FakeAdapter((request) async {
    if (request.method == 'GET' &&
        request.uri.path == '/api/v1/$station/queue') {
      return (
        status: 200,
        body: paged([
          {
            'orderId': orderId,
            'orderNumber': 'ORD-1042',
            'tableNumber': 'T12',
            'waiterName': 'Abebe',
            'station': station.toUpperCase(),
            'orderStatus': 'PENDING',
            'stationStatus': 'PENDING',
            'paymentStatus': 'UNPAID',
            'createdAt': DateTime.now().toUtc().toIso8601String(),
            'items': [
              {
                'id': 'line-1',
                'menuItemId': itemId,
                'menuItemName': 'Station item',
                'quantity': 1,
                'customerNotes': 'No chilli',
                'itemStatus': 'ACTIVE',
              }
            ],
          }
        ])
      );
    }
    return (
      status: 404,
      body: {'success': false, 'message': 'Unexpected request'}
    );
  });
  final api =
      ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
  await tester.pumpWidget(ProviderScope(overrides: [
    preferencesProvider.overrideWithValue(deps.prefs),
    vaultProvider.overrideWithValue(deps.vault),
    apiClientProvider.overrideWithValue(api),
    sessionProvider.overrideWith(
        (ref) => _StationSession(api, deps.vault, deps.prefs, role)),
  ], child: const RmsApp()));
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(RmsApp)))
      .read(routerProvider);
}

void main() {
  for (final role in ['Kitchen', 'Bartender']) {
    testWidgets('$role returns to the queue with the phone Back key',
        (tester) async {
      try {
        final router = await _pumpStation(tester, role);
        expect(find.byType(QueuePage), findsOneWidget);
        await tester.tap(find.text('ORD-1042'));
        await tester.pumpAndSettle();
        expect(find.byType(OrderDetailPage), findsOneWidget);
        expect(find.text('1 × Station item'), findsOneWidget);

        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();

        expect(router.routeInformationProvider.value.uri.path, '/queue');
        expect(find.byType(QueuePage), findsOneWidget);
        expect(find.text(role == 'Kitchen' ? 'Kitchen display' : 'Bar display'),
            findsOneWidget);
        expect(find.text('ORD-1042'), findsOneWidget);
        expect(find.byType(OrderDetailPage), findsNothing);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });

    testWidgets('$role legacy order link returns to a visible queue',
        (tester) async {
      try {
        final router = await _pumpStation(tester, role);
        router.go('/orders/$orderId');
        await tester.pumpAndSettle();
        expect(find.byType(OrderDetailPage), findsOneWidget);

        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();

        expect(router.routeInformationProvider.value.uri.path, '/queue');
        expect(find.byType(QueuePage), findsOneWidget);
        expect(find.text('ORD-1042'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });
  }
}
