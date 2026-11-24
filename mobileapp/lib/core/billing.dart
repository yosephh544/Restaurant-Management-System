import 'models.dart';

class RestaurantTable {
  final String id, number, name, status;
  const RestaurantTable(this.id, this.number, this.name, this.status);
  factory RestaurantTable.fromJson(Json j) => RestaurantTable(j['id'] as String,
      j['number'] as String, j['name'] as String? ?? '', j['status'] as String);
  String get label => name.isEmpty ? 'Table $number' : 'Table $number · $name';
}

class TableBill {
  final String id, table, billNumber, status, orderType;
  final String? tableId;
  final double subtotal, tax, discount, tip, total;
  final List<Json> items;
  const TableBill(
      {required this.id,
      required this.tableId,
      required this.table,
      required this.billNumber,
      required this.status,
      required this.subtotal,
      required this.tax,
      required this.discount,
      required this.tip,
      required this.total,
      this.orderType = 'DINE_IN',
      required this.items});
  factory TableBill.fromJson(Json j) => TableBill(
      id: j['id'] as String,
      tableId: j['tableId'] as String?,
      orderType: j['orderType'] as String? ?? 'DINE_IN',
      table: j['tableNumber'] as String,
      billNumber: j['billNumber'] as String,
      status: j['status'] as String,
      subtotal: number(j['subtotal']),
      tax: number(j['taxTotal']),
      discount: number(j['discountAmount']),
      tip: number(j['tipAmount']),
      total: number(j['grandTotal']),
      items: (j['items'] as List).map(jsonObject).toList());
  Set<String> get orderIds => items.map((j) => j['orderId'] as String).toSet();
  bool get payable =>
      const ['REQUESTED', 'PAYMENTINITIATED'].contains(code(status));
  double get base => subtotal + tax - discount;
  bool get takeout => code(orderType) == 'TAKEOUT';
  /// Table-less bill (takeaway or takeout) that is paid by order.
  bool get takeaway => code(orderType) != 'DINE_IN';
  String get locationLabel => takeout
      ? 'Takeout'
      : takeaway
          ? 'Takeaway'
          : 'Table $table';
  double get takeawayFee => items
      .where((item) =>
          item['orderItemId'] == null &&
          item['description'] == 'Takeaway packaging fee')
      .fold(0, (sum, item) => sum + number(item['lineTotal']));
}

class BillPreview {
  final RestaurantTable? table;
  final TableBill? bill;
  final List<RestaurantOrder> orders;
  const BillPreview(this.table, this.bill, this.orders);
  double get subtotal =>
      bill?.subtotal ??
      orders.fold(0, (sum, o) => sum + o.subtotal + o.takeawayFee);
  double get tax => bill?.tax ?? orders.fold(0, (sum, o) => sum + o.tax);
  double get total => bill?.total ?? subtotal + tax;
  double get takeawayFee =>
      bill?.takeawayFee ?? orders.fold(0, (sum, o) => sum + o.takeawayFee);
  String get locationLabel => orders.first.locationLabel;
}
