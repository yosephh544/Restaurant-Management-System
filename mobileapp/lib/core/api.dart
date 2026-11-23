import 'package:dio/dio.dart';
import 'models.dart';
import 'billing.dart';
import 'permissions.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  final Map<String, dynamic> fields;
  final bool uncertain;
  const ApiException(this.message,
      {this.status, this.fields = const {}, this.uncertain = false});
  @override
  String toString() => message;
}

String normalizeServer(String input, {required bool allowHttp}) {
  final uri = Uri.tryParse(input.trim().replaceFirst(RegExp(r'/+$'), ''));
  if (uri == null ||
      !uri.hasAuthority ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.path != '/api/v1') {
    throw const ApiException(
        'Enter a server URL ending in /api/v1, for example http://192.168.1.2:5012/api/v1.');
  }
  if (!allowHttp && uri.scheme != 'https') {
    throw const ApiException('Release builds require an HTTPS server.');
  }
  return uri.toString();
}

class ApiClient {
  final Dio dio;
  String? authFailureMessage;
  String? Function()? token;
  Future<bool> Function()? refresh;
  void Function()? expired;
  ApiClient(String baseUrl, {Dio? transport}) : dio = transport ?? Dio() {
    setServer(baseUrl);
    dio.options.connectTimeout = const Duration(seconds: 12);
    dio.options.receiveTimeout = const Duration(seconds: 20);
    dio.options.sendTimeout = const Duration(seconds: 20);
    dio.options.validateStatus = (_) => true;
  }
  void setServer(String value) => dio.options.baseUrl = '$value/';
  Future<Json> call(String method, String path,
      {Json? body,
      Json? query,
      bool public = false,
      String? bearerToken,
      bool replay = true}) async {
    Response<dynamic> response;
    try {
      final access = public ? null : bearerToken ?? token?.call();
      response = await dio.request<dynamic>(path,
          data: body,
          queryParameters: query,
          options: Options(method: method, headers: {
            'Accept': 'application/json',
            if (access != null) 'Authorization': 'Bearer $access'
          }));
    } on DioException catch (e) {
      throw ApiException(
          method == 'GET' || public
              ? 'Cannot reach the restaurant server. Check the connection and try again.'
              : 'The server response was not received. Check the order or session before submitting again.',
          uncertain:
              method != 'GET' && e.type != DioExceptionType.badCertificate);
    }
    if (response.statusCode == 401 && !public && bearerToken == null) {
      if (replay && await (refresh?.call() ?? Future.value(false))) {
        return call(method, path, body: body, query: query, replay: false);
      }
      expired?.call();
      throw ApiException(
          authFailureMessage ?? 'Your session expired. Please sign in again.',
          status: 401);
    }
    final j =
        response.data is Map ? jsonObject(response.data) : <String, dynamic>{};
    if ((response.statusCode ?? 500) >= 500) {
      throw ApiException(
          'The restaurant server could not finish this request. Refresh the current record before trying again.',
          status: response.statusCode,
          uncertain: method != 'GET');
    }
    if ((response.statusCode ?? 500) >= 400 || j['success'] == false) {
      final fields =
          j['errors'] is Map ? jsonObject(j['errors']) : <String, dynamic>{};
      final fallback = response.statusCode == 403
          ? 'You do not have access to this action.'
          : response.statusCode == 401
              ? 'Check your username and sign-in credentials.'
              : 'The request could not be completed.';
      final fieldText =
          fields.values.expand((v) => v is List ? v : [v]).join('\n');
      throw ApiException(
          j['message'] as String? ??
              (fieldText.isNotEmpty
                  ? fieldText
                  : j['title'] as String? ?? fallback),
          status: response.statusCode,
          fields: fields);
    }
    if (j.isEmpty || j['success'] != true) {
      throw ApiException(
          'The server returned an unexpected response. Check the server URL.',
          uncertain: method != 'GET');
    }
    return j;
  }

