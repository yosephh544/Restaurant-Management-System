import 'package:intl/intl.dart';
import 'permissions.dart';

typedef Json = Map<String, dynamic>;
Json jsonObject(dynamic value) => Map<String, dynamic>.from(value as Map);
double number(dynamic value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
DateTime? date(dynamic value) {
  if (value == null) return null;
  var text = '$value';
  // SQL Server DateTime values may omit the suffix; backend timestamps are UTC.
  if (!RegExp(r'(Z|[+-]\d{2}:?\d{2})$', caseSensitive: false).hasMatch(text)) {
    text += 'Z';
  }
  return DateTime.tryParse(text)?.toUtc();
}

String code(String value) =>
    value.replaceAll(RegExp(r'[^a-zA-Z]'), '').toUpperCase();
String normalizeOrderType(String value) {
  final normalized = code(value);
  return normalized == 'DINEIN' ? 'DINE_IN' : normalized;
}

String money(num value) =>
    'ETB ${NumberFormat('#,##0.00', 'en').format(value)}';
// Display only: keep the full reference in requests, storage and payment records.
String shortOrderNumber(String value) {
  final match = RegExp(r'^(?:O-\d{6}-|ORD-)(\d+)$', caseSensitive: false)
      .firstMatch(value.trim());
  return match == null ? value : '#${match.group(1)}';
}

String statusLabel(String value) => switch (code(value)) {
      'PAYMENTINITIATED' || 'INITIATED' => 'Payment pending',
      'CANCELLEDBYKITCHEN' => 'Kitchen cancelled',
      'REFUNDPENDING' => 'Refund pending',
      'PHONEPUSH' => 'Phone request',
      'QRSCAN' => 'QR code',
      'USSD' => 'USSD phone request',
      'TELEBIRR' => 'Telebirr',
      'CBE' => 'CBE',
      'PREPARED' => 'Ready',
      'PAIDOUT' => 'Paid out',
      'NOTSUBMITTED' => 'Not submitted',
      _ => value.isEmpty
          ? 'Unknown'
          : '${value[0].toUpperCase()}${value.substring(1).toLowerCase()}',
    };

class Staff {
  final String id, name, phone, role, username;
  final bool active;
  final List<String> permissions;
  const Staff(
      {required this.id,
      required this.name,
      required this.phone,
      required this.role,
      required this.active,
      this.username = '',
      this.permissions = const []});
  factory Staff.fromJson(Json j) => Staff(
      id: j['id'] as String,
      name: j['fullName'] as String,
      phone: j['phone'] as String? ?? '',
      username: j['username'] as String? ?? '',
      role: j['role'] as String,
      active: j['isActive'] != false,
      permissions: List<String>.from(j['permissions'] as List? ?? []));
  bool can(String permission) =>
      active &&
      permissions.contains(permission) &&
      (!P.waiterActions.contains(permission) || waiter);
  bool get canCreateOrders => waiter && can(P.ordersCreate) && can(P.menuView);
  bool get canReplaceOrders =>
      waiter && can(P.ordersReorder) && can(P.menuView);
  bool get canAddItems => waiter && can(P.ordersAdd) && can(P.menuView);
  bool canServeOrder(RestaurantOrder order) =>
      waiter &&
      can(P.ordersServe) &&
      ownsOrOversees(order) &&
      code(order.status) == 'READY';
  bool canServeItem(RestaurantOrder order, OrderLine item) =>
      waiter &&
      can(P.ordersServe) &&
      ownsOrOversees(order) &&
      !order.cancelled &&
      item.ready;
  bool ownsOrOversees(RestaurantOrder order) => !waiter || order.waiterId == id;
  bool canTakePayment(RestaurantOrder order) =>
      can(P.paymentsInitiate) &&
      can(P.paymentsView) &&
      ownsOrOversees(order) &&
      (!waiter || code(order.status) == 'SERVED');
  bool get supported =>
      const ['WAITER', 'KITCHEN', 'CASHIER', 'BARTENDER'].contains(code(role));
  bool get waiter => code(role) == 'WAITER';
  bool get kitchen => code(role) == 'KITCHEN';
  bool get cashier => code(role) == 'CASHIER';
  bool get bartender => code(role) == 'BARTENDER';
  bool get preparationStaff => kitchen || bartender;
  String get station => bartender ? 'bar' : 'kitchen';
  bool get canViewStation =>
      preparationStaff && can(bartender ? P.barView : P.kitchenView);
  bool get canUpdateStation =>
      preparationStaff && can(bartender ? P.barUpdate : P.kitchenUpdate);
  bool get canCancelStation =>
      preparationStaff && can(bartender ? P.barCancel : P.kitchenCancel);
  Json toJson() => {
        'id': id,
        'fullName': name,
        'phone': phone,
        'username': username,
        'role': role,
        'isActive': active,
        'permissions': permissions
      };
}

class Session {
  final String accessToken, refreshToken;
  final Staff staff;
  final DateTime? expiry;
  const Session(
      {required this.accessToken,
      required this.refreshToken,
      required this.staff,
      this.expiry});
  factory Session.fromJson(Json j) => Session(
      accessToken: j['accessToken'] as String,
      refreshToken: j['refreshToken'] as String,
      staff: Staff.fromJson(jsonObject(j['staff'])),
      expiry: date(j['accessTokenExpiry']));
  factory Session.fromTokens(Json j, Staff staff) => Session(
      accessToken: j['accessToken'] as String,
      refreshToken: j['refreshToken'] as String,
      staff: staff,
      expiry: date(j['accessTokenExpiry']));
  Session withStaff(Staff value) => Session(
      accessToken: accessToken,
      refreshToken: refreshToken,
      staff: value,
      expiry: expiry);
  Json toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'staff': staff.toJson(),
        'accessTokenExpiry': expiry?.toIso8601String()
      };
}

