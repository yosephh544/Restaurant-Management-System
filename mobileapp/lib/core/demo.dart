import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'models.dart';
import 'permissions.dart';

/// An in-memory restaurant. Every request terminates here, without a network.
class DemoRestaurant implements HttpClientAdapter {
  static const roles = ['Waiter', 'Kitchen', 'Cashier'];
  final Map<String, Json> _orders = {};
  final Map<String, Json> _payments = {};
  final List<Json> _categories = [];
  int _sequence = 1040;

  DemoRestaurant() {
    void category(
        String id, String name, List<(String, String, double)> dishes) {
      _categories.add({
        'id': id,
        'name': name,
        'isActive': true,
        'items': [
          for (final dish in dishes)
            {
              'id': dish.$1,
              'categoryId': id,
              'categoryName': name,
              'name': dish.$2,
              'description': 'Freshly prepared at Majete Corner.',
              'unitPrice': dish.$3,
              'taxRate': 0.15,
              'isAvailable': dish.$1 != 'doro-wot',
            }
        ]
      });
    }

    category('mains', 'Main dishes', [
      ('tibs', 'Beef tibs', 350),
      ('shiro', 'Shiro with injera', 180),
      ('doro-wot', 'Doro wot', 420),
    ]);
    category('drinks', 'Drinks', [
      ('coffee', 'Ethiopian coffee', 60),
      ('tea', 'Spiced tea', 40),
      ('water', 'Bottled water', 35),
    ]);
    final waiter = session('Waiter').staff;
    for (final status in [
      'PENDING',
      'PREPARING',
      'READY',
      'SERVED',
      'SERVED',
      'CANCELLED_BY_KITCHEN'
    ]) {
      final order = _create({
        'tableNumber': '${_orders.length + 1}',
        'customerNotes':
            _orders.isEmpty ? 'Please bring the drinks first.' : '',
        'items': [
          {'menuItemId': 'tibs', 'quantity': 1, 'customerNotes': 'Mild spice'},
          {'menuItemId': 'coffee', 'quantity': 2},
        ],
      }, waiter);
      final now = DateTime.now();
      final midnight = DateTime(now.year, now.month, now.day);
      final created = now.subtract(Duration(minutes: 5 * _orders.length));
      order['createdAt'] = (created.isBefore(midnight) ? midnight : created)
          .toUtc()
          .toIso8601String();
      order['orderStatus'] = status;
      for (final line in _lines(order)) {
        line['itemStatus'] =
            status == 'CANCELLED_BY_KITCHEN' ? 'CANCELLED' : status;
      }
      _totals(order);
      if (_orders.length == 5) {
        _initiate(
            order, {'method': 'CASH', 'tipAmount': 25, 'amountTendered': 600});
      }
    }
    // Another waiter's ticket demonstrates restaurant-wide cashier/queue views.
    _create(
        {
          'tableNumber': '7',
          'items': [
            {'menuItemId': 'shiro', 'quantity': 2}
          ],
        },
        const Staff(
            id: 'demo-other-waiter',
            name: 'Sara Tesfaye',
            phone: '',
            role: 'Waiter',
            active: true));
  }

  Session session(String role) {
    if (!roles.contains(role)) throw ArgumentError.value(role, 'role');
    final permissions = switch (role) {
      'Waiter' => [
          P.menuView,
          P.ordersView,
          P.ordersCreate,
          P.ordersAdd,
          P.ordersReorder,
          P.ordersServe,
          P.paymentsInitiate,
          P.paymentsView
        ],
      'Kitchen' => [P.kitchenView, P.kitchenUpdate, P.kitchenCancel],
      _ => [
          P.menuView,
          P.ordersView,
          P.paymentsInitiate,
          P.paymentsView,
          P.paymentsRetract
        ],
    };
    return Session(
      accessToken: 'demo-${role.toLowerCase()}',
      refreshToken: 'demo-refresh-${role.toLowerCase()}',
      staff: Staff(
          id: 'demo-${role.toLowerCase()}',
          name: switch (role) {
            'Waiter' => 'Abebe Bekele',
            'Kitchen' => 'Hana Alemu',
            _ => 'Dawit Getachew',
          },
          phone: '',
          role: role,
          active: true,
          permissions: permissions),
    );
  }

