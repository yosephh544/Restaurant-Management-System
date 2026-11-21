import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

const testPaymentNotice = 'Test payment. No money is collected.';
double _amount(String value) {
  final v = double.tryParse(value);
  return v != null && v.isFinite ? v : 0;
}

String? _moneyError(String? value, double maximum) {
  final number = double.tryParse(value ?? '');
  return number == null ||
          !number.isFinite ||
          number < 0 ||
          number > maximum ||
          !RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(value ?? '')
      ? 'Enter 0–${maximum.toInt()} with at most two decimal places.'
      : null;
}

Future<void> startPayment(
    BuildContext context, WidgetRef ref, RestaurantOrder order) async {
  final form = GlobalKey<FormState>();
  var tip = '0.00', phone = '', tendered = '', method = 'CASH';
  String? error;
  bool busy = false, uncertain = false;
  final api = ref.read(restaurantApiProvider);
  final workspace = ref.read(sessionProvider.notifier).workspace!;
  final offline = ref.read(sessionProvider).isDemo;
  final id = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(builder: (c, change) {
            final cash = method == 'CASH';
            final needsPhone = method == 'PHONE_PUSH';
            final due = order.subtotal + order.tax + _amount(tip);
            return PopScope(
                canPop: !busy,
                child: AlertDialog(
                    title: const Text('Take payment'),
                    content: SizedBox(
                        width: 460,
                        child: SingleChildScrollView(
                            child: Form(
                                key: form,
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      if (!cash && !offline)
                                        const Notice(testPaymentNotice),
                                      Text(
                                          '${order.orderNumber} · Table ${order.table}'),
                                      const SizedBox(height: 16),
                                      DropdownButtonFormField<String>(
                                          value: method,
                                          decoration: const InputDecoration(
                                              labelText: 'Payment method'),
                                          items: [
                                            const DropdownMenuItem(
                                                value: 'CASH',
                                                child: Text('Cash')),
                                            DropdownMenuItem(
                                                value: 'PHONE_PUSH',
                                                child: Text(offline
                                                    ? 'Phone request'
                                                    : 'Phone request (test)')),
                                            DropdownMenuItem(
                                                value: 'QR_SCAN',
                                                child: Text(offline
                                                    ? 'QR code'
                                                    : 'QR code (test)')),
                                          ],
                                          onChanged: busy
                                              ? null
                                              : (v) =>
                                                  change(() => method = v!)),
                                      const SizedBox(height: 16),
                                      if (needsPhone) ...[
                                        TextFormField(
                                            key:
                                                const ValueKey('payment-phone'),
                                            initialValue: phone,
                                            onChanged: (v) => phone = v,
                                            enabled: !busy,
                                            maxLength: 20,
                                            keyboardType: TextInputType.phone,
                                            decoration: const InputDecoration(
                                                labelText: 'Customer phone',
                                                counterText: ''),
                                            validator: (v) => v == null ||
                                                    v.trim().isEmpty
                                                ? 'Enter a customer phone number.'
                                                : null),
                                        const SizedBox(height: 12)
                                      ],
                                      TextFormField(
                                          key: const ValueKey('payment-tip'),
                                          initialValue: tip,
                                          enabled: !busy,
                                          keyboardType: const TextInputType
                                              .numberWithOptions(decimal: true),
                                          decoration: const InputDecoration(
                                              labelText: 'Tip (ETB)'),
                                          onChanged: (v) =>
                                              change(() => tip = v),
                                          validator: (v) =>
                                              _moneyError(v, 100000)),
                                      const SizedBox(height: 16),
                                      Text('Amount due: ${money(due)}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold)),
                                      if (cash) ...[
                                        const SizedBox(height: 16),
                                        TextFormField(
                                            key:
                                                const ValueKey('cash-tendered'),
                                            initialValue: tendered,
                                            enabled: !busy,
                                            keyboardType: const TextInputType
                                                .numberWithOptions(
                                                decimal: true),
                                            decoration: const InputDecoration(
                                                labelText:
                                                    'Cash received (ETB)'),
                                            onChanged: (v) =>
                                                change(() => tendered = v),
                                            validator: (v) =>
                                                _moneyError(v, 1000000) ??
                                                (_amount(v ?? '') < due
                                                    ? 'Cash received must cover the amount due.'
                                                    : null)),
                                        const SizedBox(height: 12),
                                        if (tendered.isNotEmpty)
                                          Text(
                                              'Change: ${money((_amount(tendered) - due).clamp(0, double.infinity))}')
                                      ],
                                      if (error != null && !uncertain)
                                        Notice(error!, error: true),
                                      if (uncertain)
                                        const Notice(
                                            'Check the order before trying another payment.'),
                                    ])))),
                    actions: [
                      TextButton(
                          onPressed: busy ? null : () => Navigator.pop(c),
                          child: const Text('Close')),
                      FilledButton(
                          onPressed: busy || uncertain
                              ? null
                              : () async {
                                  if (!form.currentState!.validate()) return;
                                  change(() {
                                    busy = true;
                                    error = null;
                                  });
                                  try {
                                    final staff = ref
                                        .read(sessionProvider)
                                        .session!
                                        .staff;
                                    final current = await api.order(order.id);
                                    if (!staff.canTakePayment(current) ||
                                        !current.canPay)
                                      throw const ApiException(
                                          'The order is no longer eligible for payment. Refresh its details.');
                                    if ((current.subtotal +
                                                current.tax -
                                                order.subtotal -
                                                order.tax)
                                            .abs() >
                                        .001)
                                      throw const ApiException(
                                          'The order total changed. Refresh it before taking payment.');
                                    final payment = await api.initiate(
                                        order.id,
                                        method,
                                        double.parse(tip),
                                        needsPhone ? phone.trim() : '',
                                        tendered: cash
                                            ? double.parse(tendered)
                                            : null);
                                    try {
                                      await workspace.saveSession(payment);
                                    } catch (_) {
                                      /* The successful ID remains available in memory. */
                                    }
                                    if (c.mounted) Navigator.pop(c, payment.id);
                                  } catch (e) {
                                    if (c.mounted)
                                      change(() {
                                        busy = false;
                                        error = '$e';
                                        uncertain = e is ApiException
                                            ? e.uncertain
                                            : true;
                                      });
                                  }
                                },
                          child: Text(busy
                              ? 'Saving…'
                              : cash
                                  ? 'Accept cash'
                                  : method == 'QR_SCAN'
                                      ? (offline
                                          ? 'Show QR code'
                                          : 'Show test QR')
                                      : (offline
                                          ? 'Start payment'
                                          : 'Start test payment'))),
                    ]));
          }));
  if (id != null && context.mounted) context.go('/sessions/$id');
}

