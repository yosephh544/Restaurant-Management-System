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

class _StationBackend {
  String status = 'PENDING';
  String? statusOnNextRead;
  bool failUpdate = false;
  final List<RequestOptions> updates = [];

  Future<FakeReply> handle(RequestOptions request, String station) async {
    if (request.method == 'PATCH' &&
        (request.uri.path == '/api/v1/$station/orders/$orderId/status' ||
            request.uri.path ==
                '/api/v1/$station/orders/$orderId/items/line-1/status')) {
      if (failUpdate) {
        return (
          status: 503,
          body: {'success': false, 'message': 'Update unavailable'},
        );
      }
      updates.add(request);
      status = jsonObject(request.data)['status'] as String;
      return (status: 200, body: envelope(null));
    }
    if (request.method == 'GET' &&
        request.uri.path == '/api/v1/$station/queue') {
      if (statusOnNextRead != null) {
        status = statusOnNextRead!;
        statusOnNextRead = null;
      }
      return (
        status: 200,
        body: paged([
          {
            'orderId': orderId,
            'orderNumber': 'ORD-1042',
            'tableNumber': 'T12',
            'waiterName': 'Abebe',
            'station': station.toUpperCase(),
            'orderStatus': 'PREPARING',
            'stationStatus': status,
            'paymentStatus': 'UNPAID',
            'createdAt': DateTime.now().toUtc().toIso8601String(),
            'items': [
              {
                'id': 'line-1',
                'menuItemId': itemId,
                'menuItemName': 'Station item',
                'quantity': 1,
                'customerNotes': 'No chilli',
                'itemStatus': status == 'READY' ? 'PREPARED' : 'ACTIVE',
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
  }
}

Future<GoRouter> _pumpStation(WidgetTester tester, String role,
    {_StationBackend? backend, String language = 'en'}) async {
  final deps = await setup();
  await deps.prefs.setString('app_language', language);
  final station = role == 'Bartender' ? 'bar' : 'kitchen';
  final server = backend ?? _StationBackend();
  final adapter = FakeAdapter((request) => server.handle(request, station));
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
  testWidgets('Amharic kitchen actions fit a phone and advance in order',
      (tester) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final backend = _StationBackend();
    try {
      await _pumpStation(tester, 'Kitchen', backend: backend, language: 'am');
      expect(find.text('ሁሉንም ዝግጁ አድርግ'), findsNothing);
      await tester.ensureVisible(find.text('ዝግጅት ጀምር'));
      await tester.tap(find.text('ዝግጅት ጀምር'));
      await tester.pumpAndSettle();
      expect(find.text('ዝግጅት ጀምር'), findsNothing);
      await tester.ensureVisible(find.text('ሁሉንም ዝግጁ አድርግ'));
      await tester.tap(find.text('ሁሉንም ዝግጁ አድርግ'));
      await tester.pumpAndSettle();
      expect(find.text('#1042'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    }
  });
  for (final role in ['Kitchen', 'Bartender']) {
    for (final detail in [false, true]) {
      testWidgets(
          '$role ${detail ? 'detail' : 'queue'} starts before ready all',
          (tester) async {
        final backend = _StationBackend();
        try {
          await _pumpStation(tester, role, backend: backend);
          if (detail) {
            await tester.tap(find.text('#1042'));
            await tester.pumpAndSettle();
            expect(find.text('Ready item'), findsNothing);
          }
          expect(find.text('Start preparing'), findsOneWidget);
          expect(find.text('Ready all'), findsNothing);

          await tester.ensureVisible(find.text('Start preparing'));
          await tester.tap(find.text('Start preparing'));
          await tester.pumpAndSettle();

          expect(find.text('Start preparing'), findsNothing);
          expect(find.text('Ready all'), findsOneWidget);
          if (detail) {
            expect(find.text('Start item'), findsNothing);
            expect(find.text('Ready item'), findsOneWidget);
          }

          await tester.ensureVisible(find.text('Ready all'));
          await tester.tap(find.text('Ready all'));
          await tester.pumpAndSettle();

          expect(find.text('Start preparing'), findsNothing);
          expect(find.text('Ready all'), findsNothing);
          expect(find.text('Ready item'), findsNothing);
          expect(find.text('#1042'), findsNothing);
          expect(find.byType(OrderDetailPage), findsNothing);
          expect(find.text('No pending orders'), findsOneWidget);
          expect(
              backend.updates.map((r) => jsonObject(r.data)['status']).toList(),
              ['PREPARING', 'READY']);
          final station = role == 'Bartender' ? 'bar' : 'kitchen';
          expect(
              backend.updates.every((r) =>
                  r.uri.path == '/api/v1/$station/orders/$orderId/status'),
              isTrue);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        }
      });

      testWidgets(
          '$role ${detail ? 'detail' : 'queue'} rejects stale ready all',
          (tester) async {
        final backend = _StationBackend()..status = 'PREPARING';
        try {
          await _pumpStation(tester, role, backend: backend);
          if (detail) {
            await tester.tap(find.text('#1042'));
            await tester.pumpAndSettle();
          }
          expect(find.text('Ready all'), findsOneWidget);
          backend.statusOnNextRead = 'PENDING';
          await tester.ensureVisible(find.text('Ready all'));
          await tester.tap(find.text('Ready all'));
          await tester.pumpAndSettle();

          expect(backend.updates, isEmpty);
          expect(find.text('Start preparing'), findsOneWidget);
          expect(find.text('Ready all'), findsNothing);
          expect(find.textContaining('The order changed'), findsOneWidget);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        }
      });
    }

    testWidgets('$role hides ready tickets returned by the server',
        (tester) async {
      try {
        await _pumpStation(tester, role,
            backend: _StationBackend()..status = 'READY');
        expect(find.text('#1042'), findsNothing);
        expect(find.text('No pending orders'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });

    testWidgets('$role returns to queue when the last item is ready',
        (tester) async {
      final backend = _StationBackend()..status = 'PREPARING';
      try {
        final router = await _pumpStation(tester, role, backend: backend);
        await tester.tap(find.text('#1042'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Ready item'));
        await tester.tap(find.text('Ready item'));
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, '/queue');
        expect(find.byType(OrderDetailPage), findsNothing);
        expect(find.text('#1042'), findsNothing);
        expect(find.text('No pending orders'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });

    testWidgets('$role closes a ticket made ready on another device',
        (tester) async {
      final backend = _StationBackend()..status = 'PREPARING';
      try {
        final router = await _pumpStation(tester, role, backend: backend);
        await tester.tap(find.text('#1042'));
        await tester.pumpAndSettle();
        backend.status = 'READY';
        await tester.pump(const Duration(seconds: 6));
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, '/queue');
        expect(find.byType(OrderDetailPage), findsNothing);
        expect(find.text('#1042'), findsNothing);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });

    testWidgets('$role keeps tickets after a failed ready update',
        (tester) async {
      final backend = _StationBackend()
        ..status = 'PREPARING'
        ..failUpdate = true;
      try {
        await _pumpStation(tester, role, backend: backend);
        await tester.ensureVisible(find.text('Ready all'));
        await tester.tap(find.text('Ready all'));
        await tester.pumpAndSettle();
        expect(find.text('#1042'), findsOneWidget);
        expect(find.text('Ready all'), findsOneWidget);
        expect(find.text('No pending orders'), findsNothing);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });

    testWidgets('$role returns to the queue with the phone Back key',
        (tester) async {
      try {
        final router = await _pumpStation(tester, role);
        expect(find.byType(QueuePage), findsOneWidget);
        await tester.tap(find.text('#1042'));
        await tester.pumpAndSettle();
        expect(find.byType(OrderDetailPage), findsOneWidget);
        expect(find.text('1 × Station item'), findsOneWidget);

        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();

        expect(router.routeInformationProvider.value.uri.path, '/queue');
        expect(find.byType(QueuePage), findsOneWidget);
        expect(
            find.descendant(
                of: find.byType(QueuePage),
                matching: find.text(role == 'Kitchen' ? 'Kitchen' : 'Bar')),
            findsOneWidget);
        expect(find.text('#1042'), findsOneWidget);
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
        expect(find.text('#1042'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    });
  }
}
