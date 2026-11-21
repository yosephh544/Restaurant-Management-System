import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/models.dart';
import '../../core/api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import '../payments/payment_pages.dart';

class OrdersPage extends ConsumerStatefulWidget {
  const OrdersPage({super.key});
  @override
  ConsumerState<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends ConsumerState<OrdersPage> {
  int _page = 1;
  DateTime _day = DateUtils.dateOnly(DateTime.now());
  String? _status, _payment;
  String _search = '';
  Timer? _debounce;
  String? _servingId;
  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<PageData<RestaurantOrder>> _load(Staff staff) {
    final day = DateUtils.dateOnly(DateTime.now());
    if (_day != day) {
      _day = day;
      _page = 1;
    }
    final excludePaid = staff.waiter || staff.cashier;
    final paymentFilter =
        staff.waiter || (excludePaid && code(_payment ?? '') == 'PAID')
            ? null
            : _payment;
    return ref.read(restaurantApiProvider).orders(
        page: _page,
        waiterId: staff.waiter ? staff.id : null,
        status: _status,
        payment: paymentFilter,
        search: staff.waiter ? '' : _search,
        excludePaid: excludePaid,
        todayOnly: true);
  }

  Future<void> _serve(RestaurantOrder order, VoidCallback refresh) async {
    if (_servingId != null) return;
    setState(() => _servingId = order.id);
    try {
      final api = ref.read(restaurantApiProvider);
      final current = await api.order(order.id);
      if (ref.read(sessionProvider).session?.staff.canServeOrder(current) !=
          true) {
        throw const ApiException(
            'This order is no longer ready to be served by you.');
      }
      await api.served(order.id);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) {
        setState(() => _servingId = null);
        refresh();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(sessionProvider).session?.staff;
    if (staff == null || !staff.can(P.ordersView))
      return const SizedBox.shrink();
    final excludePaid = staff.waiter || staff.cashier;
    final paymentFilter =
        staff.waiter || (excludePaid && code(_payment ?? '') == 'PAID')
            ? null
            : _payment;
    final filters =
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextField(
          decoration: const InputDecoration(
              hintText: 'Search orders', prefixIcon: Icon(Icons.search)),
          onChanged: (v) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 350), () {
              if (mounted) {
                setState(() {
                  _search = v.trim();
                  _page = 1;
                });
              }
            });
          }),
      const SizedBox(height: 12),
      ExpansionTile(
          leading: const Icon(Icons.tune, size: 20),
          title: const Text('More filters',
              style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle:
              paymentFilter == null ? null : Text(statusLabel(paymentFilter)),
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          backgroundColor: Colors.white,
          collapsedBackgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(13),
              side: const BorderSide(color: lineColor)),
          collapsedShape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(13),
              side: const BorderSide(color: lineColor)),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          children: [
            LayoutBuilder(builder: (context, constraints) {
              final fields = [
                DropdownButtonFormField<String>(
                    value: _status,
                    isExpanded: true,
                    decoration:
                        const InputDecoration(labelText: 'Order status'),
                    items: [
                      const DropdownMenuItem(
                          value: null, child: Text('All orders')),
                      for (final s in [
                        'Pending',
                        'Preparing',
                        'Ready',
                        'Served',
                        'CancelledByKitchen'
                      ])
                        DropdownMenuItem(value: s, child: Text(statusLabel(s)))
                    ],
                    onChanged: (v) => setState(() {
                          _status = v;
                          _page = 1;
                        })),
                DropdownButtonFormField<String>(
                    value: paymentFilter,
                    isExpanded: true,
                    decoration:
                        const InputDecoration(labelText: 'Payment status'),
                    items: [
                      const DropdownMenuItem(
                          value: null, child: Text('All payments')),
                      for (final s in [
                        'Unpaid',
                        'PaymentInitiated',
                        'Paid',
                        'Retracted',
                        'RefundPending',
                        'Refunded',
                        'Transferred'
                      ])
                        if (!excludePaid || s != 'Paid')
                          DropdownMenuItem(
                              value: s, child: Text(statusLabel(s)))
                    ],
                    onChanged: (v) => setState(() {
                          _payment = v;
                          _page = 1;
                        })),
              ];
              return constraints.maxWidth < 340 ||
                      MediaQuery.textScalerOf(context).scale(1) > 1.3
                  ? Column(children: [
                      fields[0],
                      const SizedBox(height: 12),
                      fields[1]
                    ])
                  : Row(children: [
                      Expanded(child: fields[0]),
                      const SizedBox(width: 12),
                      Expanded(child: fields[1])
                    ]);
            })
          ]),
    ]);
    return ScreenBody(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AsyncPane<PageData<RestaurantOrder>>(
          headerBuilder: (refreshControl) =>
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                RefreshHeading(
                    eyebrow:
                        '${DateFormat('EEEE').format(DateTime.now())} service',
                    title: staff.waiter ? 'Your orders' : 'Orders & payments',
                    refreshControl: refreshControl),
                if (!staff.waiter) ...[filters, const SizedBox(height: 16)],
                SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(children: [
                      for (final filter in <(String?, String)>[
                        (null, 'All'),
                        ('Ready', 'Ready'),
                        ('Pending', 'Pending'),
                        ('Preparing', 'Preparing'),
                        ('Served', 'Served'),
                        ('CancelledByKitchen', 'Cancelled'),
                      ])
                        Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                                label: Text(filter.$2),
                                selected: _status == filter.$1,
                                labelStyle: TextStyle(
                                    color: _status == filter.$1
                                        ? Colors.white
                                        : ink,
                                    fontWeight: FontWeight.w700),
                                onSelected: (_) => setState(() {
                                      _status = filter.$1;
                                      _page = 1;
                                    }))),
                    ])),
                const SizedBox(height: 16),
              ]),
          loadKey:
              '$_page/$_status/$paymentFilter/$_search/${staff.id}/${staff.role}',
          interval: const Duration(seconds: 5),
          load: () => _load(staff),
          builder: (data, refresh) {
            final orders = data.items
                .where((order) =>
                    order.createdToday && (!excludePaid || !order.paid))
                .toList();
            return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (orders.isNotEmpty) ...[
                    StatRow([
                      ServiceStat(
                          'Ready',
                          orders.where((o) => code(o.status) == 'READY').length,
                          'on this page',
                          accent: true),
                      ServiceStat(
                          'In kitchen',
                          orders
                              .where((o) => ['PENDING', 'PREPARING']
                                  .contains(code(o.status)))
                              .length,
                          'on this page'),
                      ServiceStat(
                          'Served',
                          orders
                              .where((o) => code(o.status) == 'SERVED')
                              .length,
                          'on this page'),
                    ]),
                    const SizedBox(height: 20),
                  ],
                  SectionHeading(staff.waiter ? 'Your tables' : 'Tables'),
                  if (orders.isEmpty)
                    EmptyState(
                        'No orders',
                        staff.waiter
                            ? 'New orders will appear here when you send them to the kitchen.'
                            : 'New orders will appear here. Try another search or filter.',
                        icon: Icons.receipt_long_outlined),
                  for (final order in orders)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: OrderCard(
                            order: order,
                            showWaiter: staff.cashier,
                            action: staff.canServeOrder(order)
                                ? OutlinedButton(
                                    onPressed: _servingId == null
                                        ? () => _serve(order, refresh)
                                        : null,
                                    child: Text(_servingId == order.id
                                        ? 'Updating…'
                                        : 'Mark served'))
                                : staff.canTakePayment(order) && order.canPay
                                    ? OutlinedButton(
                                        onPressed: () =>
                                            startPayment(context, ref, order),
                                        child: const Text('Take payment'))
                                    : null,
                            onTap: () => context.go('/orders/${order.id}'))),
                  PageButtons(
                      page: data.page,
                      pages: data.totalPages,
                      total: data.totalCount,
                      onPage: (v) => setState(() => _page = v)),
                ]);
          }),
      if (staff.canCreateOrders) const SizedBox(height: 80),
    ]));
  }
}

