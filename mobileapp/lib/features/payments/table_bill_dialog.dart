import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/billing.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/widgets.dart';

Future<TableBill?> prepareTableBill(BuildContext context, RestaurantApi api,
        RestaurantOrder order, Staff staff) =>
    showDialog<TableBill>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _TableBillDialog(api: api, order: order, staff: staff));

class _TableBillDialog extends StatefulWidget {
  final RestaurantApi api;
  final RestaurantOrder order;
  final Staff staff;
  const _TableBillDialog(
      {required this.api, required this.order, required this.staff});
  @override
  State<_TableBillDialog> createState() => _TableBillDialogState();
}

class _TableBillDialogState extends State<_TableBillDialog> {
  bool _busy = false, _uncertain = false;
  String? _error;
  Future<void> _reopen(TableBill bill, VoidCallback refresh) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.reopenBill(bill.id);
      refresh();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _uncertain = e is ApiException && e.uncertain;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _continue(BillPreview preview, VoidCallback refresh) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final current = await widget.api.previewBill(widget.order, widget.staff);
      if ((current.total - preview.total).abs() > .01 ||
          current.orders
              .map((o) => o.id)
              .toSet()
              .difference(preview.orders.map((o) => o.id).toSet())
              .isNotEmpty ||
          current.orders.length != preview.orders.length) {
        throw const ApiException(
            'The table changed. Review its updated bill before continuing.');
      }
      final bill = current.bill ??
          await widget.api.generateBill(
              tableId: current.table?.id,
              orderId: widget.order.takeaway ? widget.order.id : null);
      if (mounted) Navigator.pop(context, bill);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _uncertain = e is ApiException && e.uncertain;
        });
        refresh();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !_busy,
      child: AlertDialog(
          title: AppText('${widget.order.locationLabel} bill'),
          content: SizedBox(
              width: 460,
              child: PullToRefresh(
                  child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: AsyncPane<BillPreview>(
                          loadKey: widget.order.id,
                          load: () => widget.api
                              .previewBill(widget.order, widget.staff),
                          builder: (preview, refresh) => Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    AppText(widget.order.takeout
                                        ? 'Payment covers this takeout order.'
                                        : widget.order.takeaway
                                            ? 'Payment covers this takeaway order, including packaging.'
                                            : 'Payment covers all orders on this table bill.'),
                                    const SizedBox(height: 16),
                                    for (final order in preview.orders)
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 8),
                                          child: AppText(
                                              '${shortOrderNumber(order.orderNumber)} · ${statusLabel(order.status)} · ${money(order.charge)}')),
                                    const Divider(),
                                    AppText(
                                        'Subtotal: ${money(preview.subtotal)}'),
                                    AppText('Tax: ${money(preview.tax)}'),
                                    if (preview.takeawayFee > 0)
                                      AppText(
                                          'Packaging included: ${money(preview.takeawayFee)}'),
                                    if ((preview.bill?.discount ?? 0) > 0) ...[
                                      AppText(
                                          'Discount: ${money(preview.bill!.discount)}'),
                                    ],
                                    const SizedBox(height: 8),
                                    AppText('Total: ${money(preview.total)}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold)),
                                    if (_error != null)
                                      Notice(_error!, error: true),
                                    if (_uncertain)
                                      const Notice(
                                          'Close and reopen this bill to check whether it was generated before trying again.'),
                                    const SizedBox(height: 16),
                                    if (preview.bill != null ||
                                        widget.staff.can(P.billsGenerate))
                                      FilledButton(
                                          onPressed: _busy || _uncertain
                                              ? null
                                              : () =>
                                                  _continue(preview, refresh),
                                          child: AppText(_busy
                                              ? 'Loading…'
                                              : preview.bill == null
                                                  ? 'Generate bill'
                                                  : 'Continue to payment'))
                                    else
                                      const Notice(
                                          'Ask a waiter or cashier with bill access to generate this table bill.'),
                                    if (preview.bill != null &&
                                        widget.staff.cashier &&
                                        widget.staff.can(P.billsReopen)) ...[
                                      const SizedBox(height: 12),
                                      OutlinedButton(
                                          onPressed: _busy || _uncertain
                                              ? null
                                              : () => _reopen(
                                                  preview.bill!, refresh),
                                          child: AppText(widget.order.takeout
                                              ? 'Reopen takeout order'
                                              : widget.order.takeaway
                                                  ? 'Reopen takeaway order'
                                                  : 'Reopen table for more orders')),
                                    ],
                                  ]))))),
          actions: [
            TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                child: const AppText('Close'))
          ]));
}
