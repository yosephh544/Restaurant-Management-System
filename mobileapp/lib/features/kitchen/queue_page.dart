import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

class QueuePage extends ConsumerStatefulWidget {
  const QueuePage({super.key});
  @override
  ConsumerState<QueuePage> createState() => _QueuePageState();
}

class _QueuePageState extends ConsumerState<QueuePage> {
  int _page = 1;
  @override
  Widget build(BuildContext context) {
    if (ref.watch(sessionProvider).session?.staff.can(P.kitchenView) != true)
      return const SizedBox.shrink();
    return ScreenBody(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const ScreenHeading(
          eyebrow: 'Kitchen display',
          title: 'The pass',
          subtitle: 'Keep tickets moving, one plate at a time.'),
      const SizedBox(height: 16),
      AsyncPane<PageData<KitchenTicket>>(
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
                  ServiceStat(
                      'In queue', data.totalCount, 'across the kitchen'),
                ]),
                const SizedBox(height: 20),
                const SectionHeading('Kitchen queue', eyebrow: 'Live tickets'),
                if (data.items.isEmpty)
                  const EmptyState('All caught up',
                      'New tickets will appear when a waiter sends an order.',
                      icon: Icons.soup_kitchen_outlined),
                LayoutBuilder(builder: (context, constraints) {
                  final columns = constraints.maxWidth > 720 ? 2 : 1;
                  return Wrap(spacing: 16, runSpacing: 16, children: [
                    for (final order in data.items)
                      SizedBox(
                          width: (constraints.maxWidth - (columns - 1) * 16) /
                              columns,
                          child: _TicketCard(order))
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
  const _TicketCard(this.order);
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
                  padding: const EdgeInsets.only(bottom: 10),
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
                                  style: const TextStyle(
                                      color: amber, fontSize: 12))),
                        if (item.cancelled)
                          const Text('Cancelled',
                              style: TextStyle(color: red, fontSize: 12)),
                      ])),
            const Divider(height: 20),
            Row(children: [
              const Icon(Icons.schedule_outlined, size: 14, color: muted),
              const SizedBox(width: 6),
              Text(
                  '${DateTime.now().toUtc().difference(order.created).inMinutes.clamp(0, 9999)} min in queue',
                  style: const TextStyle(color: muted, fontSize: 11)),
            ]),
            const SizedBox(height: 14),
            FilledButton.icon(
                onPressed: () => context.go('/orders/${order.orderId}'),
                icon: const Icon(Icons.restaurant_outlined, size: 18),
                label: const Text('Open order')),
          ])));
}