  Future<Json> data(String method, String path,
          {Json? body, bool public = false, String? bearerToken}) async =>
      jsonObject((await call(method, path,
          body: body, public: public, bearerToken: bearerToken))['data']);
}

class RestaurantApi {
  final ApiClient client;
  RestaurantApi(this.client);
  Future<List<RestaurantTable>> tables() async =>
      ((await client.call('GET', 'tables'))['data'] as List)
          .map((j) => RestaurantTable.fromJson(jsonObject(j)))
          .toList();
  Future<Json?> tableSession(String tableId) async {
    final data = (await client.call('GET', 'tables/$tableId/session'))['data'];
    return data == null ? null : jsonObject(data);
  }

  Future<TableBill?> activeBill(String tableId) async {
    final data = (await client.call('GET', 'bills/active/$tableId'))['data'];
    return data == null ? null : TableBill.fromJson(jsonObject(data));
  }

  Future<TableBill> bill(String id) async =>
      TableBill.fromJson(await client.data('GET', 'bills/$id'));
  Future<TableBill?> activeBillForOrder(String orderId) async {
    final data =
        (await client.call('GET', 'bills/active/order/$orderId'))['data'];
    return data == null ? null : TableBill.fromJson(jsonObject(data));
  }

  Future<TableBill> generateBill({String? tableId, String? orderId}) async =>
      TableBill.fromJson(await client.data('POST', 'bills/generate', body: {
        if (tableId != null) 'tableId': tableId,
        if (orderId != null) 'orderId': orderId,
      }));
  Future<Json> myShift() => client.data('GET', 'shifts/me');
  Future<void> reopenBill(String id) async =>
      client.call('POST', 'bills/$id/reopen');
  Future<BillPreview> previewBill(RestaurantOrder order, Staff staff) async {
    if ((!order.takeaway && !staff.can(P.tablesView)) ||
        !staff.can(P.paymentsView)) {
      throw const ApiException(
          'Table and payment access are required. Contact your manager.');
    }
    if (order.takeaway) {
      final current = await this.order(order.id);
      final active = await activeBillForOrder(order.id);
      if (!staff.canTakePayment(current) ||
          !current.canPayBill ||
          (active != null &&
              (!active.payable || !active.orderIds.contains(order.id)))) {
        throw const ApiException(
            'The takeaway order is no longer eligible for payment.');
      }
      return BillPreview(null, active, [current]);
    }
    final matches = (await tables()).where((t) => t.number == order.table);
    if (matches.isEmpty) {
      throw const ApiException('This table is no longer active.');
    }
    final table = matches.first;
    final active = await activeBill(table.id);
    final orders = <RestaurantOrder>[];
    if (active != null) {
      if (!active.orderIds.contains(order.id)) {
        throw const ApiException(
            'This order is not part of the current table bill. Refresh the order.');
      }
      for (final id in active.orderIds) {
        orders.add(await this.order(id));
      }
    } else {
      final session = await tableSession(table.id);
      if (session == null || code(session['status'] as String) != 'ACTIVE') {
        throw const ApiException(
            'There is no open dining session for this table.');
      }
      var page = 1;
      while (true) {
        final data = await this.orders(page: page, search: order.table);
        orders.addAll(data.items.where((o) =>
            o.table == order.table &&
            !o.cancelled &&
            const ['UNPAID', 'RETRACTED'].contains(code(o.paymentStatus))));
        if (page >= data.totalPages) break;
        page++;
      }
      if (!orders.any((o) => o.id == order.id)) {
        throw const ApiException(
            'The order is no longer eligible for billing.');
      }
    }
    if (orders.isEmpty ||
        orders.any((o) =>
            !staff.canTakePayment(o) ||
            !const ['READY', 'SERVED'].contains(code(o.status)))) {
      throw const ApiException(
          'Every order on the table must be ready. Waiters must serve all their orders before payment.');
    }
    return BillPreview(table, active, orders);
  }