class SessionsPage extends ConsumerWidget {
  const SessionsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => ScreenBody(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const ScreenHeading(
            eyebrow: 'Saved sessions',
            title: 'Payments',
            subtitle: 'Payment details saved on this device.'),
        const SizedBox(height: 16),
        AsyncPane<List<PaymentSession>>(
            load: () =>
                ref.read(sessionProvider.notifier).workspace!.sessions(),
            builder: (sessions, refresh) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (sessions.isEmpty)
                        const EmptyState('No payments',
                            'Saved payment sessions will appear here.',
                            icon: Icons.payments_outlined),
                      for (final session in sessions)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Card(
                                child: ListTile(
                                    contentPadding: const EdgeInsets.all(18),
                                    leading: Icon(
                                        session.cash
                                            ? Icons.payments_outlined
                                            : code(session.method) == 'QRSCAN'
                                                ? Icons.qr_code
                                                : Icons.phone_android,
                                        color: forest),
                                    title: Text(session.orderNumber,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold)),
                                    subtitle: Text(
                                        '${session.methodLabel}${session.cash || ref.watch(sessionProvider).isDemo ? '' : ' · test'} · ${money(session.total)}\n${statusLabel(session.status)} · ${DateFormat('MMM d, HH:mm').format(session.created.toLocal())}'),
                                    isThreeLine: true,
                                    trailing: const Icon(Icons.chevron_right),
                                    onTap: () => context
                                        .go('/sessions/${session.id}')))),
                    ])),
      ]));
}

class PaymentDetail {
  final PaymentSession payment;
  final RestaurantOrder? order;
  const PaymentDetail(this.payment, this.order);
}