class MenuItem {
  final String id, categoryId, name, nameAm, description, categoryName;
  final String? image;
  final double price, taxRate;
  final bool available;
  const MenuItem(
      {required this.id,
      required this.categoryId,
      required this.name,
      required this.price,
      required this.taxRate,
      required this.available,
      this.nameAm = '',
      this.description = '',
      this.categoryName = '',
      this.image});
  factory MenuItem.fromJson(Json j) => MenuItem(
      id: j['id'] as String,
      categoryId: j['categoryId'] as String,
      name: j['name'] as String,
      nameAm: j['nameAm'] as String? ?? '',
      description: j['description'] as String? ?? '',
      categoryName: j['categoryName'] as String? ?? '',
      image: j['imageUrl'] as String?,
      price: number(j['unitPrice']),
      taxRate: number(j['taxRate']),
      available: j['isAvailable'] == true);
  Json toJson() => {
        'id': id,
        'categoryId': categoryId,
        'name': name,
        'nameAm': nameAm,
        'description': description,
        'categoryName': categoryName,
        'imageUrl': image,
        'unitPrice': price,
        'taxRate': taxRate,
        'isAvailable': available
      };
}

class MenuCategory {
  final String id, name, nameAm;
  final bool active;
  final List<MenuItem> items;
  const MenuCategory(
      {required this.id,
      required this.name,
      this.nameAm = '',
      required this.active,
      required this.items});
  factory MenuCategory.fromJson(Json j) => MenuCategory(
      id: j['id'] as String,
      name: j['name'] as String,
      nameAm: j['nameAm'] as String? ?? '',
      active: j['isActive'] == true,
      items: (j['items'] as List? ?? [])
          .map((v) => MenuItem.fromJson(jsonObject(v)))
          .toList());
}

class OrderLine {
  final String id, menuId, name, nameAm, note, status;
  final int quantity;
  final double price;
  const OrderLine(
      {required this.id,
      required this.menuId,
      required this.name,
      required this.quantity,
      required this.price,
      required this.status,
      this.nameAm = '',
      this.note = ''});
  factory OrderLine.fromJson(Json j) => OrderLine(
      id: j['id'] as String,
      menuId: j['menuItemId'] as String,
      name: j['menuItemName'] as String? ?? 'Menu item',
      nameAm: j['menuItemNameAm'] as String? ?? '',
      quantity: (j['quantity'] as num).toInt(),
      price: number(j['unitPrice']),
      status: j['itemStatus'] as String? ?? 'UNKNOWN',
      note: j['customerNotes'] as String? ?? '');
  bool get cancelled => code(status) == 'CANCELLED';
  bool get ready => code(status) == 'PREPARED';
  bool get served => code(status) == 'SERVED';
  bool get active => code(status) == 'ACTIVE';
}

