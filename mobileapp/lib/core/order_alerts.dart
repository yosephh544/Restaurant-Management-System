import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api.dart';
import 'models.dart';
import 'permissions.dart';

enum AlertAudience { waiter, kitchen, bar }

enum OrderAlertKind { ready, newOrder, itemsAdded }

AlertAudience? alertAudienceFor(Staff? staff) {
  if (staff == null || !staff.active) return null;
  if (staff.waiter && staff.can(P.ordersView)) return AlertAudience.waiter;
  if (staff.kitchen && staff.can(P.kitchenView)) return AlertAudience.kitchen;
  if (staff.bartender && staff.can(P.barView)) return AlertAudience.bar;
  return null;
}

class AlertOrder {
  final String id, number, table;
  final Set<String> itemIds;
  const AlertOrder(this.id, this.number, this.table, {this.itemIds = const {}});
}

class AlertChange {
  final AlertOrder order;
  final OrderAlertKind kind;
  final bool announce;
  const AlertChange(this.order, this.kind, {this.announce = true});
}

/// A complete successful snapshot is required before advancing event history.
class OrderAlertDetector {
  final AlertAudience audience;
  bool _initialized = false;
  final Map<String, Set<String>> _seen = {};
  OrderAlertDetector(this.audience);

  List<AlertChange> accept(List<AlertOrder> orders) {
    final changes = <AlertChange>[];
    final records = {for (final order in orders) order.id: order};
    for (final order in records.values) {
      final known = _seen[order.id];
      if (known == null) {
        _seen[order.id] = {...order.itemIds};
        if (audience == AlertAudience.waiter) {
          // Existing ready orders appear silently in the notification list.
          changes.add(
              AlertChange(order, OrderAlertKind.ready, announce: _initialized));
        } else if (_initialized) {
          changes.add(AlertChange(order, OrderAlertKind.newOrder));
        }
      } else {
        final added = order.itemIds.difference(known);
        if (added.isNotEmpty) {
          known.addAll(added);
          changes.add(AlertChange(
              order,
              audience == AlertAudience.waiter
                  ? OrderAlertKind.ready
                  : OrderAlertKind.itemsAdded));
        }
      }
    }
    _initialized = true;
    return changes;
  }
}

class OrderAlert {
  final String id, scope, orderId, number, table;
  final OrderAlertKind kind;
  final AlertAudience audience;
  final DateTime created;
  final bool read;
  const OrderAlert(
      {required this.id,
      required this.scope,
      required this.orderId,
      required this.number,
      required this.table,
      required this.kind,
      required this.audience,
      required this.created,
      this.read = false});

  String get title => switch (kind) {
        OrderAlertKind.ready => 'Order ready',
        OrderAlertKind.newOrder =>
          audience == AlertAudience.bar ? 'New bar order' : 'New kitchen order',
        OrderAlertKind.itemsAdded => 'Items added to order',
      };
  String get body => '${shortOrderNumber(number)} · '
      '${code(table) == 'TAKEAWAY' ? 'Takeaway' : 'Table $table'}';
  String get route => kind == OrderAlertKind.ready
      ? '/orders/${Uri.encodeComponent(orderId)}'
      : '/queue/orders/${Uri.encodeComponent(orderId)}';
  OrderAlert markRead() => OrderAlert(
      id: id,
      scope: scope,
      orderId: orderId,
      number: number,
      table: table,
      kind: kind,
      audience: audience,
      created: created,
      read: true);
  Json toJson() => {
        'id': id,
        'scope': scope,
        'orderId': orderId,
        'number': number,
        'table': table,
        'kind': kind.name,
        'audience': audience.name,
        'created': created.toUtc().toIso8601String()
      };
  factory OrderAlert.fromJson(Json j) => OrderAlert(
      id: j['id'] as String,
      scope: j['scope'] as String,
      orderId: j['orderId'] as String,
      number: j['number'] as String,
      table: j['table'] as String,
      kind: OrderAlertKind.values.byName(j['kind'] as String),
      audience: AlertAudience.values.byName(j['audience'] as String),
      created: DateTime.parse(j['created'] as String));
}