class PaymentPage extends ConsumerStatefulWidget {
  final String id;
  const PaymentPage({required this.id, super.key});
  @override
  ConsumerState<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends ConsumerState<PaymentPage> {
  bool _busy = false;
  String? _error;
  Future<PaymentDetail> _load() async {
    final workspace = ref.read(sessionProvider.notifier).workspace!;
    final list = await workspace.sessions();
    final matches = list.where((p) => p.id == widget.id);
    if (matches.isEmpty)
      throw const ApiException(
          'Payment details are not available on this device.');
    final api = ref.read(restaurantApiProvider);
    final payment =
        matches.first.withStatus(await api.paymentStatus(widget.id));
    await workspace.saveSession(payment);
    RestaurantOrder? order;
    if (ref.read(sessionProvider).session?.staff.can(P.ordersView) == true) {
      try {
        order = await api.order(payment.orderId);
      } on ApiException catch (e) {
        if (e.status == 401) rethrow;
      }
    }
    return PaymentDetail(payment, order);
  }

  Future<void> _run(
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

  Future<bool> _confirm(String title, String message, String button) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(message), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: Text(button)),
              ])) ??
      false;
  Future<void> _refund(PaymentSession payment, VoidCallback refresh) async {
    final offline = ref.read(sessionProvider).isDemo;
    if (!await _confirm(
        'Record refund?',
        offline
            ? 'Record this refund?'
            : payment.cash
                ? 'Return the cash to the customer before confirming.'
                : 'Record a test refund? No money will be returned.',
        'Record refund')) return;
    if (!mounted) return;
    await _run(() async {
      final current = await _load();
      if (!ref.read(sessionProvider).session!.staff.can(P.paymentsRetract) ||
          !current.payment.paid ||
          current.order?.served != true)
        throw const ApiException(
            'Only a settled payment on a SERVED order can be refunded.');
      final result = await ref.read(restaurantApiProvider).refund(payment.id);
      await ref.read(sessionProvider.notifier).workspace!.saveSession(
          result.withRequest(
              payment.requestedMethod ?? payment.method, payment.phone ?? ''));
    }, refresh);
  }

  Future<void> _transfer(PaymentSession payment, VoidCallback refresh) async {
    final target = await showDialog<String>(
        context: context, builder: (_) => TransferDialog(payment: payment));
    if (target == null || !mounted) return;
    String? destination;
    await _run(() async {
      final current = await _load();
      if (!ref.read(sessionProvider).session!.staff.can(P.paymentsRetract) ||
          !current.payment.paid ||
          current.order?.served != true)
        throw const ApiException(
            'Only a settled payment on a SERVED order can be transferred.');
      final result =
          await ref.read(restaurantApiProvider).transfer(payment.id, target);
      final workspace = ref.read(sessionProvider.notifier).workspace!;
      await workspace.saveSession(result.withRequest(
          payment.requestedMethod ?? payment.method, payment.phone ?? ''));
      await workspace.saveSession(payment.withStatus('TRANSFERRED'));
      destination = result.id;
    }, refresh);
    if (destination != null && mounted) context.go('/sessions/$destination');
  }

  @override
  Widget build(BuildContext context) => ScreenBody(
      child: AsyncPane<PaymentDetail>(
          loadKey: widget.id,
          load: _load,
          interval: const Duration(seconds: 3),
          keepPolling: (d) => d.payment.pending,
          builder: (detail, refresh) {
            final payment = detail.payment;
            final state = ref.watch(sessionProvider);
            final staff = state.session?.staff;
            final offline = state.isDemo;
            if (staff == null) return const SizedBox.shrink();
            final canManage = staff.can(P.paymentsRetract);
            final settledServed = payment.paid && detail.order?.served == true;
            return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!payment.cash && !offline)
                    const Notice(testPaymentNotice),
                  const SizedBox(height: 12),
                  Card(
                      child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Eyebrow('Payment details'),
                                const SizedBox(height: 6),
                                Text(payment.orderNumber,
                                    style:
                                        Theme.of(context).textTheme.titleLarge),
                                const SizedBox(height: 12),
                                Align(
                                    alignment: Alignment.centerLeft,
                                    child: StatusBadge(payment.status)),
                                const SizedBox(height: 20),
                                const Text('Payment amount',
                                    style:
                                        TextStyle(color: muted, fontSize: 12)),
                                const SizedBox(height: 6),
                                Text(money(payment.total),
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineLarge
                                        ?.copyWith(
                                            color: forestDark,
                                            fontWeight: FontWeight.w800)),
                                const SizedBox(height: 10),
                                Text(
                                    '${payment.methodLabel}${payment.phone == null ? '' : ' · ${payment.phone}'}'),
                                if (code(payment.method) == 'QRSCAN' &&
                                    payment.qrData != null) ...[
                                  const SizedBox(height: 24),
                                  Text(
                                      offline
                                          ? 'QR code'
                                          : 'Test QR · No money collected',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: amber)),
                                  Center(
                                      child: QrImageView(
                                          data: payment.qrData!,
                                          size: 240,
                                          backgroundColor: Colors.white,
                                          semanticsLabel: offline
                                              ? 'Payment QR code'
                                              : 'Test QR code. Does not collect money.')),
                                ],
                              ]))),
                  const SizedBox(height: 16),
                  if (payment.tip > 0 ||
                      payment.tendered != null ||
                      (payment.change ?? 0) > 0)
                    Card(
                        child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(children: [
                              for (final row in [
                                if (payment.tip > 0) ('Tip', payment.tip),
                                if (payment.tendered != null)
                                  ('Cash received', payment.tendered!),
                                if ((payment.change ?? 0) > 0)
                                  ('Change', payment.change!)
                              ])
                                Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(row.$1),
                                          Text(money(row.$2))
                                        ])),
                            ]))),
                  if (_error != null) Notice(_error!, error: true),
                  const SizedBox(height: 16),
                  if (staff.can(P.ordersView))
                    OutlinedButton.icon(
                        onPressed: () =>
                            context.go('/orders/${payment.orderId}'),
                        icon: const Icon(Icons.receipt_long_outlined),
                        label: const Text('View order')),
                  if (canManage && payment.pending) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () async {
                                if (!await _confirm(
                                    offline
                                        ? 'Cancel payment?'
                                        : 'Cancel test payment?',
                                    offline
                                        ? 'Cancel this pending payment?'
                                        : 'Cancel this pending test payment?',
                                    'Cancel payment')) return;
                                if (!mounted) return;
                                await _run(() async {
                                  final status = await ref
                                      .read(restaurantApiProvider)
                                      .retract(payment.id);
                                  await ref
                                      .read(sessionProvider.notifier)
                                      .workspace!
                                      .saveSession(payment.withStatus(status));
                                }, refresh);
                              },
                        icon: const Icon(Icons.cancel_outlined),
                        label: Text(
                            offline ? 'Cancel payment' : 'Cancel test payment'))
                  ],
                  if (canManage && settledServed) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed:
                            _busy ? null : () => _refund(payment, refresh),
                        icon: const Icon(Icons.undo),
                        label: const Text('Record refund')),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed:
                            _busy ? null : () => _transfer(payment, refresh),
                        icon: const Icon(Icons.swap_horiz),
                        label: const Text('Transfer payment'))
                  ],
                  if (_busy)
                    const Padding(
                        padding: EdgeInsets.all(12),
                        child: LinearProgressIndicator()),
                ]);
          }));
}