class RestaurantOrder {
  final String id,
      orderNumber,
      table,
      waiterId,
      waiterName,
      status,
      paymentStatus,
      note;
  final String? parentId;
  final String orderType;
  final double takeawayFee;
  final int queuePosition;
  final double subtotal, tax, tip, total;
  final DateTime created;
  final List<OrderLine> items;
  const RestaurantOrder(
      {required this.id,
      required this.orderNumber,
      required this.table,
      required this.waiterId,
      required this.waiterName,
      required this.status,
      required this.paymentStatus,
      required this.subtotal,
      required this.tax,
      required this.tip,
      required this.total,
      required this.created,
      required this.items,
      this.note = '',
      this.orderType = 'DINE_IN',
      this.takeawayFee = 0,
      this.queuePosition = 0,
      this.parentId});
  factory RestaurantOrder.fromJson(Json j) => RestaurantOrder(
      id: j['id'] as String,
      orderNumber: j['orderNumber'] as String,
      table: j['tableNumber'] as String,
      orderType: normalizeOrderType(j['orderType'] as String? ?? 'DINE_IN'),
      takeawayFee: number(j['takeawayFee']),
      queuePosition: (j['queuePosition'] as num?)?.toInt() ?? 0,
      waiterId: j['waiterId'] as String,
      waiterName: j['waiterName'] as String? ?? '',
      status: j['orderStatus'] as String,
      paymentStatus: j['paymentStatus'] as String,
      parentId: j['parentOrderId'] as String?,
      subtotal: number(j['subtotal']),
      tax: number(j['taxTotal']),
      tip: number(j['tipAmount']),
      total: number(j['grandTotal']),
      created: date(j['createdAt']) ?? DateTime.now().toUtc(),
      note: j['customerNotes'] as String? ?? '',
      items: (j['items'] as List? ?? [])
          .map((v) => OrderLine.fromJson(jsonObject(v)))
          .toList());
  bool get paid => code(paymentStatus) == 'PAID';
  bool get takeout => code(orderType) == 'TAKEOUT';

  /// Table-less ticket (takeaway or takeout) that is billed and paid by order.
  bool get takeaway => normalizeOrderType(orderType) != 'DINE_IN';
  String get locationLabel => takeout
      ? 'Takeout'
      : takeaway
          ? 'Takeaway'
          : 'Table $table';
  double get charge => subtotal + tax + takeawayFee;
  bool get refundable =>
      served || cancelled || code(paymentStatus) == 'REFUNDPENDING';
  bool get createdToday {
    final now = DateTime.now();
    final local = created.toLocal();
    return local.year == now.year &&
        local.month == now.month &&
        local.day == now.day;
  }

  bool get pendingPayment => code(paymentStatus) == 'PAYMENTINITIATED';
  bool get cancelled => code(status) == 'CANCELLEDBYKITCHEN';
  bool get hasCancelledItems => items.any((i) => i.cancelled);
  // Kept for older callers; cancelled lines no longer imply incorrect totals.
  bool get needsReview => hasCancelledItems;
  bool get served => code(status) == 'SERVED';
  bool get payableStage => const ['READY', 'SERVED'].contains(code(status));
  bool get canPay =>
      payableStage &&
      !cancelled &&
      total > 0 &&
      const ['UNPAID', 'RETRACTED', 'TRANSFERRED']
          .contains(code(paymentStatus));
  bool get canPayBill =>
      canPay || (pendingPayment && payableStage && !cancelled && total > 0);
  bool get canKitchenCancel =>
      const ['PENDING', 'PREPARING'].contains(code(status)) &&
      !items.any((item) => item.served);
  bool get canAdd =>
      const ['UNPAID', 'RETRACTED'].contains(code(paymentStatus)) &&
      !cancelled &&
      const ['PENDING', 'PREPARING', 'READY', 'SERVED'].contains(code(status));
}