abstract class OrderNotificationSink {
  bool get supported;
  Future<void> initialize(void Function(OrderAlert) onTap);
  Future<bool> requestPermission({bool force = false});
  Future<void> show(OrderAlert alert);
  Future<void> cancelAll();
}

Future<List<AlertOrder>> fetchAlertOrders(
    RestaurantApi api, Staff staff) async {
  final audience = alertAudienceFor(staff);
  if (audience == null) return [];
  final records = <String, AlertOrder>{};
  var page = 1;
  while (true) {
    if (audience == AlertAudience.waiter) {
      final data =
          await api.orders(page: page, waiterId: staff.id, status: 'Ready');
      for (final order in data.items) {
        if (order.waiterId == staff.id && code(order.status) == 'READY') {
          records[order.id] = AlertOrder(
              order.id, order.orderNumber, order.table,
              itemIds: order.items
                  .where((item) => !item.cancelled)
                  .map((item) => item.id)
                  .toSet());
        }
      }
      if (page >= data.totalPages) break;
    } else {
      final data = await api.queue(page, station: staff.station);
      for (final ticket in data.items) {
        records[ticket.orderId] = AlertOrder(
            ticket.orderId, ticket.orderNumber, ticket.table,
            itemIds: ticket.items
                .where((item) => !item.cancelled)
                .map((item) => item.id)
                .toSet());
      }
      if (page >= data.totalPages) break;
    }
    page++;
  }
  return records.values.toList();
}

class OrderAlertsState {
  final String? scope, error;
  final bool enabled, phoneSupported, phoneEnabled;
  final List<OrderAlert> entries, recent;
  final int delivery;
  final DateTime? checked;
  const OrderAlertsState(
      {this.scope,
      this.error,
      this.enabled = false,
      this.phoneSupported = false,
      this.phoneEnabled = false,
      this.entries = const [],
      this.recent = const [],
      this.delivery = 0,
      this.checked});
  int get unread => entries.where((alert) => !alert.read).length;
  OrderAlertsState copy(
          {String? error,
          bool clearError = false,
          bool? phoneEnabled,
          List<OrderAlert>? entries,
          List<OrderAlert>? recent,
          int? delivery,
          DateTime? checked}) =>
      OrderAlertsState(
          scope: scope,
          enabled: enabled,
          phoneSupported: phoneSupported,
          phoneEnabled: phoneEnabled ?? this.phoneEnabled,
          error: clearError ? null : error ?? this.error,
          entries: List.unmodifiable(entries ?? this.entries),
          recent: List.unmodifiable(recent ?? this.recent),
          delivery: delivery ?? this.delivery,
          checked: checked ?? this.checked);
}

class OrderAlertsController extends StateNotifier<OrderAlertsState> {
  final Future<List<AlertOrder>> Function(Staff) fetch;
  final OrderNotificationSink sink;
  final Duration interval;
  final DateTime Function() now;
  final Map<String, OrderAlertDetector> _detectors = {};
  Staff? _staff;
  String? _scope;
  bool _foreground = true, _configured = false;
  OrderAlert? _pendingOpen;
  int _generation = 0, _failures = 0, _serial = 0, _delivery = 0;
  Timer? _timer;
  Future<void>? _pending;
  Future<void> _platformWork = Future.value();
  void Function(OrderAlert)? onOpen;
  OrderAlertsController(
      {required this.fetch,
      required this.sink,
      this.interval = const Duration(seconds: 5),
      DateTime Function()? now})
      : now = now ?? DateTime.now,
        super(const OrderAlertsState());

