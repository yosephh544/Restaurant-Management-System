import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/models.dart';
import '../../core/api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import '../orders/orders_page.dart';

class QueuePage extends ConsumerStatefulWidget {
  const QueuePage({super.key});
  @override
  ConsumerState<QueuePage> createState() => _QueuePageState();
}

class _QueuePageState extends ConsumerState<QueuePage> {
  int _page = 1;
  String? _updatingId;
  Future<void> _update(
      KitchenTicket order, String next, VoidCallback refresh) async {
    if (_updatingId != null) return;
    setState(() => _updatingId = order.orderId);
    try {
      final api = ref.read(restaurantApiProvider);
      final current = await api.kitchenOrder(order.orderId);
      final staff = ref.read(sessionProvider).session?.staff;
      if (staff?.kitchen != true ||
          staff?.can(P.kitchenUpdate) != true ||
          code(current.status) !=
              (next == 'PREPARING' ? 'PENDING' : 'PREPARING')) {
        throw const ApiException(
            'This ticket changed. Check its current status before continuing.');
      }
      await api.kitchenStatus(order.orderId, next);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) {
        setState(() => _updatingId = null);
        refresh();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(sessionProvider).session?.staff;
    if (staff?.can(P.kitchenView) != true) return const SizedBox.shrink();
    final canUpdate = staff!.kitchen && staff.can(P.kitchenUpdate);
    return ScreenBody(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AsyncPane<PageData<KitchenTicket>>(
          headerBuilder: (refreshControl) => RefreshHeading(
              eyebrow: '${DateFormat('EEEE').format(DateTime.now())} service',
              title: 'Kitchen display',
              refreshControl: refreshControl),
          loadKey: _page,
          load: () => ref.read(restaurantApiProvider).queue(_page),
          interval: const Duration(seconds: 5),
          builder: (data, refresh) =>
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                StatRow([
                  ServiceStat(
                      'New tickets',
                      data.items
                          .where((o) => code(o.status) == 'PENDING')
                          .length,
                      'on this page',
                      accent: true),
                  ServiceStat(
                      'Preparing',
                      data.items
                          .where((o) => code(o.status) == 'PREPARING')
                          .length,
                      'on this page'),
                  ServiceStat('In queue', data.totalCount, 'in the kitchen'),
                ]),
                const SizedBox(height: 20),
                const SectionHeading('Kitchen queue'),
                if (data.items.isEmpty)
                  const EmptyState('All caught up',
                      'New tickets will appear when a waiter sends an order.',
                      icon: Icons.soup_kitchen_outlined),
                LayoutBuilder(builder: (context, constraints) {
                  final columns = constraints.maxWidth > 720 ? 2 : 1;
                  return Wrap(spacing: 12, runSpacing: 12, children: [
                    for (final order in data.items)
                      SizedBox(
                          width: (constraints.maxWidth - (columns - 1) * 12) /
                              columns,
                          child: _TicketCard(order,
                              action: canUpdate &&
                                      ['PENDING', 'PREPARING']
                                          .contains(code(order.status))
                                  ? OutlinedButton(
                                      onPressed: _updatingId == null
                                          ? () => _update(
                                              order,
                                              code(order.status) == 'PENDING'
                                                  ? 'PREPARING'
                                                  : 'READY',
                                              refresh)
                                          : null,
                                      child: Text(_updatingId == order.orderId
                                          ? 'Updating…'
                                          : code(order.status) == 'PENDING'
                                              ? 'Start preparation'
                                              : 'Mark ready'))
                                  : null))
                  ]);
                }),
                PageButtons(
                    page: data.page,
                    pages: data.totalPages,
                    total: data.totalCount,
                    onPage: (v) => setState(() => _page = v)),
              ])),
    ]));
  }
}

class _TicketCard extends StatelessWidget {
  final KitchenTicket order;
  final Widget? action;
  const _TicketCard(this.order, {this.action});
  @override
  Widget build(BuildContext context) => OrderCardFrame(
      onTap: () => context.go('/orders/${order.orderId}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        OrderHeading(
            number: order.orderNumber,
            table: order.table,
            status: order.status,
            subtitle: order.waiterName),
        const SizedBox(height: 16),
        if (order.note.isNotEmpty)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(order.note,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
        for (final item in order.items)
          Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${item.quantity} × ${item.name}',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            decoration: item.cancelled
                                ? TextDecoration.lineThrough
                                : null)),
                    if (item.note.isNotEmpty)
                      Container(
                          margin: const EdgeInsets.only(top: 6),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(
                              color: amberPale,
                              borderRadius: BorderRadius.circular(8)),
                          child: Text(item.note,
                              style:
                                  const TextStyle(color: amber, fontSize: 13))),
                    if (item.cancelled)
                      const Text('Cancelled',
                          style: TextStyle(color: red, fontSize: 12)),
                  ])),
        OrderCardFooter(
            created: order.created,
            itemCount: order.items
                .where((item) => !item.cancelled)
                .fold<int>(0, (count, item) => count + item.quantity),
            inQueue: true),
        if (action != null) ...[
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: action),
        ],
      ]));
}