class KitchenTicket {
  final String orderStatus;
  final String orderType;
  final int queuePosition;
  final String orderId,
      orderNumber,
      table,
      waiterName,
      status,
      paymentStatus,
      note;
  final DateTime created;
  final List<OrderLine> items;
  const KitchenTicket(
      {required this.orderId,
      required this.orderNumber,
      required this.table,
      required this.waiterName,
      required this.status,
      required this.paymentStatus,
      required this.created,
      required this.items,
      this.orderStatus = '',
      this.orderType = 'DINE_IN',
      this.queuePosition = 0,
      this.note = ''});
  factory KitchenTicket.fromJson(Json j) => KitchenTicket(
      orderId: j['orderId'] as String,
      orderNumber: j['orderNumber'] as String,
      table: j['tableNumber'] as String,
      orderType: normalizeOrderType(j['orderType'] as String? ?? 'DINE_IN'),
      queuePosition: (j['queuePosition'] as num?)?.toInt() ?? 0,
      waiterName: j['waiterName'] as String? ?? '',
      status: j['stationStatus'] as String? ?? j['orderStatus'] as String,
      orderStatus: j['orderStatus'] as String,
      paymentStatus: j['paymentStatus'] as String,
      note: j['customerNotes'] as String? ?? '',
      created: date(j['createdAt']) ?? DateTime.now().toUtc(),
      items: (j['items'] as List? ?? [])
          .map((v) => OrderLine.fromJson(jsonObject(v)))
          .toList());
  RestaurantOrder asOrder() => RestaurantOrder(
      id: orderId,
      orderNumber: orderNumber,
      table: table,
      orderType: orderType,
      queuePosition: queuePosition,
      waiterId: '',
      waiterName: waiterName,
      status: status,
      paymentStatus: paymentStatus,
      subtotal: 0,
      tax: 0,
      tip: 0,
      total: 0,
      created: created,
      items: items,
      note: note);
}

class PageData<T> {
  final List<T> items;
  final int page, totalPages, totalCount;
  const PageData(
      {required this.items,
      required this.page,
      required this.totalPages,
      required this.totalCount});
  factory PageData.fromJson(Json j, T Function(Json) decode) {
    final p = jsonObject(j['pagination']);
    return PageData(
        items: (j['data'] as List).map((v) => decode(jsonObject(v))).toList(),
        page: (p['page'] as num).toInt(),
        totalPages: (p['totalPages'] as num).toInt(),
        totalCount: (p['totalCount'] as num).toInt());
  }
}