  bool get foreground => _foreground;
  String? get currentScope => _scope;
  void configure(Staff? staff, String server) {
    final audience = alertAudienceFor(staff);
    final scope =
        audience == null ? null : '$server/${staff!.id}/${audience.name}';
    _staff = staff;
    if (staff != null && audience == null) _pendingOpen = null;
    if (_configured && _scope == scope) return;
    _configured = true;
    _generation++;
    _scope = scope;
    _timer?.cancel();
    _pending = null;
    _failures = 0;
    state = OrderAlertsState(
        scope: scope,
        enabled: scope != null,
        phoneSupported: sink.supported,
        delivery: _delivery);
    if (scope != null && _pendingOpen != null) {
      final pending = _pendingOpen!;
      _pendingOpen = null;
      open(pending);
    }
    final generation = _generation;
    _platformWork = _platformWork.then((_) async {
      await sink.initialize(open);
      await sink.cancelAll();
      if (mounted && generation == _generation && scope != null) {
        final allowed = await sink.requestPermission();
        if (mounted && generation == _generation) {
          state = state.copy(phoneEnabled: allowed);
        }
      }
    }).catchError((Object _) {});
    if (scope != null) {
      _detectors.putIfAbsent(scope, () => OrderAlertDetector(audience!));
      unawaited(pollNow());
    }
  }

  void setForeground(bool foreground) {
    _foreground = foreground;
    _timer?.cancel();
    if (foreground && _scope != null) unawaited(pollNow());
  }

  Future<void> enablePhoneAlerts() async {
    final generation = _generation;
    if (_scope == null) return;
    _platformWork = _platformWork.then((_) async {
      final allowed = await sink.requestPermission(force: true);
      if (mounted && generation == _generation) {
        state = state.copy(phoneEnabled: allowed);
      }
    }).catchError((Object _) {});
    await _platformWork;
  }

  Future<void> pollNow() {
    if (!mounted || !_foreground || _scope == null) return Future.value();
    if (_pending != null) return _pending!;
    final pending = _poll();
    _pending = pending;
    return pending.whenComplete(() {
      if (identical(_pending, pending)) _pending = null;
    });
  }

  Future<void> _poll() async {
    final generation = _generation;
    final scope = _scope!;
    final staff = _staff!;
    try {
      final records = await fetch(staff);
      if (!mounted || generation != _generation || !_foreground) return;
      final changes = _detectors[scope]!.accept(records);
      final alerts = <OrderAlert>[];
      final recent = <OrderAlert>[];
      for (final change in changes) {
        final alert = OrderAlert(
            id: '${change.order.id}/${change.kind.name}/${now().microsecondsSinceEpoch}/${++_serial}',
            scope: scope,
            orderId: change.order.id,
            number: change.order.number,
            table: change.order.table,
            kind: change.kind,
            audience: alertAudienceFor(staff)!,
            created: now());
        alerts.add(alert);
        if (change.announce) recent.add(alert);
      }
      _failures = 0;
      state = state.copy(
          entries: [...alerts.reversed, ...state.entries].take(50).toList(),
          recent: recent,
          checked: now(),
          clearError: true,
          delivery: recent.isEmpty ? _delivery : ++_delivery);
      for (final alert in recent) {
        _platformWork = _platformWork.then((_) async {
          if (mounted && generation == _generation) await sink.show(alert);
        }).catchError((Object _) {});
      }
      if (recent.isNotEmpty) await _platformWork;
    } catch (e) {
      if (mounted && generation == _generation) {
        _failures++;
        state = state.copy(error: '$e', recent: []);
      }
    } finally {
      if (mounted &&
          generation == _generation &&
          _foreground &&
          _scope != null) {
        _timer?.cancel();
        final seconds = interval.inSeconds * (1 << _failures.clamp(0, 3));
        _timer = Timer(Duration(seconds: seconds.clamp(1, 30)),
            () => unawaited(pollNow()));
      }
    }
  }

  void markAllRead() => state =
      state.copy(entries: state.entries.map((e) => e.markRead()).toList());
  void open(OrderAlert alert) {
    if (!mounted) return;
    if (_scope == null) {
      if (_staff == null) _pendingOpen = alert;
      return;
    }
    if (alert.scope != _scope) return;
    state = state.copy(
        entries: state.entries
            .map((e) => e.id == alert.id ||
                    (e.orderId == alert.orderId && e.kind == alert.kind)
                ? e.markRead()
                : e)
            .toList());
    onOpen?.call(alert);
  }

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    super.dispose();
  }
}