class TransferDialog extends ConsumerStatefulWidget {
  final PaymentSession payment;
  const TransferDialog({required this.payment, super.key});
  @override
  ConsumerState<TransferDialog> createState() => _TransferDialogState();
}

class _TransferDialogState extends ConsumerState<TransferDialog> {
  int _page = 1;
  @override
  Widget build(BuildContext context) => AlertDialog(
          title: const Text('Transfer payment'),
          content: SizedBox(
              width: 460,
              height: 450,
              child: SingleChildScrollView(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                    Text('Select an order for ${money(widget.payment.total)}.',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    AsyncPane<PageData<RestaurantOrder>>(
                        loadKey: _page,
                        load: () => ref.read(restaurantApiProvider).orders(
                            page: _page,
                            waiterId: ref
                                    .read(sessionProvider)
                                    .session!
                                    .staff
                                    .waiter
                                ? ref.read(sessionProvider).session!.staff.id
                                : null),
                        builder: (data, refresh) {
                          final targets = data.items
                              .where((o) =>
                                  o.id != widget.payment.orderId &&
                                  o.canPay &&
                                  (o.subtotal +
                                              o.tax +
                                              widget.payment.tip -
                                              widget.payment.total)
                                          .abs() <=
                                      .01)
                              .toList();
                          return Column(children: [
                            if (targets.isEmpty)
                              const EmptyState('No matching orders', ''),
                            for (final order in targets)
                              Card(
                                  child: ListTile(
                                      title: Text(
                                          '${order.orderNumber} · Table ${order.table}'),
                                      subtitle: Text(
                                          '${statusLabel(order.status)} · ${money(order.subtotal + order.tax + widget.payment.tip)}'),
                                      trailing: const Icon(Icons.chevron_right),
                                      onTap: () =>
                                          Navigator.pop(context, order.id))),
                            PageButtons(
                                page: data.page,
                                pages: data.totalPages,
                                total: data.totalCount,
                                onPage: (p) => setState(() => _page = p)),
                          ]);
                        }),
                  ]))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'))
          ]);
}
