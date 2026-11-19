import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

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
        status: staff.waiter ? null : _status,
        payment: paymentFilter,
        search: staff.waiter ? '' : _search,
        excludePaid: excludePaid,
        todayOnly: true);
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
    return ScreenBody(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ScreenHeading(
          eyebrow:
              '${DateFormat('EEEE').format(DateTime.now())} service · ${staff.role}',
          title: staff.waiter ? 'Your orders' : 'Orders & payments',
          subtitle: staff.waiter
              ? 'Keep your tables moving, ${staff.name.trim().split(RegExp(r'\s+')).first}.'
              : 'Today’s orders, ready for the next step.',
          action: staff.canCreateOrders
              ? FilledButton.icon(
                  onPressed: () => context.go('/orders/new'),
                  icon: const Icon(Icons.add),
                  label: const Text('New order'))
              : null),
      const SizedBox(height: 20),
      if (!staff.waiter) ...[
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
        LayoutBuilder(builder: (context, constraints) {
          final fields = [
            DropdownButtonFormField<String>(
                value: _status,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Order status'),
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
                decoration: const InputDecoration(labelText: 'Payment status'),
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
                      DropdownMenuItem(value: s, child: Text(statusLabel(s)))
                ],
                onChanged: (v) => setState(() {
                      _payment = v;
                      _page = 1;
                    })),
          ];
          return constraints.maxWidth < 340 ||
                  MediaQuery.textScalerOf(context).scale(1) > 1.3
              ? Column(
                  children: [fields[0], const SizedBox(height: 12), fields[1]])
              : Row(children: [
                  Expanded(child: fields[0]),
                  const SizedBox(width: 12),
                  Expanded(child: fields[1])
                ]);
        }),
      ],
      AsyncPane<PageData<RestaurantOrder>>(
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
                  SectionHeading('Orders in progress',
                      eyebrow: staff.waiter ? 'Your tables' : 'Today’s service',
                      detail:
                          '${data.totalCount} ${data.totalCount == 1 ? 'order' : 'orders'}'),
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
                            onTap: () => context.go('/orders/${order.id}'))),
                  PageButtons(
                      page: data.page,
                      pages: data.totalPages,
                      total: data.totalCount,
                      onPage: (v) => setState(() => _page = v)),
                ]);
          }),
    ]));
  }
}

class OrderCard extends StatelessWidget {
  final RestaurantOrder order;
  final VoidCallback onTap;
  final bool showAmount, showWaiter;
  const OrderCard(
      {required this.order,
      required this.onTap,
      this.showAmount = false,
      this.showWaiter = false,
      super.key});
  @override
  Widget build(BuildContext context) => Card(
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    OrderHeading(
                        number: order.orderNumber,
                        table: order.table,
                        status: order.status,
                        subtitle: showWaiter ? order.waiterName : null),
                    if (!order.paid &&
                        code(order.paymentStatus) != 'UNPAID') ...[
                      const SizedBox(height: 8),
                      StatusBadge(order.paymentStatus),
                    ],
                    const SizedBox(height: 16),
                    for (final item in order.items.take(3))
                      Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${item.quantity}×',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
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
                                      style:
                                          TextStyle(color: red, fontSize: 11)),
                              ])),
                    if (order.items.length > 3)
                      Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text('+${order.items.length - 3} more dishes',
                              style:
                                  const TextStyle(color: muted, fontSize: 11))),
                    const Divider(height: 20),
                    Wrap(
                        spacing: 14,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.schedule_outlined,
                                size: 14, color: muted),
                            const SizedBox(width: 5),
                            Text(
                                DateFormat.Hm().format(order.created.toLocal()),
                                style: const TextStyle(
                                    color: muted, fontSize: 11)),
                          ]),
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.restaurant_outlined,
                                size: 14, color: muted),
                            const SizedBox(width: 5),
                            Text(
                                '${order.items.where((item) => !item.cancelled).fold<int>(0, (count, item) => count + item.quantity)} items',
                                style: const TextStyle(
                                    color: muted, fontSize: 11)),
                          ]),
                          if (showAmount)
                            Text(money(order.total),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800))
                        ]),
                    const SizedBox(height: 12),
                    Row(children: [
                      const Expanded(
                          child: Text('View order',
                              style: TextStyle(
                                  color: forestDark,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12))),
                      const Icon(Icons.arrow_forward, color: forest, size: 17),
                    ]),
                  ]))));
}