  Future<List<MenuCategory>> menu() async =>
      ((await client.call('GET', 'menu/categories'))['data'] as List)
          .map((j) => MenuCategory.fromJson(jsonObject(j)))
          .where((c) => c.active)
          .toList();
  Future<MenuItem> item(String id) async =>
      MenuItem.fromJson(await client.data('GET', 'menu/items/$id'));
  Future<void> availability(String id, bool available) async =>
      client.call('PATCH', 'menu/items/$id/availability',
          body: {'isAvailable': available});
  Future<PageData<RestaurantOrder>> orders(
      {required int page,
      String? waiterId,
      String? status,
      String? payment,
      String search = '',
      bool excludePaid = false,
      bool todayOnly = false}) async {
    final now = DateTime.now();
    final from =
        todayOnly ? DateTime(now.year, now.month, now.day).toUtc() : null;
    final to = todayOnly
        ? DateTime(now.year, now.month, now.day + 1)
            .subtract(const Duration(microseconds: 1))
            .toUtc()
        : null;
    Future<PageData<RestaurantOrder>> fetch(
            int requestedPage, int pageSize) async =>
        PageData.fromJson(
            await client.call('GET', 'orders', query: {
              'page': requestedPage,
              'pageSize': pageSize,
              'sortDesc': true,
              if (waiterId != null) 'waiterId': waiterId,
              if (status != null) 'orderStatus': status,
              if (payment != null) 'paymentStatus': payment,
              if (search.isNotEmpty) 'search': search,
              if (from != null) 'from': from.toIso8601String(),
              if (to != null) 'to': to.toIso8601String()
            }),
            RestaurantOrder.fromJson);

    if (excludePaid && code(payment ?? '') == 'PAID') {
      return const PageData<RestaurantOrder>(
          items: [], page: 1, totalPages: 0, totalCount: 0);
    }
    if (!excludePaid || payment != null) return fetch(page, 20);

    // The API supports exact statuses; exclude paid orders before paging locally.
    final remaining = <String, RestaurantOrder>{};
    var sourcePage = 1;
    while (true) {
      final data = await fetch(sourcePage, 100);
      for (final order in data.items) {
        if (!order.paid) remaining[order.id] = order;
      }
      if (sourcePage >= data.totalPages) break;
      sourcePage++;
    }
    final orders = remaining.values.toList();
    final totalPages = (orders.length / 20).ceil();
    final currentPage = page.clamp(1, totalPages < 1 ? 1 : totalPages).toInt();
    return PageData<RestaurantOrder>(
        items: orders.skip((currentPage - 1) * 20).take(20).toList(),
        page: currentPage,
        totalPages: totalPages,
        totalCount: orders.length);
  }

  Future<RestaurantOrder> order(String id) async =>
      RestaurantOrder.fromJson(await client.data('GET', 'orders/$id'));
  Future<RestaurantOrder> kitchenOrder(String id,
      {String station = 'kitchen'}) async {
    var page = 1;
    while (true) {
      final tickets = await queue(page, station: station);
      for (final ticket in tickets.items) {
        if (ticket.orderId == id) return ticket.asOrder();
      }
      if (page >= tickets.totalPages) break;
      page++;
    }
    throw const ApiException(
        'This ticket is no longer in the active preparation queue.',
        status: 404);
  }