class OrderCard extends StatelessWidget {
  final RestaurantOrder order;
  final VoidCallback onTap;
  final bool showAmount, showWaiter;
  final Widget? action;
  const OrderCard(
      {required this.order,
      required this.onTap,
      this.showAmount = false,
      this.showWaiter = false,
      this.action,
      super.key});
  @override
  Widget build(BuildContext context) => OrderCardFrame(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        OrderHeading(
            number: order.orderNumber,
            table: order.table,
            status: order.status,
            subtitle: showWaiter ? order.waiterName : null),
        if (!order.paid && code(order.paymentStatus) != 'UNPAID') ...[
          const SizedBox(height: 8),
          StatusBadge(order.paymentStatus),
        ],
        const SizedBox(height: 16),
        for (final item in order.items.take(3))
          Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${item.quantity}×',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(item.name,
                        style: TextStyle(
                            color: muted,
                            decoration: item.cancelled
                                ? TextDecoration.lineThrough
                                : null))),
                if (item.cancelled)
                  const Text('Cancelled',
                      style: TextStyle(color: red, fontSize: 11)),
              ])),
        if (order.items.length > 3)
          Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('+${order.items.length - 3} more dishes',
                  style: const TextStyle(color: muted, fontSize: 11))),
        OrderCardFooter(
            created: order.created,
            itemCount: order.items
                .where((item) => !item.cancelled)
                .fold<int>(0, (count, item) => count + item.quantity),
            amount: showAmount ? order.total : null),
        if (action != null) ...[
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: action),
        ],
      ]));
}

class OrderCardFrame extends StatelessWidget {
  final VoidCallback onTap;
  final Widget child;
  const OrderCardFrame({required this.onTap, required this.child, super.key});
  @override
  Widget build(BuildContext context) => Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: lineColor)),
      child: InkWell(
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(12), child: child)));
}

class OrderCardFooter extends StatelessWidget {
  final DateTime created;
  final int itemCount;
  final double? amount;
  final bool inQueue;
  const OrderCardFooter(
      {required this.created,
      required this.itemCount,
      this.amount,
      this.inQueue = false,
      super.key});
  @override
  Widget build(BuildContext context) => Column(children: [
        const Divider(height: 15),
        Row(children: [
          Expanded(
              child: Wrap(spacing: 12, runSpacing: 6, children: [
            Text(
                inQueue
                    ? '${DateTime.now().toUtc().difference(created).inMinutes.clamp(0, 9999)} min in queue'
                    : DateFormat.Hm().format(created.toLocal()),
                style: const TextStyle(color: muted, fontSize: 12)),
            Text('$itemCount items',
                style: const TextStyle(color: muted, fontSize: 12)),
            if (amount != null)
              Text(money(amount!),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
          ])),
          const SizedBox(width: 12),
          const Row(mainAxisSize: MainAxisSize.min, children: [
            Text('View order',
                style: TextStyle(
                    color: forestDark,
                    fontWeight: FontWeight.w700,
                    fontSize: 14)),
            SizedBox(width: 8),
            Icon(Icons.arrow_forward, color: forest, size: 18),
          ]),
        ]),
        const SizedBox(height: 4),
      ]);
}
