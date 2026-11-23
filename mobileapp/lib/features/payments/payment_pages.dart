import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/api.dart';
import '../../core/billing.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'table_bill_dialog.dart';
import 'receipt_scanner.dart';

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
  var phone = '',
      tendered = '',
      method = 'CASH',
      transaction = '',
      amountPaid = '';
  String? error;
  bool busy = false, uncertain = false;
  final api = ref.read(restaurantApiProvider);
  final workspace = ref.read(sessionProvider.notifier).workspace!;
  final bill = await prepareTableBill(
      context, api, order, ref.read(sessionProvider).session!.staff);
  if (!context.mounted || bill == null) return;
  final receipt = TextEditingController();
  final route = DialogRoute<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(builder: (c, change) {
            final cash = method == 'CASH';
            final needsPhone = method == 'PHONE_PUSH';
            final digital = method == 'TELEBIRR' || method == 'CBE';
            final due = bill.base;
            return PopScope(
                canPop: !busy,
                child: AlertDialog(
                    title: Text('Pay ${bill.locationLabel.toLowerCase()}'),
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
                                      if (!cash && !digital)
                                        const Notice(testPaymentNotice),
                                      Text(
                                          '${bill.billNumber} · ${bill.orderIds.length} orders'),
                                      if (code(bill.status) ==
                                          'PAYMENTINITIATED')
                                        const Notice(
                                            'A new payment replaces any pending payment for this table bill.'),
                                      const SizedBox(height: 16),
                                      DropdownButtonFormField<String>(
                                          value: method,
                                          decoration: const InputDecoration(
                                              labelText: 'Payment method'),
                                          items: [
                                            const DropdownMenuItem(
                                                value: 'CASH',
                                                child: Text('Cash')),
                                            const DropdownMenuItem(
                                                value: 'TELEBIRR',
                                                child:
                                                    Text('Telebirr receipt')),
                                            const DropdownMenuItem(
                                                value: 'CBE',
                                                child: Text('CBE receipt')),
                                            DropdownMenuItem(
                                                value: 'PHONE_PUSH',
                                                child: Text(
                                                    'Phone request (test)')),
                                            DropdownMenuItem(
                                                value: 'QR_SCAN',
                                                child: Text('QR code (test)')),
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
                                      if (digital) ...[
                                        const Text(
                                            'Record a transfer already made to the restaurant. The server checks the receipt; any overpayment becomes a waiter tip.'),
                                        const SizedBox(height: 12),
                                        OutlinedButton.icon(
                                            onPressed: busy
                                                ? null
                                                : () async {
                                                    change(() => busy = true);
                                                    try {
                                                      final link =
                                                          await scanReceipt(c);
                                                      if (c.mounted &&
                                                          link != null) {
                                                        receipt.text = link;
                                                      }
                                                    } catch (e) {
                                                      if (c.mounted) {
                                                        change(
                                                            () => error = '$e');
                                                      }
                                                    } finally {
                                                      if (c.mounted) {
                                                        change(
                                                            () => busy = false);
                                                      }
                                                    }
                                                  },
                                            icon: const Icon(
                                                Icons.qr_code_scanner),
                                            label:
                                                const Text('Scan receipt QR')),
                                        TextFormField(
                                            key: const ValueKey(
                                                'payment-receipt'),
                                            controller: receipt,
                                            enabled: !busy,
                                            maxLength: 500,
                                            decoration: const InputDecoration(
                                                labelText: 'Receipt link',
                                                counterText: ''),
                                            validator: (value) {
                                              final text = value?.trim() ?? '';
                                              if (text.isEmpty &&
                                                  method == 'CBE' &&
                                                  transaction
                                                      .trim()
                                                      .isNotEmpty) {
                                                return null;
                                              }
                                              return receiptLink(text) == null
                                                  ? 'Scan or paste a valid receipt link.'
                                                  : null;
                                            }),
                                        if (method == 'CBE')
                                          TextFormField(
                                              key: const ValueKey(
                                                  'payment-transaction'),
                                              initialValue: transaction,
                                              enabled: !busy,
                                              maxLength: 120,
                                              decoration: const InputDecoration(
                                                  labelText:
                                                      'Transaction number (if no link)',
                                                  counterText: ''),
                                              onChanged: (value) =>
                                                  transaction = value),
                                        TextFormField(
                                            key: const ValueKey(
                                                'payment-amount-paid'),
                                            initialValue: amountPaid,
                                            enabled: !busy,
                                            keyboardType: const TextInputType
                                                .numberWithOptions(
                                                decimal: true),
                                            decoration: const InputDecoration(
                                                labelText:
                                                    'Amount transferred (ETB)'),
                                            onChanged: (value) =>
                                                amountPaid = value,
                                            validator: (value) =>
                                                _moneyError(value, 1000000) ??
                                                (_amount(value ?? '') < due
                                                    ? 'The transfer must cover the bill.'
                                                    : null)),
                                      ],
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
                                        !current.canPayBill)
                                      throw const ApiException(
                                          'The order is no longer eligible for payment. Refresh its details.');
                                    final preview =
                                        await api.previewBill(current, staff);
                                    if (preview.bill?.id != bill.id ||
                                        !preview.bill!.payable ||
                                        preview.bill!.orderIds.length !=
                                            bill.orderIds.length ||
                                        preview.bill!.orderIds
                                            .difference(bill.orderIds)
                                            .isNotEmpty ||
                                        (preview.bill!.total - bill.total)
                                                .abs() >
                                            .01) {
                                      throw const ApiException(
                                          'The table bill changed. Close and review it again before paying.');
                                    }
                                    final payment = digital
                                        ? await api.recordDigital(
                                            bill.id, method,
                                            receiptUrl: receipt.text.trim(),
                                            transactionNumber: method == 'CBE'
                                                ? transaction.trim()
                                                : null,
                                            amountPaid:
                                                double.parse(amountPaid))
                                        : await api.initiate(order.id, method,
                                            needsPhone ? phone.trim() : '',
                                            billId: bill.id,
                                            tendered: cash
                                                ? double.parse(tendered)
                                                : null);
                                    if ((payment.base - due).abs() > .01 ||
                                        (!digital &&
                                            (payment.total - due).abs() >
                                                .01) ||
                                        (digital &&
                                            payment.total + .01 < due)) {
                                      // Preserve the result even when another device changed the bill.
                                      await workspace.saveSession(payment);
                                      throw const ApiException(
                                          'The server recorded a different payment total. Close and check the saved payment before submitting again.',
                                          uncertain: true);
                                    }
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
                                  : digital
                                      ? 'Record transfer'
                                      : method == 'QR_SCAN'
                                          ? 'Show test QR'
                                          : 'Start test payment')),
                    ]));
          }));
  final id = await Navigator.of(context).push(route);
  await route.completed;
  receipt.dispose();
  if (id != null && context.mounted) context.go('/sessions/$id');
}

