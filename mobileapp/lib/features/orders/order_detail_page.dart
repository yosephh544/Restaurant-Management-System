import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import '../payments/payment_pages.dart';

class OrderDetailPage extends ConsumerStatefulWidget {
  final String id;
  const OrderDetailPage({required this.id, super.key});
  @override
  ConsumerState<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends ConsumerState<OrderDetailPage> {
  bool _busy = false;
  String? _error;
  Future<RestaurantOrder> _load() async {
    final staff = ref.read(sessionProvider).session!.staff;
    final api = ref.read(restaurantApiProvider);
    if (!staff.preparationStaff && staff.can(P.ordersView)) {
      return api.order(widget.id);
    }
    try {
      final order = await api.kitchenOrder(widget.id, station: staff.station);
      if (code(order.status) == 'READY' && mounted) {
        ref.read(stationQueueRevisionProvider.notifier).state++;
        context.go('/queue');
      }
      return order;
    } on ApiException catch (e) {
      if (e.status == 404 && mounted) context.go('/queue');
      rethrow;
    }
  }

  Future<void> _act(
      Future<void> Function() action, VoidCallback refresh) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      refresh();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
      refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel(RestaurantOrder order, VoidCallback refresh,
      {String? itemId}) async {
    final form = GlobalKey<FormState>();
    var note = '', reason = 'OUT_OF_STOCK';
    final result = await showDialog<(String, String)>(
        context: context,
        builder: (c) => StatefulBuilder(
            builder: (c, change) => AlertDialog(
                    title: AppText(
                        itemId == null ? 'Cancel order?' : 'Cancel item?'),
                    content: SizedBox(
                        width: 440,
                        child: SingleChildScrollView(
                            child: Form(
                                key: form,
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      DropdownButtonFormField<String>(
                                          initialValue: reason,
                                          decoration: InputDecoration(
                                              labelText: context.t('Reason')),
                                          validator: localizedValidator(
                                              context,
                                              (value) => value == null
                                                  ? 'Choose a reason.'
                                                  : null),
                                          items: [
                                            for (final r in [
                                              ('OUT_OF_STOCK', 'Out of stock'),
                                              (
                                                'EQUIPMENT_ISSUE',
                                                'Equipment issue'
                                              ),
                                              (
                                                'PREP_DELAY',
                                                'Preparation delay'
                                              ),
                                              ('OTHER', 'Other')
                                            ])
                                              DropdownMenuItem(
                                                  value: r.$1,
                                                  child: AppText(r.$2)),
                                          ],
                                          onChanged: (v) =>
                                              change(() => reason = v!)),
                                      const SizedBox(height: 16),
                                      TextFormField(
                                          initialValue: note,
                                          onChanged: (v) => note = v,
                                          maxLength: 1000,
                                          maxLines: 3,
                                          decoration: InputDecoration(
                                              labelText: context.t(
                                                  'Reason details (optional)'),
                                              counterText: '')),
                                    ])))),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(c),
                          child: AppText(
                              itemId == null ? 'Keep order' : 'Keep item')),
                      FilledButton(
                          onPressed: () {
                            if (form.currentState!.validate()) {
                              Navigator.pop(c, (reason, note.trim()));
                            }
                          },
                          child: AppText(
                              itemId == null ? 'Cancel order' : 'Cancel item'))
                    ])));
    if (result == null || !mounted) return;
    await _act(() async {
      if (!ref.read(sessionProvider).session!.staff.canCancelStation) {
        throw const ApiException('Cancellation permission is required.');
      }
      final current = await _load();
      if (!current.canKitchenCancel ||
          (itemId != null &&
              current.items
                  .where((i) => i.id == itemId)
                  .every((i) => i.cancelled))) {
        throw const ApiException(
            'The order changed. Refresh its status before cancelling.');
      }
      await ref.read(restaurantApiProvider).cancel(
          order.id, result.$1, result.$2,
          itemId: itemId,
          station: ref.read(sessionProvider).session!.staff.station);
    }, refresh);
  }

  Future<void> _itemAction(RestaurantOrder order, OrderLine line, String action,
          VoidCallback refresh) =>
      _act(() async {
        final staff = ref.read(sessionProvider).session!.staff;
        final current = await _load();
        final matches = current.items.where((item) => item.id == line.id);
        if (matches.isEmpty) {
          throw const ApiException('This item is no longer available.');
        }
        final item = matches.first;
        final api = ref.read(restaurantApiProvider);
        if (action == 'SERVED') {
          if (!staff.canServeItem(current, item)) {
            throw const ApiException(
                'Only the assigned waiter can serve a ready item.');
          }
          await api.serveItem(order.id, item.id);
        } else {
          if (!staff.preparationStaff ||
              !staff.canUpdateStation ||
              !item.active ||
              !(action == 'PREPARING'
                  ? code(current.status) == 'PENDING'
                  : code(current.status) == 'PREPARING')) {
            throw const ApiException(
                'This item is no longer eligible for preparation.');
          }
          await api.kitchenItemStatus(order.id, item.id, action,
              station: staff.station);
        }
      }, refresh);

  Future<void> _stationAction(
          RestaurantOrder order, String next, VoidCallback refresh) =>
      _act(() async {
        final staff = ref.read(sessionProvider).session?.staff;
        if (staff == null ||
            !staff.preparationStaff ||
            !staff.canUpdateStation) {
          throw const ApiException('Preparation permission is required.');
        }
        final current = await _load();
        if (!(next == 'PREPARING'
            ? code(current.status) == 'PENDING'
            : code(current.status) == 'PREPARING')) {
          throw const ApiException(
              'This ticket changed. Check its current status before continuing.');
        }
        await ref
            .read(restaurantApiProvider)
            .kitchenStatus(order.id, next, station: staff.station);
      }, refresh);

  Future<List<PaymentSession>> _payments(
      RestaurantOrder order, Staff staff) async {
    final remote =
        await ref.read(restaurantApiProvider).orderPayments(order, staff);
    final local =
        await ref.read(sessionProvider.notifier).workspace!.sessions();
    return {
      for (final payment in local.where((p) => p.orderId == order.id))
        payment.id: payment,
      for (final payment in remote) payment.id: payment
    }.values.toList();
  }

  @override
  Widget build(BuildContext context) => ScreenBody(
      child: AsyncPane<RestaurantOrder>(
          loadKey: widget.id,
          load: _load,
          interval: const Duration(seconds: 5),
          builder: (order, refresh) {
            final staff = ref.watch(sessionProvider).session?.staff;
            if (staff == null) return const SizedBox.shrink();
            final financialView =
                !staff.preparationStaff && staff.can(P.ordersView);
            final canEdit = staff.ownsOrOversees(order);
            final canCancel = staff.canCancelStation && order.canKitchenCancel;
            final items = Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  OrderHeading(
                      number: order.orderNumber,
                      table: order.table,
                      takeaway: order.takeaway,
                      queuePosition: order.queuePosition,
                      status: order.status,
                      subtitle: order.waiterName),
                  const SizedBox(height: 10),
                  AppText(
                      DateFormat('MMM d, HH:mm', context.languageCode)
                          .format(order.created.toLocal()),
                      style: const TextStyle(color: muted, fontSize: 12)),
                  if (financialView &&
                      code(order.paymentStatus) != 'UNPAID') ...[
                    const SizedBox(height: 10),
                    Align(
                        alignment: Alignment.centerLeft,
                        child: StatusBadge(order.paymentStatus)),
                  ],
                  if (financialView &&
                      code(order.paymentStatus) == 'REFUNDPENDING')
                    const Notice(
                        'Refund needed. Review payment details before refunding.'),
                  const SizedBox(height: 20),
                  if (order.note.isNotEmpty)
                    Card(
                        child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.notes,
                                      size: 20, color: forest),
                                  const SizedBox(width: 12),
                                  Expanded(
                                      child: AppText(order.note,
                                          translate: false)),
                                ]))),
                  const SizedBox(height: 12),
                  const SectionHeading('Order items'),
                  for (final line in order.items)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Card(
                            child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Expanded(
                                                child: AppText(
                                                    '${line.quantity} × ${context.menuName(line.name, line.nameAm)}',
                                                    style: TextStyle(
                                                        fontWeight:
                                                            FontWeight.w800,
                                                        decoration:
                                                            line.cancelled
                                                                ? TextDecoration
                                                                    .lineThrough
                                                                : null))),
                                          ]),
                                      if (!line.active) ...[
                                        const SizedBox(height: 8),
                                        StatusBadge(line.status),
                                      ],
                                      if (line.note.isNotEmpty) ...[
                                        const SizedBox(height: 8),
                                        AppText(line.note, translate: false),
                                      ],
                                      if (staff.preparationStaff &&
                                          staff.canUpdateStation &&
                                          line.active &&
                                          const ['PENDING', 'PREPARING']
                                              .contains(code(order.status)))
                                        TextButton(
                                            onPressed: _busy
                                                ? null
                                                : () => _itemAction(
                                                    order,
                                                    line,
                                                    code(order.status) ==
                                                            'PENDING'
                                                        ? 'PREPARING'
                                                        : 'READY',
                                                    refresh),
                                            child: AppText(
                                                code(order.status) == 'PENDING'
                                                    ? 'Start item'
                                                    : 'Ready item')),
                                      if (staff.canServeItem(order, line))
                                        TextButton(
                                            onPressed: _busy
                                                ? null
                                                : () => _itemAction(order, line,
                                                    'SERVED', refresh),
                                            child: const AppText('Serve item')),
                                      if (canCancel && !line.cancelled)
                                        TextButton.icon(
                                            onPressed: _busy
                                                ? null
                                                : () => _cancel(order, refresh,
                                                    itemId: line.id),
                                            icon: const Icon(
                                                Icons.cancel_outlined),
                                            label:
                                                const AppText('Cancel item')),
                                    ])))),
                ]);
            final actions = Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (canEdit && staff.canAddItems && order.canAdd)
                    FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : () => context.go('/orders/${order.id}/add'),
                        icon: const Icon(Icons.add),
                        label: const AppText('Add items')),
                  if (staff.canServeOrder(order)) ...[
                    const SizedBox(height: 12),
                    FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _act(() async {
                                  final current = await _load();
                                  final access =
                                      ref.read(sessionProvider).session?.staff;
                                  if (access?.canServeOrder(current) != true) {
                                    throw const ApiException(
                                        'Only the assigned waiter can mark a ready order served.');
                                  }
                                  await ref
                                      .read(restaurantApiProvider)
                                      .served(order.id);
                                }, refresh),
                        icon: const Icon(Icons.room_service_outlined),
                        label: const AppText('Serve all'))
                  ],
                  if (canEdit &&
                      staff.canReplaceOrders &&
                      order.cancelled &&
                      !order.paid) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () => context.go('/orders/${order.id}/replace'),
                        icon: const Icon(Icons.replay),
                        label: const AppText('Create replacement order'))
                  ],
                  if (staff.canUpdateStation && code(order.status) == 'PENDING')
                    FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _stationAction(order, 'PREPARING', refresh),
                        icon: const Icon(Icons.soup_kitchen_outlined),
                        label: const AppText('Start preparing')),
                  if (staff.canUpdateStation &&
                      code(order.status) == 'PREPARING')
                    FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _stationAction(order, 'READY', refresh),
                        icon: const Icon(Icons.check_circle_outline),
                        label: const AppText('Ready all')),
                  if (canCancel) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed: _busy ? null : () => _cancel(order, refresh),
                        icon: const Icon(Icons.cancel_outlined),
                        label: const AppText('Cancel order'))
                  ],
                  if (staff.canTakePayment(order) &&
                      financialView &&
                      order.canPayBill) ...[
                    const SizedBox(height: 16),
                    FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : () => startPayment(context, ref, order),
                        icon: const Icon(Icons.payments_outlined),
                        label: const AppText('Take payment')),
                  ],
                  if (staff.can(P.paymentsView) && financialView)
                    FutureBuilder<List<PaymentSession>>(
                        future: _payments(order, staff),
                        builder: (context, snapshot) {
                          if (snapshot.hasError) {
                            return TextButton(
                                onPressed: () => setState(() {}),
                                child: const AppText('Retry payment details'));
                          }
                          return Column(children: [
                            for (final payment
                                in snapshot.data ?? <PaymentSession>[])
                              TextButton(
                                  onPressed: () =>
                                      context.go('/sessions/${payment.id}'),
                                  child: AppText(
                                      'Payment details · ${statusLabel(payment.status)}'))
                          ]);
                        }),
                  if (_error != null) Notice(_error!, error: true),
                  if (_busy)
                    const Padding(
                        padding: EdgeInsets.all(12),
                        child: LinearProgressIndicator()),
                ]);
            return LayoutBuilder(
                builder: (context, constraints) => constraints.maxWidth > 760
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            Expanded(child: items),
                            const SizedBox(width: 24),
                            SizedBox(width: 340, child: actions)
                          ])
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [items, actions]));
          }));
}
