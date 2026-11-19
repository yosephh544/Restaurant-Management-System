import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/main.dart';

const testServer = 'http://localhost:5012/api/v1';
const userId = '11111111-1111-1111-1111-111111111111';
const orderId = '22222222-2222-2222-2222-222222222222';
const itemId = '33333333-3333-3333-3333-333333333333';
const paymentId = '44444444-4444-4444-4444-444444444444';

class MemoryVault implements Vault {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

typedef FakeReply = ({int status, dynamic body});

class FakeAdapter implements HttpClientAdapter {
  final Future<FakeReply> Function(RequestOptions) handler;
  final List<RequestOptions> requests = [];
  FakeAdapter(this.handler);
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    final reply = await handler(options);
    return ResponseBody.fromString(jsonEncode(reply.body), reply.status,
        headers: {
          'content-type': ['application/json']
        });
  }

  @override
  void close({bool force = false}) {}
}

Json envelope(dynamic value) => {'success': true, 'data': value};
Json paged(List<dynamic> values, {int page = 1, int total = 1}) => {
      'success': true,
      'data': values,
      'pagination': {
        'page': page,
        'pageSize': 20,
        'totalPages': total > 0 ? 1 : 0,
        'totalCount': total
      }
    };
Json staffJson([String role = 'Waiter']) => {
      'id': userId,
      'fullName': 'Abebe Bekele',
      'phone': '+251911111111',
      'role': role,
      'isActive': true
    };
Json authJson([String role = 'Waiter', String token = 'old']) => {
      'accessToken': token,
      'refreshToken': 'refresh-$token',
      'accessTokenExpiry': '2026-11-19T10:00:00Z',
      'staff': staffJson(role)
    };
Json menuJson({bool available = true}) => {
      'id': itemId,
      'categoryId': 'cat-main',
      'name': 'Grilled chicken',
      'description': 'Served with rice',
      'categoryName': 'Main dishes',
      'unitPrice': 450,
      'taxRate': 15.0,
      'isAvailable': available
    };
Json categoryJson({bool available = true}) => {
      'id': 'cat-main',
      'name': 'Main dishes',
      'isActive': true,
      'items': [menuJson(available: available)]
    };
Json orderJson(
        {String status = 'Pending',
        String payment = 'Unpaid',
        bool cancelledItem = false}) =>
    {
      'id': orderId,
      'orderNumber': 'ORD-1042',
      'tableNumber': 'T12',
      'waiterId': userId,
      'waiterName': 'Abebe Bekele',
      'orderStatus': status.toUpperCase(),
      'paymentStatus': payment.toUpperCase(),
      'subtotal': 450,
      'taxTotal': 67.5,
      'tipAmount': 0,
      'grandTotal': 517.5,
      'createdAt': '2026-11-19T08:30:00Z',
      'items': [
        {
          'id': 'line-1',
          'menuItemId': itemId,
          'menuItemName': 'Grilled chicken',
          'quantity': 1,
          'unitPrice': 450,
          'customerNotes': 'No spicy sauce',
          'itemStatus': cancelledItem ? 'CANCELLED' : 'ACTIVE'
        }
      ],
    };
Json paymentJson({String method = 'QRSCAN', String status = 'INITIATED'}) => {
      'id': paymentId,
      'orderId': orderId,
      'orderNumber': 'ORD-1042',
      'method': method,
      'status': status,
      'baseAmount': 517.5,
      'tipAmount': 50,
      'totalAmount': 567.5,
      'qrData': 'https://example.test/provider-returned-payload',
      'createdAt': '2026-11-19T08:35:00Z'
    };