class SessionsPage extends ConsumerStatefulWidget {
  const SessionsPage({super.key});
  @override
  ConsumerState<SessionsPage> createState() => _SessionsPageState();
}

class _SessionsPageState extends ConsumerState<SessionsPage> {
  int _page = 1;

  @override
  Widget build(BuildContext context) => ScreenBody(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const ScreenHeading(
            eyebrow: 'Payment records',
            title: 'Payments',
            subtitle:
                'Restaurant payments, including records from other devices.'),
        const SizedBox(height: 16),
        AsyncPane<PageData<PaymentSession>>(
            loadKey: _page,
            load: () => ref.read(restaurantApiProvider).payments(page: _page),
            builder: (data, refresh) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (data.items.isEmpty)
                        const EmptyState('No payments',
                            'Restaurant payment records will appear here.',
                            icon: Icons.payments_outlined),
                      for (final session in data.items)
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
                                        '${session.methodLabel}${session.testPayment ? ' · test' : ''} · ${money(session.total)}\n${statusLabel(session.status)} · ${DateFormat('MMM d, HH:mm').format(session.created.toLocal())}'),
                                    isThreeLine: true,
                                    trailing: const Icon(Icons.chevron_right),
                                    onTap: () => context
                                        .go('/sessions/${session.id}')))),
                      PageButtons(
                          page: data.page,
                          pages: data.totalPages,
                          total: data.totalCount,
                          onPage: (page) => setState(() => _page = page)),
                    ])),
      ]));
}

