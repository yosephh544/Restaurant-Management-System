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
  final flow = ref.read(paymentFlowActiveProvider.notifier);
  if (flow.state) return;
  flow.state = true;
  try {
    await _startPayment(context, ref, order);
  } finally {
    if (flow.mounted) flow.state = false;
  }
}

Future<void> _startPayment(
    BuildContext context, WidgetRef ref, RestaurantOrder order) async {
  final form = GlobalKey<FormState>();
  var tendered = '';
  String? error, checkingBank;
  bool busy = false, uncertain = false, submitting = false;
  bool manualEntryExpanded = false;
  final api = ref.read(restaurantApiProvider);
  final workspace = ref.read(sessionProvider.notifier).workspace!;
  final bill = await prepareTableBill(
      context, api, order, ref.read(sessionProvider).session!.staff);
  if (!context.mounted || bill == null) return;
  final receipt = TextEditingController();
  final route = DialogRoute<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => StatefulBuilder(builder: (c, change) {
            final due = bill.base;
            Future<void> submit({String? qr}) async {
              if (submitting || uncertain) return;
              final digital = qr != null;
              if (digital && receiptBank(qr) == null) {
                change(() => error =
                    'Scan or paste a CBE or Telebirr transaction receipt.');
                return;
              }
              if (!digital && !form.currentState!.validate()) return;
              submitting = true;
              change(() {
                busy = true;
                error = null;
                checkingBank = qr == null ? null : receiptBank(qr);
              });
              try {
                final staff = ref.read(sessionProvider).session!.staff;
                final current = await api.order(order.id);
                if (!staff.canTakePayment(current) || !current.canPayBill) {
                  throw const ApiException(
                      'The order is no longer eligible for payment. Refresh its details.');
                }
                final preview = await api.previewBill(current, staff);
                if (preview.bill?.id != bill.id ||
                    !preview.bill!.payable ||
                    preview.bill!.orderIds.length != bill.orderIds.length ||
                    preview.bill!.orderIds
                        .difference(bill.orderIds)
                        .isNotEmpty ||
                    (preview.bill!.total - bill.total).abs() > .01) {
                  throw const ApiException(
                      'The table bill changed. Close and review it again before paying.');
                }
                final payment = digital
                    ? await api.recordReceipt(bill.id, qr)
                    : await api.initiate(order.id, 'CASH', '',
                        billId: bill.id, tendered: double.parse(tendered));
                if (digital &&
                    (code(payment.status) != 'PAID' ||
                        code(payment.verification) != 'VERIFIED')) {
                  await workspace.saveSession(payment);
                  throw const ApiException(
                      'The server did not confirm this receipt as paid. Check the bill before trying again.',
                      uncertain: true);
                }
                if ((payment.base - due).abs() > .01 ||
                    (!digital && (payment.total - due).abs() > .01) ||
                    (digital && payment.total + .01 < due)) {
                  await workspace.saveSession(payment);
                  throw const ApiException(
                      'The server recorded a different payment total. Close and check the saved payment before submitting again.',
                      uncertain: true);
                }
                try {
                  await workspace.saveSession(payment);
                } catch (_) {/* Successful ID is still available. */}
                if (c.mounted) Navigator.pop(c, payment.id);
              } catch (e) {
                if (c.mounted) {
                  change(() {
                    busy = false;
                    checkingBank = null;
                    error = '$e';
                    uncertain = e is ApiException ? e.uncertain : true;
                  });
                }
              } finally {
                submitting = false;
              }
            }

            Future<void> scan() async {
              if (busy || uncertain) return;
              change(() {
                busy = true;
                error = null;
              });
              try {
                final qr = await ref.read(receiptScannerProvider)(c);
                if (!c.mounted) return;
                change(() => busy = false);
                if (qr != null) await submit(qr: qr);
              } catch (e) {
                if (c.mounted) {
                  change(() {
                    busy = false;
                    error = '$e';
                  });
                }
              }
            }

            return PopScope(
                canPop: !busy,
                child: AlertDialog(
                  title: AppText(checkingBank != null
                      ? 'Verifying payment'
                      : 'Pay ${bill.locationLabel}'),
                  content: SizedBox(
                      width: 460,
                      child: checkingBank != null
                          ? _ReceiptProcessing(bank: checkingBank!)
                          : SingleChildScrollView(
                              child: Form(
                                  key: form,
                                  child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        if (bill.orderIds.length > 1) ...[
                                          AppText(
                                              '${bill.orderIds.length} orders'),
                                          const SizedBox(height: 12),
                                        ],
                                        const AppText('Amount due',
                                            style: TextStyle(color: muted)),
                                        const SizedBox(height: 4),
                                        AppText(money(due),
                                            style: Theme.of(c)
                                                .textTheme
                                                .headlineSmall),
                                        const SizedBox(height: 16),
                                        OutlinedButton.icon(
                                            key: const ValueKey('scan-receipt'),
                                            onPressed:
                                                busy || uncertain ? null : scan,
                                            icon: const Icon(
                                                Icons.qr_code_scanner),
                                            label: const AppText(
                                                'Scan receipt QR')),
                                        const SizedBox(height: 10),
                                        const AppText(
                                            'Extra payment is recorded as a tip.',
                                            style: TextStyle(
                                                color: muted, fontSize: 12)),
                                        ExpansionTile(
                                            initiallyExpanded:
                                                manualEntryExpanded,
                                            onExpansionChanged: (expanded) =>
                                                manualEntryExpanded = expanded,
                                            tilePadding: EdgeInsets.zero,
                                            title: const AppText(
                                                'Enter receipt manually'),
                                            children: [
                                              TextField(
                                                  key: const ValueKey(
                                                      'payment-receipt'),
                                                  controller: receipt,
                                                  enabled: !busy && !uncertain,
                                                  keyboardType:
                                                      TextInputType.url,
                                                  autocorrect: false,
                                                  minLines: 1,
                                                  maxLines: 3,
                                                  maxLength: 4096,
                                                  decoration: InputDecoration(
                                                      labelText: context.t(
                                                          'Receipt link or CBE FT reference'),
                                                      counterText: '')),
                                              TextButton(
                                                  onPressed: busy || uncertain
                                                      ? null
                                                      : () => submit(
                                                          qr: receipt.text
                                                              .trim()),
                                                  child: const AppText(
                                                      'Verify payment')),
                                            ]),
                                        if (busy)
                                          Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      vertical: 12),
                                              child: const AppText(
                                                  'Please wait…')),
                                        const SizedBox(height: 16),
                                        const Divider(),
                                        const SizedBox(height: 12),
                                        const AppText('Cash payment',
                                            style: TextStyle(
                                                fontWeight: FontWeight.bold)),
                                        if (code(bill.status) ==
                                            'PAYMENTINITIATED')
                                          const Notice(
                                              'A new payment replaces any pending payment for this table bill.'),
                                        ...[
                                          const SizedBox(height: 16),
                                          TextFormField(
                                              key: const ValueKey(
                                                  'cash-tendered'),
                                              initialValue: tendered,
                                              onChanged: (v) =>
                                                  change(() => tendered = v),
                                              enabled: !busy,
                                              keyboardType: const TextInputType
                                                  .numberWithOptions(
                                                  decimal: true),
                                              decoration: InputDecoration(
                                                  labelText: context.t(
                                                      'Cash received (ETB)')),
                                              validator: localizedValidator(
                                                  context,
                                                  (v) =>
                                                      _moneyError(v, 1000000) ??
                                                      (_amount(v ?? '') < due
                                                          ? 'Cash received must cover the amount due.'
                                                          : null))),
                                          if (tendered.isNotEmpty)
                                            AppText(
                                                'Change: ${money((_amount(tendered) - due).clamp(0, double.infinity))}'),
                                        ],
                                        if (error != null && !uncertain)
                                          Notice(error!, error: true),
                                        if (uncertain)
                                          const Notice(
                                              'Check the order before trying another payment.'),
                                      ])))),
                  actions: checkingBank != null
                      ? null
                      : [
                          TextButton(
                              onPressed: busy ? null : () => Navigator.pop(c),
                              child: const AppText('Close')),
                          FilledButton(
                              onPressed:
                                  busy || uncertain ? null : () => submit(),
                              child: AppText(
                                  busy ? 'Please wait…' : 'Accept cash'))
                        ],
                ));
          }));
  final id = await Navigator.of(context, rootNavigator: true).push(route);
  await route.completed;
  receipt.dispose();
  if (id != null && context.mounted) context.go('/sessions/$id');
}