class PaymentSession {
  final String id, orderId, orderNumber, method, status;
  final String? qrData, phone, requestedMethod, billId;
  final double? tendered, change;
  final double base, tip, total;
  final DateTime created;
  final Json metadata;
  const PaymentSession(
      {required this.id,
      required this.orderId,
      required this.orderNumber,
      required this.method,
      required this.status,
      required this.base,
      required this.tip,
      required this.total,
      required this.created,
      this.qrData,
      this.billId,
      this.phone,
      this.requestedMethod,
      this.tendered,
      this.metadata = const {},
      this.change});
  factory PaymentSession.fromJson(Json j) => PaymentSession(
      id: j['id'] as String,
      billId: j['billId'] as String?,
      orderId: j['orderId'] as String,
      orderNumber: j['orderNumber'] as String? ?? '',
      method: j['method'] as String,
      metadata: {
        for (final key in [
          'receiptUrl',
          'receiptReference',
          'amountPaid',
          'verificationStatus',
          'verifiedAmount',
          'verifiedPayerName',
          'verifiedBank',
          'verifiedAt',
          'verifiedVia',
          'verificationNote',
          'settledAt',
          'orderStatus',
          'orderPaymentStatus',
          'waiterId',
          'billNumber',
          'tipPaidOut',
        ])
          if (j.containsKey(key)) key: j[key]
      },
      status: j['status'] as String,
      base: number(j['baseAmount']),
      tip: number(j['tipAmount']),
      total: number(j['totalAmount']),
      qrData: j['qrData'] as String?,
      phone: j['customerPhone'] as String?,
      requestedMethod: j['requestedMethod'] as String?,
      tendered:
          j['amountTendered'] == null ? null : number(j['amountTendered']),
      change: j['changeGiven'] == null ? null : number(j['changeGiven']),
      created: date(j['createdAt']) ?? DateTime.now().toUtc());
  bool get cash => code(method) == 'CASH';
  bool get receiptPayment => const ['TELEBIRR', 'CBE'].contains(code(method));
  bool get testPayment =>
      const ['PHONEPUSH', 'QRSCAN', 'USSD'].contains(code(method));
  String get verification =>
      metadata['verificationStatus'] as String? ?? 'NOT_REQUIRED';
  bool get pending => code(status) == 'INITIATED';
  bool get paid => code(status) == 'PAID';
  String get methodLabel => statusLabel(requestedMethod ?? method);
  PaymentSession withSavedDetails(PaymentSession saved) =>
      PaymentSession.fromJson({
        ...saved.toJson(),
        ...toJson(),
        'qrData': qrData ?? saved.qrData,
        'customerPhone': phone ?? saved.phone,
        'requestedMethod': saved.requestedMethod ?? requestedMethod,
      });
  PaymentSession withRequest(String selected, String customerPhone) =>
      PaymentSession(
          id: id,
          billId: billId,
          orderId: orderId,
          orderNumber: orderNumber,
          method: method,
          status: status,
          base: base,
          tip: tip,
          total: total,
          created: created,
          qrData: qrData,
          phone: customerPhone.isEmpty ? phone : customerPhone,
          requestedMethod: selected,
          metadata: metadata,
          tendered: tendered,
          change: change);
  Json toJson() => {
        ...metadata,
        'id': id,
        'orderId': orderId,
        'billId': billId,
        'orderNumber': orderNumber,
        'method': method,
        'status': status,
        'baseAmount': base,
        'tipAmount': tip,
        'totalAmount': total,
        'qrData': qrData,
        'customerPhone': phone,
        'requestedMethod': requestedMethod,
        'amountTendered': tendered,
        'changeGiven': change,
        'createdAt': created.toIso8601String()
      };
  PaymentSession withStatus(String value) => PaymentSession(
      id: id,
      billId: billId,
      orderId: orderId,
      orderNumber: orderNumber,
      method: method,
      status: value,
      base: base,
      tip: tip,
      total: total,
      created: created,
      qrData: qrData,
      phone: phone,
      requestedMethod: requestedMethod,
      metadata: metadata,
      tendered: tendered,
      change: change);
}

class TipEntry {
  final String id, orderNumber, status;
  final double amount;
  final DateTime created;
  const TipEntry(
      {required this.id,
      required this.orderNumber,
      required this.status,
      required this.amount,
      required this.created});
  factory TipEntry.fromJson(Json j) => TipEntry(
      id: j['tipId'] as String,
      orderNumber: j['orderNumber'] as String,
      status: j['payoutStatus'] as String,
      amount: number(j['tipAmount']),
      created: date(j['createdAt']) ?? DateTime.now().toUtc());
}

class DraftLine {
  final MenuItem item;
  final int quantity;
  final String note;
  const DraftLine(this.item, this.quantity, this.note);
  DraftLine copy({int? quantity, String? note}) =>
      DraftLine(item, quantity ?? this.quantity, note ?? this.note);
  Json toJson() => {'item': item.toJson(), 'quantity': quantity, 'note': note};
  Json toRequest() => {
        'menuItemId': item.id,
        'quantity': quantity,
        'customerNotes': note.isEmpty ? null : note
      };
  factory DraftLine.fromJson(Json j) => DraftLine(
      MenuItem.fromJson(jsonObject(j['item'])),
      (j['quantity'] as num).toInt(),
      j['note'] as String? ?? '');
}