class PaymentDetail {
  final PaymentSession payment;
  final RestaurantOrder? order;
  final TableBill? bill;
  const PaymentDetail(this.payment, this.order, [this.bill]);
  bool get refundable =>
      payment.paid &&
      (order?.refundable ??
          (const ['SERVED', 'CANCELLEDBYKITCHEN'].contains(
                  code(payment.metadata['orderStatus'] as String? ?? '')) ||
              code(payment.metadata['orderPaymentStatus'] as String? ?? '') ==
                  'REFUNDPENDING'));
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
    final api = ref.read(restaurantApiProvider);
    final staff = ref.read(sessionProvider).session!.staff;
    final remote = await api.findPayment(widget.id, staff,
        search: matches.isEmpty ? '' : matches.first.orderNumber);
    if (remote == null && matches.isEmpty) {
      throw const ApiException('This payment is no longer available.');
    }
    final payment = remote != null
        ? matches.isEmpty
            ? remote
            : remote.withSavedDetails(matches.first)
        : matches.first.withStatus(await api.paymentStatus(widget.id));
    await workspace.saveSession(payment);
    RestaurantOrder? order;
    if (ref.read(sessionProvider).session?.staff.can(P.ordersView) == true) {
      try {
        order = await api.order(payment.orderId);
      } on ApiException catch (e) {
        if (e.status == 401) rethrow;
      }
    }
    TableBill? bill;
    if (payment.billId != null) {
      bill = await api.bill(payment.billId!);
    }
    return PaymentDetail(payment, order, bill);
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
    if (!await _confirm(
        'Record refund?',
        payment.cash
            ? 'Return ${money(payment.total)} to the customer before confirming.${payment.billId == null ? '' : ' This refunds the full bill, including every order on it.'}'
            : payment.receiptPayment
                ? 'Return ${money(payment.total)} through ${payment.methodLabel} before confirming. Recording the refund does not send money.${payment.billId == null ? '' : ' This refunds the full bill.'}'
                : 'Record a test refund? No money will be returned.',
        'Record refund')) return;
    if (!mounted) return;
    await _run(() async {
      final current = await _load();
      if (!ref.read(sessionProvider).session!.staff.can(P.paymentsRetract) ||
          !current.refundable)
        throw const ApiException(
            'Only a settled payment on a served, cancelled, or refund-pending order can be refunded.');
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
          current.order?.served != true ||
          current.payment.billId != null)
        throw const ApiException(
            'Only an individual order payment can be transferred.');
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
            if (staff == null) return const SizedBox.shrink();
            final canManage = staff.can(P.paymentsRetract);
            final settledServed = payment.paid && detail.order?.served == true;
            return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (payment.testPayment) const Notice(testPaymentNotice),
                  const SizedBox(height: 12),
                  Card(
                      child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Eyebrow('Payment details'),
                                const SizedBox(height: 6),
                                Text(
                                    detail.bill?.billNumber ??
                                        payment.orderNumber,
                                    style:
                                        Theme.of(context).textTheme.titleLarge),
                                if (detail.bill != null) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                      '${detail.bill!.locationLabel} · ${detail.bill!.orderIds.length} orders'),
                                ],
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
                                  Text('Test QR · No money collected',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: amber)),
                                  Center(
                                      child: QrImageView(
                                          data: payment.qrData!,
                                          size: 240,
                                          backgroundColor: Colors.white,
                                          semanticsLabel:
                                              'Test QR code. Does not collect money.')),
                                ],
                              ]))),
                  const SizedBox(height: 16),
                  if (payment.receiptPayment) ...[
                    Text('Receipt: ${statusLabel(payment.verification)}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (code(payment.verification) != 'VERIFIED')
                      const Notice(
                          'This receipt was recorded without verification. Review it before releasing tips.'),
                    if (payment.metadata['receiptUrl'] != null)
                      SelectableText(payment.metadata['receiptUrl'] as String),
                    if (payment.metadata['receiptReference'] != null)
                      SelectableText(
                          'Transaction: ${payment.metadata['receiptReference']}'),
                    if (payment.metadata['verifiedPayerName'] != null)
                      Text('Payer: ${payment.metadata['verifiedPayerName']}'),
                    if (payment.metadata['verifiedBank'] != null)
                      Text('Bank: ${payment.metadata['verifiedBank']}'),
                    if (payment.metadata['verificationNote'] != null)
                      Text(payment.metadata['verificationNote'] as String),
                    const SizedBox(height: 16),
                  ],
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
                                    'Cancel test payment?',
                                    'Cancel this pending test payment?',
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
                        label: Text('Cancel test payment'))
                  ],
                  if (canManage && detail.refundable) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed:
                            _busy ? null : () => _refund(payment, refresh),
                        icon: const Icon(Icons.undo),
                        label: const Text('Record refund')),
                    if (payment.billId == null && settledServed) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                          onPressed:
                              _busy ? null : () => _transfer(payment, refresh),
                          icon: const Icon(Icons.swap_horiz),
                          label: const Text('Transfer payment'))
                    ],
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
              child: PullToRefresh(
                  child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                                'Select an order for ${money(widget.payment.total)}.',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700)),
                            AsyncPane<PageData<RestaurantOrder>>(
                                loadKey: _page,
                                load: () => ref
                                    .read(restaurantApiProvider)
                                    .orders(
                                        page: _page,
                                        waiterId: ref
                                                .read(sessionProvider)
                                                .session!
                                                .staff
                                                .waiter
                                            ? ref
                                                .read(sessionProvider)
                                                .session!
                                                .staff
                                                .id
                                            : null),
                                builder: (data, refresh) {
                                  final targets = data.items
                                      .where((o) =>
                                          o.id != widget.payment.orderId &&
                                          o.canPayBill &&
                                          (o.charge +
                                                      widget.payment.tip -
                                                      widget.payment.total)
                                                  .abs() <=
                                              .01)
                                      .toList();
                                  return Column(children: [
                                    if (targets.isEmpty)
                                      const EmptyState(
                                          'No matching orders', ''),
                                    for (final order in targets)
                                      Card(
                                          child: ListTile(
                                              title: Text(
                                                  '${order.orderNumber} · ${order.locationLabel}'),
                                              subtitle: Text(
                                                  '${statusLabel(order.status)} · ${money(order.charge + widget.payment.tip)}'),
                                              trailing: const Icon(
                                                  Icons.chevron_right),
                                              onTap: () => Navigator.pop(
                                                  context, order.id))),
                                    PageButtons(
                                        page: data.page,
                                        pages: data.totalPages,
                                        total: data.totalCount,
                                        onPage: (p) =>
                                            setState(() => _page = p)),
                                  ]);
                                }),
                          ])))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'))
          ]);
}
