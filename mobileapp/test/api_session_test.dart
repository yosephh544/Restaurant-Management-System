import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/permissions.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('connection resets and server errors keep mutations protected',
      () async {
    final reset = ApiClient(testServer,
        transport: Dio()
          ..httpClientAdapter = FakeAdapter((r) async {
            throw DioException(
                requestOptions: r, type: DioExceptionType.connectionError);
          }));
    final failure = ApiClient(testServer,
        transport: Dio()
          ..httpClientAdapter = FakeAdapter((r) async => (
                status: 500,
                body: {'success': false, 'message': 'Internal SQL details'}
              )));
    for (final client in [reset, failure]) {
      await expectLater(
          client.call('POST', 'orders'),
          throwsA(isA<ApiException>()
              .having((e) => e.uncertain, 'uncertain', isTrue)));
    }
    expect(
        RestaurantOrder.fromJson(
                orderJson(status: 'Ready', payment: 'PaymentInitiated'))
            .canAdd,
        isFalse);
  });
  test('a delayed refresh cannot restore credentials after sign-out', () async {
    final deps = await setup();
    final gate = Completer<void>();
    final requested = Completer<void>();
    deps.api.dio.httpClientAdapter = FakeAdapter((r) async {
      if (r.uri.path.endsWith('/auth/me')) {
        return (status: 200, body: envelope(await encryptedProfile()));
      }
      if (r.uri.path.endsWith('/auth/refresh')) {
        requested.complete();
        await gate.future;
        return (status: 200, body: envelope(authJson('Waiter', 'new')));
      }
      return (status: 200, body: envelope(authJson()));
    });
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    await session.login('phone', '1234');
    final refresh = session.refresh();
    await requested.future;
    await session.signOut(remote: false);
    gate.complete();
    expect(await refresh, isFalse);
    expect(session.state.session, isNull);
    expect(deps.vault.values, isEmpty);
    session.dispose();
  });
  test('profile server failure identifies the failed login step', () async {
    final deps = await setup();
    deps.api.dio.httpClientAdapter = FakeAdapter((r) async {
      if (r.uri.path.endsWith('/auth/pin-login')) {
        return (status: 200, body: envelope(authJson()));
      }
      return (
        status: 500,
        body: {'success': false, 'message': 'Internal configuration details'}
      );
    });
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    await expectLater(
        session.login('phone', '1234'),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 500)
            .having((e) => e.message, 'message',
                'The server could not load your staff profile. Ask your manager to check the server configuration.')
            .having((e) => e.uncertain, 'uncertain', isFalse)));
    expect(session.state.session, isNull);
    expect(deps.vault.values, isEmpty);
    session.dispose();
  });
  test('PIN login server failure does not ask staff to refresh an order',
      () async {
    final adapter = FakeAdapter((r) async => (
          status: 503,
          body: {'success': false, 'message': 'Internal SQL details'}
        ));
    final client =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    await expectLater(
        client.call('POST', 'auth/pin-login', public: true),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 503)
            .having((e) => e.message, 'message',
                'The server could not complete sign-in. Try again later or contact your manager.')
            .having((e) => e.uncertain, 'uncertain', isFalse)));
    expect(adapter.requests, hasLength(1));
  });
  test('decodes real status spellings, prices and page metadata', () {
    final order = RestaurantOrder.fromJson(
        orderJson(status: 'CancelledByKitchen', payment: 'PaymentInitiated'));
    expect(order.cancelled, isTrue);
    expect(order.pendingPayment, isTrue);
    expect(order.canPay, isFalse);
    expect(statusLabel(order.status), 'Kitchen cancelled');
    expect(statusLabel(order.paymentStatus), 'Payment pending');
    final page = PageData.fromJson(
        paged([orderJson()], page: 1, total: 1), RestaurantOrder.fromJson);
    expect(page.totalCount, 1);
    expect(page.items.single.tax, 67.5);
    expect(money(page.items.single.total), 'ETB 517.50');
    expect(
        KitchenTicket.fromJson({
          'orderId': orderId,
          'orderNumber': 'ORD-1042',
          'tableNumber': 'T12',
          'orderStatus': 'PENDING',
          'paymentStatus': 'UNPAID',
          'createdAt': '2026-11-19T08:30:00Z',
          'items': orderJson()['items']
        }).items.single.note,
        'No spicy sauce');
  });
  test('cancelled lines keep server totals and block checkout', () {
    final order = RestaurantOrder.fromJson(orderJson(cancelledItem: true));
    expect(order.total, 517.5);
    expect(order.needsReview, isTrue);
    expect(order.canPay, isFalse);
  });
  test('validates server URLs and requires release HTTPS', () {
    expect(normalizeServer('$testServer/', allowHttp: true), testServer);
    expect(() => normalizeServer('http://localhost:5012', allowHttp: true),
        throwsA(isA<ApiException>()));
    expect(() => normalizeServer(testServer, allowHttp: false),
        throwsA(isA<ApiException>()));
    expect(
        () => normalizeServer('https://user:secret@example.com/api/v1',
            allowHttp: false),
        throwsA(isA<ApiException>()));
  });
  test('parses ASP.NET validation and empty forbidden responses', () async {
    final adapter = FakeAdapter((r) async => (
          status: 400,
          body: {
            'title': 'Validation failed',
            'errors': {
              'Phone': ['Phone is required.']
            }
          }
        ));
    final client =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    await expectLater(
        client.call('POST', 'auth/login', public: true),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', 'Phone is required.')));
    final forbidden = ApiClient(testServer,
        transport: Dio()
          ..httpClientAdapter =
              FakeAdapter((r) async => (status: 403, body: null)));
    await expectLater(forbidden.call('GET', 'orders'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
  });
  test(
      'concurrent unauthorized requests rotate tokens once and persist before replay',
      () async {
    final deps = await setup();
    final gate = Completer<void>();
    var refreshCount = 0;
    final adapter = FakeAdapter((r) async {
      if (r.uri.path.endsWith('/auth/me')) {
        return (status: 200, body: envelope(await encryptedProfile()));
      }
      if (r.uri.path.endsWith('/auth/pin-login')) {
        return (status: 200, body: envelope(authJson()));
      }
      if (r.uri.path.endsWith('/auth/refresh')) {
        refreshCount++;
        await gate.future;
        return (status: 200, body: envelope(authJson('Waiter', 'new')));
      }
      if (r.headers['Authorization'] == 'Bearer old') {
        return (status: 401, body: null);
      }
      expect(jsonDecode(deps.vault.values['session']!)['refreshToken'],
          'refresh-new');
      return (status: 200, body: paged([]));
    });
    final api =
        ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
    final session = SessionController(api, deps.vault, deps.prefs);
    await session.login('+251911111111', '1234');
    final first = api.call('GET', 'orders'), second = api.call('GET', 'orders');
    await Future<void>.delayed(const Duration(milliseconds: 20));
    gate.complete();
    await Future.wait([first, second]);
    expect(refreshCount, 1);
    expect(session.state.session!.accessToken, 'new');
    session.dispose();
  });
  test('failed token refresh expires session and clears local records',
      () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    await session.login('phone', '1234');
    await session.workspace!.saveDraft({'lines': []});
    deps.api.dio.httpClientAdapter =
        FakeAdapter((r) async => (status: 401, body: null));
    await expectLater(
        deps.api.call('GET', 'orders'), throwsA(isA<ApiException>()));
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(session.state.session, isNull);
    expect(deps.vault.values, isEmpty);
    session.dispose();
  });
  test('mutation timeouts are never automatically retried', () async {
    final backend = FakeRestaurant()..timeoutCreate = true;
    final deps = await setup(backend);
    await expectLater(
        RestaurantApi(deps.api).submitOrder({'items': []}),
        throwsA(isA<ApiException>()
            .having((e) => e.uncertain, 'uncertain', isTrue)));
    expect(deps.adapter.requests.where((r) => r.method == 'POST').length, 1);
  });
  test('sessions recover after restart, remain scoped, and clear on logout',
      () async {
    final deps = await setup();
    final workspace = LocalWorkspace(deps.vault, testServer, userId);
    final payment = PaymentSession.fromJson(paymentJson());
    await Future.wait([
      workspace.saveSession(payment),
      workspace.saveSession(payment.withStatus('PAID'))
    ]);
    final restored = LocalWorkspace(deps.vault, testServer, userId);
    expect((await restored.sessions()).single.status, 'PAID');
    expect(
        await LocalWorkspace(deps.vault, testServer, 'another-user').sessions(),
        isEmpty);
    await restored.close();
    expect(await restored.sessions(), isEmpty);
  });
  test('server change clears credentials, draft, and saved sessions', () async {
    final deps = await setup();
    final session = SessionController(deps.api, deps.vault, deps.prefs);
    await session.login('phone', '1234');
    await session.workspace!.saveDraft({'lines': []});
    await session.workspace!
        .saveSession(PaymentSession.fromJson(paymentJson()));
    await session.setServer('https://restaurant.example/api/v1');
    expect(session.state.session, isNull);
    expect(deps.vault.values, isEmpty);
    expect(deps.prefs.getString('server'), 'https://restaurant.example/api/v1');
    session.dispose();
  });
  test('role guards reject management and unauthorized service routes', () {
    SessionState state(String role) => SessionState(
        ready: true,
        session: Session.fromTokens(
            authJson(role),
            Staff.fromJson({
              ...staffJson(role),
              'permissions': switch (role) {
                'Kitchen' => [P.kitchenView],
                'Bartender' => [P.barView],
                'Waiter' || 'Cashier' => [P.ordersView, P.paymentsView],
                _ => <String>[],
              },
            })));
    expect(routeRedirect(state('Owner'), '/orders'), '/unsupported');
    expect(routeRedirect(state('Kitchen'), '/orders/new'), '/queue');
    expect(routeRedirect(state('Cashier'), '/tips'), '/orders');
    expect(routeRedirect(state('Waiter'), '/queue'), '/orders');
    expect(routeRedirect(state('Kitchen'), '/orders/$orderId'),
        '/queue/orders/$orderId');
    expect(routeRedirect(state('Kitchen'), '/queue/orders/$orderId'), isNull);
    expect(routeRedirect(state('Bartender'), '/queue/orders/$orderId'), isNull);
    expect(routeRedirect(state('Waiter'), '/queue/orders/$orderId'), '/orders');
  });
}
