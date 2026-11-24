import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/models.dart';
import 'support.dart';

Json ticket(String id, String stationStatus,
        {String orderStatus = 'PREPARING'}) =>
    {
      'orderId': id,
      'orderNumber': id,
      'tableNumber': 'T12',
      'orderStatus': orderStatus,
      'stationStatus': stationStatus,
      'paymentStatus': 'UNPAID',
      'createdAt': '2026-11-23T08:30:00Z',
      'items': [],
    };

FakeAdapter queueServer(List<Json> tickets) => FakeAdapter((request) async {
      final page = request.queryParameters['page'] as int;
      final pageSize = request.queryParameters['pageSize'] as int;
      return (
        status: 200,
        body: {
          'success': true,
          'data': tickets.skip((page - 1) * pageSize).take(pageSize).toList(),
          'pagination': {
            'page': page,
            'pageSize': pageSize,
            'totalPages': (tickets.length / pageSize).ceil(),
            'totalCount': tickets.length,
          },
        },
      );
    });

RestaurantApi apiFor(FakeAdapter adapter) => RestaurantApi(
    ApiClient(testServer, transport: Dio()..httpClientAdapter = adapter));

void main() {
  test('active queue follows station status when overall order status differs',
      () async {
    final adapter = queueServer([
      ticket('ready-food', 'READY'),
      ticket('pending-food', 'PENDING'),
      ticket('cooking-food', 'PREPARING', orderStatus: 'READY'),
      ticket('cancelled-food', 'CANCELLEDBYKITCHEN'),
    ]);
    final data = await apiFor(adapter).queue(1, activeOnly: true);
    expect(data.items.map((t) => t.orderId), ['pending-food', 'cooking-food']);
    expect(data.totalCount, 2);
    expect(data.totalPages, 1);
  });

  test('ready server pages do not hide active tickets or inflate mobile paging',
      () async {
    final adapter = queueServer([
      for (var i = 0; i < 205; i++) ticket('ready-$i', 'READY'),
      for (var i = 0; i < 23; i++) ticket('active-$i', 'PREPARING'),
    ]);
    final api = apiFor(adapter);
    final first = await api.queue(1, station: 'bar', activeOnly: true);
    expect(first.items, hasLength(20));
    expect(first.items.first.orderId, 'active-0');
    expect(first.totalCount, 23);
    expect(first.totalPages, 2);
    expect(adapter.requests, hasLength(3));
    expect(adapter.requests.every((r) => r.uri.path.endsWith('/bar/queue')),
        isTrue);

    final second = await api.queue(2, station: 'bar', activeOnly: true);
    expect(second.page, 2);
    expect(second.items.map((t) => t.orderId),
        ['active-20', 'active-21', 'active-22']);
  });

  test('all ready tickets produce an empty active queue and zero counts',
      () async {
    final adapter = queueServer([ticket('ready', 'READY')]);
    final data = await apiFor(adapter).queue(4, activeOnly: true);
    expect(data.items, isEmpty);
    expect(data.page, 1);
    expect(data.totalCount, 0);
    expect(data.totalPages, 0);
    // Details and notification readers still have the raw API response.
    final ready = await apiFor(adapter).kitchenOrder('ready');
    expect(ready.status, 'READY');
  });
}