  Future<RestaurantOrder> submitOrder(Json body,
          {String? orderId, bool replacement = false}) async =>
      RestaurantOrder.fromJson(await client.data(
          'POST',
          orderId == null
              ? 'orders'
              : 'orders/$orderId/${replacement ? 'reorder' : 'items'}',
          body: body));
  Future<void> served(String id) async =>
      client.call('PATCH', 'orders/$id/served');
  Future<void> serveItem(String id, String itemId) async =>
      client.call('PATCH', 'orders/$id/items/$itemId/served');
  Future<PageData<KitchenTicket>> queue(int page,
          {String station = 'kitchen'}) async =>
      PageData.fromJson(
          await client.call('GET', '$station/queue',
              query: {'page': page, 'pageSize': 20}),
          KitchenTicket.fromJson);
  Future<void> kitchenStatus(String id, String status,
          {String station = 'kitchen'}) async =>
      client.call('PATCH', '$station/orders/$id/status',
          body: {'status': status});
  Future<void> kitchenItemStatus(String id, String itemId, String status,
          {String station = 'kitchen'}) async =>
      client.call('PATCH', '$station/orders/$id/items/$itemId/status',
          body: {'status': status});
  Future<void> cancel(String id, String reason, String note,
          {String? itemId, String station = 'kitchen'}) async =>
      client.call('POST', '$station/orders/$id/cancel', body: {
        'reasonCode': reason,
        'reasonNote': note,
        if (itemId != null) 'orderItemId': itemId
      });
  Future<PaymentSession> initiate(String id, String method, String phone,
          {double? tendered, String? billId}) async =>
      PaymentSession.fromJson(
              await client.data('POST', 'payments/initiate', body: {
        if (billId == null) 'orderId': id else 'billId': billId,
        'method': method,
        if (phone.isNotEmpty) 'customerPhone': phone,
        if (tendered != null) 'amountTendered': tendered
      }))
          .withRequest(method, phone);
  Future<PaymentSession> recordDigital(String billId, String method,
          {String? receiptUrl,
          String? transactionNumber,
          double? amountPaid}) async =>
      PaymentSession.fromJson(
          await client.data('POST', 'payments/record', body: {
        'billId': billId,
        'method': method,
        if (receiptUrl != null && receiptUrl.isNotEmpty)
          'receiptUrl': receiptUrl,
        if (transactionNumber != null && transactionNumber.isNotEmpty)
          'transactionNumber': transactionNumber,
        if (amountPaid != null) 'amountPaid': amountPaid,
      }));
  Future<PageData<PaymentSession>> payments(
          {int page = 1, String? waiterId, String search = ''}) async =>
      PageData.fromJson(
          await client.call('GET', 'payments', query: {
            'page': page,
            'pageSize': 100,
            if (waiterId != null) 'waiterId': waiterId,
            if (search.isNotEmpty) 'search': search,
          }),
          PaymentSession.fromJson);
  Future<PaymentSession?> findPayment(String id, Staff staff,
      {String search = ''}) async {
    var page = 1;
    while (true) {
      final data = await payments(
          page: page, waiterId: staff.waiter ? staff.id : null, search: search);
      for (final payment in data.items) {
        if (payment.id == id) return payment;
      }
      if (page >= data.totalPages) return null;
      page++;
    }
  }

  Future<List<PaymentSession>> orderPayments(
      RestaurantOrder order, Staff staff) async {
    final result = <PaymentSession>[];
    var page = 1;
    while (true) {
      final data = await payments(
          page: page,
          waiterId: staff.waiter ? staff.id : null,
          search: order.orderNumber);
      result.addAll(data.items.where((payment) => payment.orderId == order.id));
      if (page >= data.totalPages) return result;
      page++;
    }
  }

  Future<String> paymentStatus(String id) async =>
      (await client.data('GET', 'payments/$id/status'))['status'] as String;
  Future<String> retract(String id) async =>
      (await client.data('POST', 'payments/$id/retract'))['status'] as String;
  Future<PaymentSession> refund(String id) async =>
      PaymentSession.fromJson(await client.data('POST', 'payments/$id/refund'));
  Future<PaymentSession> transfer(String id, String target) async =>
      PaymentSession.fromJson(await client.data('POST', 'payments/$id/transfer',
          body: {'targetOrderId': target}));
  Future<PageData<TipEntry>> tips(int page) async => PageData.fromJson(
      await client.call('GET', 'payments/tips/my-ledger',
          query: {'page': page, 'pageSize': 20}),
      TipEntry.fromJson);
}