class _ReceiptProcessing extends StatelessWidget {
  final String bank;
  const _ReceiptProcessing({required this.bank});
  @override
  Widget build(BuildContext context) {
    final label =
        bank == 'CBE' ? 'Checking CBE receipt…' : 'Checking Telebirr receipt…';
    return Padding(
        key: const ValueKey('receipt-processing'),
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                  strokeWidth: 4,
                  backgroundColor: mint,
                  semanticsLabel: context.t(label))),
          const SizedBox(height: 24),
          Semantics(
              liveRegion: true,
              child: AppText(label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium)),
        ]));
  }
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
        const ScreenHeading(title: 'Payments'),
        const SizedBox(height: 16),
        AsyncPane<PageData<PaymentSession>>(
            loadKey: _page,
            load: () => ref.read(restaurantApiProvider).payments(page: _page),
            builder: (data, refresh) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (data.items.isEmpty)
                        const EmptyState('No payments', '',
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
                                    title: AppText(session.orderNumber,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold)),
                                    subtitle: AppText(
                                        '${session.methodLabel}${session.testPayment ? ' · test' : ''} · ${money(session.total)}\n${statusLabel(session.status)} · ${DateFormat('MMM d, HH:mm', context.languageCode).format(session.created.toLocal())}'),
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
          builder: (c) => AlertDialog(
                  title: AppText(title),
                  content: AppText(message),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const AppText('Cancel')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: AppText(button)),
                  ])) ??
      false;
  Future<void> _refund(PaymentSession payment, VoidCallback refresh) async {
    if (!await _confirm(
        'Record refund?',
        payment.cash
            ? 'Return ${money(payment.total)} to the customer before confirming.${payment.billId == null ? '' : ' This refunds the full bill, including every order on it.'}'
            : payment.receiptPayment
                ? 'Return ${money(payment.total)} via ${payment.methodLabel} first. This does not send money.${payment.billId == null ? '' : ' This refunds the full bill.'}'
                : 'Record a test refund? No money will be returned.',
        'Record refund')) {
      return;
    }
    if (!mounted) return;
    await _run(() async {
      final current = await _load();
      if (!ref.read(sessionProvider).session!.staff.can(P.paymentsRetract) ||
          !current.refundable) {
        throw const ApiException(
            'Only a settled payment on a served, cancelled, or refund-pending order can be refunded.');
      }
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
          current.payment.billId != null) {
        throw const ApiException(
            'Only an individual order payment can be transferred.');
      }
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
            final verificationNote =
                payment.metadata['verificationNote'] as String?;
            const receiptTimePrefix =
                'Confirmed directly against the bank receipt dated ';
            final receiptTime = verificationNote != null &&
                    verificationNote.startsWith(receiptTimePrefix) &&
                    verificationNote.endsWith('.')
                ? date(verificationNote.substring(
                    receiptTimePrefix.length, verificationNote.length - 1))
                : null;
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
                                const AppText('Payment details',
                                    style:
                                        TextStyle(color: muted, fontSize: 12)),
                                const SizedBox(height: 6),
                                AppText(
                                    detail.bill?.billNumber ??
                                        payment.orderNumber,
                                    style:
                                        Theme.of(context).textTheme.titleLarge),
                                if (detail.bill != null) ...[
                                  const SizedBox(height: 8),
                                  AppText(
                                      '${detail.bill!.locationLabel} · ${detail.bill!.orderIds.length} orders'),
                                ],
                                const SizedBox(height: 12),
                                Align(
                                    alignment: Alignment.centerLeft,
                                    child: StatusBadge(payment.status)),
                                const SizedBox(height: 20),
                                const AppText('Payment amount',
                                    style:
                                        TextStyle(color: muted, fontSize: 12)),
                                const SizedBox(height: 6),
                                AppText(money(payment.total),
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineLarge
                                        ?.copyWith(
                                            color: forestDark,
                                            fontWeight: FontWeight.w800)),
                                const SizedBox(height: 10),
                                AppText(
                                    '${payment.methodLabel}${payment.phone == null ? '' : ' · ${payment.phone}'}'),
                                if (code(payment.method) == 'QRSCAN' &&
                                    payment.qrData != null) ...[
                                  const SizedBox(height: 24),
                                  AppText('Test QR · No money collected',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: amber)),
                                  Center(
                                      child: QrImageView(
                                          data: payment.qrData!,
                                          size: 240,
                                          backgroundColor: Colors.white,
                                          semanticsLabel: context.t(
                                              'Test QR code. Does not collect money.'))),
                                ],
                              ]))),
                  const SizedBox(height: 16),
                  if (payment.receiptPayment) ...[
                    if (code(payment.status) == 'REFUNDED') ...[
                      const Notice(
                          'Refund recorded. The original receipt is kept for reference.'),
                      const SizedBox(height: 12),
                    ],
                    if (code(payment.verification) == 'VERIFIED')
                      AppText('Receipt verified',
                          style: TextStyle(
                              fontWeight: FontWeight.bold, color: forest))
                    else
                      AppText('Receipt: ${statusLabel(payment.verification)}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (code(payment.verification) != 'VERIFIED')
                      const Notice(
                          'Receipt unverified. Check it before releasing tips.'),
                    const SizedBox(height: 12),
                    for (final field in [
                      ('Transaction', 'receiptReference'),
                      ('Payer', 'verifiedPayerName'),
                      ('Bank', 'verifiedBank'),
                      ('Receipt link', 'receiptUrl'),
                    ])
                      if (payment.metadata[field.$2] != null)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  AppText(field.$1,
                                      style: const TextStyle(
                                          color: muted, fontSize: 12)),
                                  const SizedBox(height: 4),
                                  SelectableText(
                                      '${payment.metadata[field.$2]}'),
                                ])),
                    if (receiptTime != null) ...[
                      const AppText('Payment time',
                          style: TextStyle(color: muted, fontSize: 12)),
                      const SizedBox(height: 4),
                      AppText(
                          DateFormat.yMMMd(context.languageCode)
                              .add_Hm()
                              .format(receiptTime.toLocal()),
                          translate: false),
                    ] else if (verificationNote != null)
                      AppText(verificationNote),
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
                                          Expanded(child: AppText(row.$1)),
                                          const SizedBox(width: 12),
                                          AppText(money(row.$2))
                                        ])),
                            ]))),
                  if (_error != null) Notice(_error!, error: true),
                  const SizedBox(height: 16),
                  if (staff.can(P.ordersView))
                    OutlinedButton.icon(
                        onPressed: () =>
                            context.go('/orders/${payment.orderId}'),
                        icon: const Icon(Icons.receipt_long_outlined),
                        label: const AppText('View order')),
                  if (canManage && payment.pending) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () async {
                                if (!await _confirm(
                                    'Cancel test payment?',
                                    'Cancel this pending test payment?',
                                    'Cancel payment')) {
                                  return;
                                }
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
                        label: AppText('Cancel test payment'))
                  ],
                  if (canManage && detail.refundable) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed:
                            _busy ? null : () => _refund(payment, refresh),
                        icon: const Icon(Icons.undo),
                        label: const AppText('Record refund')),
                    if (payment.billId == null && settledServed) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                          onPressed:
                              _busy ? null : () => _transfer(payment, refresh),
                          icon: const Icon(Icons.swap_horiz),
                          label: const AppText('Transfer payment'))
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
          title: const AppText('Transfer payment'),
          content: SizedBox(
              width: 460,
              height: 450,
              child: PullToRefresh(
                  child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AppText(
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
                                              title: AppText(
                                                  '${shortOrderNumber(order.orderNumber)} · ${order.locationLabel}'),
                                              subtitle: AppText(
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
                child: const AppText('Cancel'))
          ]);
}
