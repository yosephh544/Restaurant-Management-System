import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/models.dart';
import '../../core/api.dart';
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
      final staff = ref.read(sessionProvider).session?.staff;
      if (staff == null || !staff.preparationStaff || !staff.canUpdateStation) {
        throw const ApiException('Preparation permission is required.');
      }
      final current =
          await api.kitchenOrder(order.orderId, station: staff.station);
      if (!(next == 'PREPARING'
          ? code(current.status) == 'PENDING'
          : code(current.status) == 'PREPARING')) {
        throw const ApiException(
            'This ticket changed. Check its current status before continuing.');
      }
      await api.kitchenStatus(order.orderId, next, station: staff.station);
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
    final revision = ref.watch(stationQueueRevisionProvider);
    if (staff?.canViewStation != true) return const SizedBox.shrink();
    final canUpdate = staff!.preparationStaff && staff.canUpdateStation;
    return ScreenBody(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AsyncPane<PageData<KitchenTicket>>(
          headerBuilder: (refreshControl) => RefreshHeading(
              eyebrow: DateFormat('EEEE', context.languageCode)
                  .format(DateTime.now()),
              title: staff.bartender ? 'Bar' : 'Kitchen',
              refreshControl: refreshControl),
          loadKey: '${staff.station}/$_page/$revision',
          load: () => ref
              .read(restaurantApiProvider)
              .queue(_page, station: staff.station, activeOnly: true),
          interval: const Duration(seconds: 5),
          builder: (data, refresh) =>
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                StatRow([
                  ServiceStat(
                      'Pending',
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
                  ServiceStat('In queue', data.totalCount, ''),
                ]),
                const SizedBox(height: 20),
                if (data.items.isEmpty)
                  const EmptyState('No pending orders', '',
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
                                      child:
                                          AppText(_updatingId == order.orderId
                                              ? 'Updating…'
                                              : code(order.status) == 'PENDING'
                                                  ? 'Start preparing'
                                                  : 'Ready all'))
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
      onTap: () => context.go('/queue/orders/${order.orderId}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        OrderHeading(
            number: order.orderNumber,
            table: order.table,
            takeaway: code(order.orderType) != 'DINE_IN',
            takeout: code(order.orderType) == 'TAKEOUT',
            queuePosition: order.queuePosition,
            status: order.status,
            subtitle: order.waiterName),
        const SizedBox(height: 16),
        if (order.note.isNotEmpty)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppText(order.note,
                  translate: false,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
        for (final item in order.items)
          Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(
                        '${item.quantity} × ${context.menuName(item.name, item.nameAm)}',
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
                          child: AppText(item.note,
                              translate: false,
                              style:
                                  const TextStyle(color: amber, fontSize: 13))),
                    AppText(item.active ? 'Pending' : statusLabel(item.status),
                        style: const TextStyle(color: muted, fontSize: 12)),
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