  List<PaymentSession> paymentsFor(Staff staff) => _payments.values
      .where((p) =>
          staff.cashier || _orders[p['orderId']]?['waiterId'] == staff.id)
      .map(PaymentSession.fromJson)
      .toList();

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    try {
      final response = _handle(options);
      return ResponseBody.fromString(jsonEncode(response), 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      });
    } on _DemoError catch (e) {
      return ResponseBody.fromString(
          jsonEncode({'success': false, 'message': e.message}), e.status,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType]
          });
    }
  }

  @override
  void close({bool force = false}) {}

  Json _ok(dynamic data) => {'success': true, 'data': data};
  Never _fail(String message, [int status = 409]) =>
      throw _DemoError(message, status);
  void _require(Staff staff, String permission) {
    if (!staff.can(permission)) {
      _fail('This role cannot perform that action.', 403);
    }
  }

  Staff _staff(RequestOptions request) {
    final token = request.headers['Authorization'];
    for (final role in roles) {
      final value = session(role);
      if (token == 'Bearer ${value.accessToken}') return value.staff;
    }
    _fail('Please select a role from the sign-in screen.', 401);
  }

  Json _handle(RequestOptions request) {
    final path = request.uri.path.replaceFirst(RegExp(r'^/api/v1/'), '');
    final method = request.method;
    final body =
        request.data is Map ? jsonObject(request.data) : <String, dynamic>{};
    final query = request.queryParameters;
    if (path == 'auth/refresh' && method == 'POST') {
      for (final role in roles) {
        final value = session(role);
        if (value.refreshToken == body['refreshToken']) {
          return _ok(value.toJson());
        }
      }
      _fail('Your session expired. Please sign in again.', 401);
    }
    final staff = _staff(request);
    if (path == 'auth/me' && method == 'GET') return _ok(staff.toJson());
    if (path == 'auth/logout' && method == 'POST') return _ok(null);
    if (path == 'menu/categories' && method == 'GET') {
      _require(staff, P.menuView);
      return _ok(_categories);
    }
    final segments = path.split('/');
    if (segments.length >= 3 && segments.take(2).join('/') == 'menu/items') {
      _require(staff, P.menuView);
      final item = _menuItem(segments[2]);
      if (segments.length == 3 && method == 'GET') return _ok(item);
    }
    if (path == 'orders' && method == 'GET') {
      _require(staff, P.ordersView);
      final from = date(query['from']), to = date(query['to']);
      final search = '${query['search'] ?? ''}'.toLowerCase();
      final orders = _orders.values.where((o) {
        final created = date(o['createdAt'])!;
        return (!staff.waiter || o['waiterId'] == staff.id) &&
            (query['waiterId'] == null || o['waiterId'] == query['waiterId']) &&
            (query['orderStatus'] == null ||
                code(o['orderStatus']) == code(query['orderStatus'])) &&
            (query['paymentStatus'] == null ||
                code(o['paymentStatus']) == code(query['paymentStatus'])) &&
            (from == null || !created.isBefore(from)) &&
            (to == null || !created.isAfter(to)) &&
            '${o['orderNumber']} ${o['tableNumber']} ${o['waiterName']}'
                .toLowerCase()
                .contains(search);
      }).toList()
        ..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'));
      return _paged(orders, query);
    }
    if (path == 'orders' && method == 'POST') {
      _require(staff, P.ordersCreate);
      return _ok(_create(body, staff));
    }
    if (segments.first == 'orders' && segments.length >= 2) {
      final order = _order(segments[1]);
      _require(staff, P.ordersView);
      if (staff.waiter && order['waiterId'] != staff.id) {
        _fail('This is another waiter’s order.', 403);
      }
      if (segments.length == 2 && method == 'GET') return _ok(order);
      if (segments.length == 3) {
        final action = segments[2];
        if (action == 'served' && method == 'PATCH') {
          _require(staff, P.ordersServe);
          if (code(order['orderStatus']) != 'READY') {
            _fail('Only a ready order can be served.');
          }
          order['orderStatus'] = 'SERVED';
          return _ok(order);
        }
        if (action == 'items' && method == 'POST') {
          _require(staff, P.ordersAdd);
          if (!RestaurantOrder.fromJson(order).canAdd) {
            _fail('Items cannot be added at this stage.');
          }
          _lines(order).addAll(_newLines(body));
          _totals(order);
          return _ok(order);
        }
        if (action == 'reorder' && method == 'POST') {
          _require(staff, P.ordersReorder);
          if (!RestaurantOrder.fromJson(order).cancelled ||
              code(order['paymentStatus']) == 'PAID') {
            _fail('Only an unpaid cancelled order can be replaced.');
          }
          return _ok(_create({...body, 'parentOrderId': order['id']}, staff));
        }
      }
    }
    if (path == 'kitchen/queue' && method == 'GET') {
      _require(staff, P.kitchenView);
      return _paged(
          _orders.values
              .where((o) =>
                  ['PENDING', 'PREPARING'].contains(code(o['orderStatus'])))
              .map((o) => {
                    'orderId': o['id'],
                    'orderNumber': o['orderNumber'],
                    'tableNumber': o['tableNumber'],
                    'waiterName': o['waiterName'],
                    'orderStatus': o['orderStatus'],
                    'paymentStatus': o['paymentStatus'],
                    'createdAt': o['createdAt'],
                    'items': o['items']
                  })
              .toList(),
          query);
    }
    if (segments.length == 4 &&
        segments.take(2).join('/') == 'kitchen/orders') {
      final order = _order(segments[2]);
      if (!RestaurantOrder.fromJson(order).canKitchenCancel) {
        _fail('This ticket is no longer active.');
      }
      if (segments[3] == 'status' && method == 'PATCH') {
        _require(staff, P.kitchenUpdate);
        final next = body['status'];
        if (!((order['orderStatus'] == 'PENDING' && next == 'PREPARING') ||
            (order['orderStatus'] == 'PREPARING' && next == 'READY'))) {
          _fail('Check the ticket’s current stage.');
        }
        order['orderStatus'] = next;
        for (final line
            in _lines(order).where((l) => l['itemStatus'] != 'CANCELLED')) {
          line['itemStatus'] = next;
        }
        return _ok(order);
      }
      if (segments[3] == 'cancel' && method == 'POST') {
        _require(staff, P.kitchenCancel);
        if (body['reasonCode'] == null) {
          _fail('Select a cancellation reason.', 400);
        }
        if (body['reasonCode'] == 'OTHER' &&
            '${body['reasonNote'] ?? ''}'.trim().isEmpty) {
          _fail('Add details for Other.', 400);
        }
        final itemId = body['orderItemId'];
        final selected = _lines(order)
            .where((l) => itemId == null || l['id'] == itemId)
            .toList();
        if (selected.isEmpty) _fail('The selected item was not found.', 404);
        for (final line in selected) {
          line['itemStatus'] = 'CANCELLED';
        }
        if (_lines(order).every((l) => l['itemStatus'] == 'CANCELLED')) {
          order['orderStatus'] = 'CANCELLED_BY_KITCHEN';
        }
        _totals(order);
        return _ok(null);
      }
    }
    if (path == 'payments/initiate' && method == 'POST') {
      _require(staff, P.paymentsInitiate);
      final order = _order('${body['orderId']}');
      final model = RestaurantOrder.fromJson(order);
      if (!staff.canTakePayment(model) || !model.canPay) {
        _fail('This order is not eligible for payment.');
      }
      return _ok(_initiate(order, body));
    }
    if (segments.first == 'payments' && segments.length == 3) {
      _require(staff, P.paymentsView);
      final payment = _payments[segments[1]];
      if (payment == null) _fail('Payment not found.', 404);
      final order = _order(payment['orderId']);
      if (staff.waiter && order['waiterId'] != staff.id) {
        _fail('This is another waiter’s payment.', 403);
      }
      if (segments[2] == 'status' && method == 'GET') {
        return _ok({'status': payment['status']});
      }
      if (method == 'POST') {
        _require(staff, P.paymentsRetract);
        if (segments[2] == 'retract') {
          if (payment['status'] != 'INITIATED') {
            _fail('Only pending payments can be cancelled.');
          }
          payment['status'] = 'RETRACTED';
          order['paymentStatus'] = 'RETRACTED';
          return _ok({'status': 'RETRACTED'});
        }
        if (payment['status'] != 'PAID' || order['orderStatus'] != 'SERVED') {
          _fail('A paid, served order is required.');
        }
        if (segments[2] == 'refund') {
          payment['status'] = 'REFUNDED';
          order['paymentStatus'] = 'REFUNDED';
          return _ok(payment);
        }
        if (segments[2] == 'transfer') {
          final target = _order('${body['targetOrderId']}');
          final model = RestaurantOrder.fromJson(target);
          final base = number(target['subtotal']) + number(target['taxTotal']);
          if (target['id'] == order['id'] ||
              !model.canPay ||
              (_round(base + number(payment['tipAmount'])) -
                          number(payment['totalAmount']))
                      .abs() >
                  .001) {
            _fail(
                'Choose a different ready or served order with the same amount.');
          }
          final transferred = {
            ...payment,
            'id': 'demo-payment-${++_sequence}',
            'orderId': target['id'],
            'orderNumber': target['orderNumber'],
            'createdAt': DateTime.now().toUtc().toIso8601String()
          };
          payment['status'] = 'TRANSFERRED';
          order['paymentStatus'] = 'TRANSFERRED';
          target['paymentStatus'] = 'PAID';
          target['tipAmount'] = payment['tipAmount'];
          _totals(target);
          _payments[transferred['id']] = transferred;
          return _ok(transferred);
        }
      }
    }
    _fail('This action is not available.', 404);
  }

  Json _paged(List<Json> items, Json query) {
    final size = (int.tryParse('${query['pageSize']}') ?? 20).clamp(1, 100);
    final pages = (items.length / size).ceil();
    final page =
        (int.tryParse('${query['page']}') ?? 1).clamp(1, pages < 1 ? 1 : pages);
    return {
      ..._ok(items.skip((page - 1) * size).take(size).toList()),
      'pagination': {
        'page': page,
        'totalPages': pages,
        'totalCount': items.length
      }
    };
  }

  Json _menuItem(String id) {
    for (final category in _categories) {
      for (final item in category['items'] as List<Json>) {
        if (item['id'] == id) return item;
      }
    }
    _fail('Dish not found.', 404);
  }

  Json _order(String id) => _orders[id] ?? (_fail('Order not found.', 404));
  List<Json> _lines(Json order) => order['items'] as List<Json>;
  List<Json> _newLines(Json body) {
    final requested = body['items'] as List? ?? [];
    if (requested.isEmpty) _fail('Select at least one dish.', 400);
    return requested.map((raw) {
      final request = jsonObject(raw);
      final item = _menuItem('${request['menuItemId']}');
      final quantity = request['quantity'];
      if (item['isAvailable'] != true ||
          quantity is! int ||
          quantity < 1 ||
          quantity > 100) {
        _fail('Check dish availability and quantities.', 400);
      }
      return <String, dynamic>{
        'id': 'demo-line-${++_sequence}',
        'menuItemId': item['id'],
        'menuItemName': item['name'],
        'quantity': quantity,
        'unitPrice': item['unitPrice'],
        'taxRate': item['taxRate'],
        'customerNotes': request['customerNotes'] ?? '',
        'itemStatus': 'PENDING'
      };
    }).toList();
  }

  Json _create(Json body, Staff staff) {
    if ('${body['tableNumber'] ?? ''}'.trim().isEmpty) {
      _fail('Enter a table number.', 400);
    }
    final lines = _newLines(body);
    final id = 'demo-order-${++_sequence}';
    final order = <String, dynamic>{
      'id': id,
      'orderNumber': 'ORD-$_sequence',
      'tableNumber': body['tableNumber'],
      'waiterId': staff.id,
      'waiterName': staff.name,
      'orderStatus': 'PENDING',
      'paymentStatus': 'UNPAID',
      'tipAmount': 0,
      'customerNotes': body['customerNotes'] ?? '',
      'parentOrderId': body['parentOrderId'],
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'items': lines
    };
    _totals(order);
    _orders[id] = order;
    return order;
  }

  double _round(double amount) => double.parse(amount.toStringAsFixed(2));
  void _totals(Json order) {
    double subtotal = 0, tax = 0;
    for (final line
        in _lines(order).where((l) => l['itemStatus'] != 'CANCELLED')) {
      final amount = number(line['unitPrice']) * number(line['quantity']);
      subtotal += amount;
      tax += _round(amount * number(line['taxRate']));
    }
    order['subtotal'] = _round(subtotal);
    order['taxTotal'] = _round(tax);
    order['grandTotal'] = _round(subtotal + tax + number(order['tipAmount']));
  }

  Json _initiate(Json order, Json body) {
    final method = body['method'];
    final tip = number(body['tipAmount']);
    if (!['CASH', 'PHONE_PUSH', 'QR_SCAN'].contains(method) ||
        !tip.isFinite ||
        tip < 0) {
      _fail('Check the payment method and tip.', 400);
    }
    if (method == 'PHONE_PUSH' &&
        '${body['customerPhone'] ?? ''}'.trim().isEmpty) {
      _fail('Enter a customer phone number.', 400);
    }
    final base = _round(number(order['subtotal']) + number(order['taxTotal']));
    final total = _round(base + tip);
    final cash = method == 'CASH';
    final tendered = number(body['amountTendered']);
    if (cash && (!tendered.isFinite || tendered < total)) {
      _fail('Cash received must cover the amount due.', 400);
    }
    final id = 'demo-payment-${++_sequence}';
    final payment = <String, dynamic>{
      'id': id,
      'orderId': order['id'],
      'orderNumber': order['orderNumber'],
      'method': method,
      'status': cash ? 'PAID' : 'INITIATED',
      'baseAmount': base,
      'tipAmount': tip,
      'totalAmount': total,
      'customerPhone': body['customerPhone'],
      'qrData': method == 'QR_SCAN' ? 'MAJETE-CORNER:PAYMENT:$_sequence' : null,
      'amountTendered': cash ? tendered : null,
      'changeGiven': cash ? _round(tendered - total) : null,
      'createdAt': DateTime.now().toUtc().toIso8601String()
    };
    order['paymentStatus'] = cash ? 'PAID' : 'PAYMENT_INITIATED';
    order['tipAmount'] = tip;
    _totals(order);
    _payments[id] = payment;
    return payment;
  }
}

class _DemoError implements Exception {
  final String message;
  final int status;
  const _DemoError(this.message, this.status);
}