class FakeRestaurant {
  final String role;
  String status = 'Pending', payment = 'Unpaid', sessionStatus = 'INITIATED';
  bool cancelledItem = false, available = true, timeoutCreate = false;
  FakeRestaurant([this.role = 'Waiter']);
  Future<FakeReply> handle(RequestOptions r) async {
    final path = r.uri.path.replaceFirst('/api/v1/', '');
    dynamic data;
    if (path == 'auth/login' ||
        path == 'auth/pin-login' ||
        path == 'auth/refresh') {
      data = envelope(authJson(role));
    } else if (path == 'auth/me') {
      data = envelope(staffJson(role));
    } else if (path == 'auth/logout') {
      data = envelope(null);
    } else if (path == 'menu/categories') {
      data = envelope([categoryJson(available: available)]);
    } else if (path == 'menu/public') {
      data = envelope({
        'categories': [categoryJson()]
      });
    } else if (path == 'menu/items/$itemId/availability') {
      available = jsonObject(r.data)['isAvailable'] == true;
      data = envelope(menuJson(available: available));
    } else if (path == 'menu/items/$itemId') {
      data = envelope(menuJson(available: available));
    } else if (path == 'orders' && r.method == 'GET') {
      data = paged([
        orderJson(
            status: status, payment: payment, cancelledItem: cancelledItem)
      ]);
    } else if (path == 'orders' && r.method == 'POST') {
      if (timeoutCreate) {
        throw DioException(
            requestOptions: r, type: DioExceptionType.receiveTimeout);
      }
      data = envelope(orderJson());
    } else if (path == 'orders/$orderId/served') {
      status = 'Served';
      data = envelope(orderJson(status: status));
    } else if (path == 'orders/$orderId/items' ||
        path == 'orders/$orderId/reorder') {
      data = envelope(orderJson());
    } else if (path == 'orders/$orderId') {
      data = envelope(orderJson(
          status: status, payment: payment, cancelledItem: cancelledItem));
    } else if (path == 'kitchen/queue') {
      data = paged([
        {
          'orderId': orderId,
          'orderNumber': 'ORD-1042',
          'tableNumber': 'T12',
          'waiterName': 'Abebe Bekele',
          'orderStatus': status.toUpperCase(),
          'paymentStatus': payment.toUpperCase(),
          'createdAt': '2026-11-19T08:30:00Z',
          'items': orderJson()['items']
        }
      ]);
    } else if (path == 'kitchen/orders/$orderId/status') {
      status = jsonObject(r.data)['status'] as String;
      data = envelope(orderJson(status: status));
    } else if (path == 'kitchen/orders/$orderId/cancel') {
      cancelledItem = true;
      data = envelope(null);
    } else if (path == 'payments/arifpay/initiate') {
      payment = 'PaymentInitiated';
      data = envelope(paymentJson());
    } else if (path == 'payments/$paymentId/status') {
      data = envelope({'status': sessionStatus});
    } else if (path == 'payments/$paymentId/retract') {
      sessionStatus = 'RETRACTED';
      data = envelope({'status': sessionStatus});
    } else if (path == 'payments/tips/my-ledger') {
      data = paged([
        {
          'tipId': 'tip-1',
          'orderNumber': 'ORD-1042',
          'tipAmount': 50,
          'payoutStatus': 'Unsettled',
          'createdAt': '2026-11-19T08:35:00Z'
        }
      ]);
    } else {
      return (
        status: 404,
        body: {'success': false, 'message': 'Fixture route not found: $path'}
      );
    }
    return (status: 200, body: data);
  }
}

Future<
    ({
      MemoryVault vault,
      FakeAdapter adapter,
      ApiClient api,
      SharedPreferences prefs
    })> setup([FakeRestaurant? backend]) async {
  SharedPreferences.setMockInitialValues({'server': testServer});
  final prefs = await SharedPreferences.getInstance();
  final adapter = FakeAdapter((backend ?? FakeRestaurant()).handle);
  final api =
      ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
  return (vault: MemoryVault(), adapter: adapter, api: api, prefs: prefs);
}

Future<MemoryVault> pumpApp(WidgetTester tester, FakeRestaurant backend,
    {bool signedIn = true, MemoryVault? vault, FakeAdapter? adapter}) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
  final deps = await setup(backend);
  final secrets = vault ?? deps.vault;
  if (signedIn) {
    secrets.values['session'] =
        jsonEncode({'server': testServer, ...authJson(backend.role)});
  }
  final api = adapter == null
      ? deps.api
      : ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter);
  await tester.pumpWidget(ProviderScope(overrides: [
    preferencesProvider.overrideWithValue(deps.prefs),
    vaultProvider.overrideWithValue(secrets),
    apiClientProvider.overrideWithValue(api)
  ], child: const RmsApp()));
  await tester.pumpAndSettle();
  return secrets;
}
