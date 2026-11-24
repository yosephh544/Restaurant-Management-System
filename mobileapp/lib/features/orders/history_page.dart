import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'orders_page.dart';

class PaidOrdersPage extends ConsumerStatefulWidget {
  const PaidOrdersPage({super.key});
  @override
  ConsumerState<PaidOrdersPage> createState() => _PaidOrdersPageState();
}

class _PaidOrdersPageState extends ConsumerState<PaidOrdersPage> {
  int _page = 1;
  DateTime _day = DateUtils.dateOnly(DateTime.now());
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
    return ref.read(restaurantApiProvider).orders(
        page: _page,
        waiterId: staff.waiter ? staff.id : null,
        payment: 'Paid',
        search: staff.waiter ? '' : _search,
        todayOnly: true);
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(sessionProvider).session?.staff;
    if (staff == null ||
        !(staff.waiter || staff.cashier) ||
        !staff.can(P.ordersView)) {
      return const SizedBox.shrink();
    }
    final search = TextField(
        decoration: InputDecoration(
            hintText: context.t('Search paid orders'),
            prefixIcon: Icon(Icons.search)),
        onChanged: (value) {
          _debounce?.cancel();
          _debounce = Timer(const Duration(milliseconds: 350), () {
            if (mounted) {
              setState(() {
                _search = value.trim();
                _page = 1;
              });
            }
          });
        });
    return ScreenBody(
        child: AsyncPane<PageData<RestaurantOrder>>(
            headerBuilder: (refreshControl) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      RefreshHeading(
                          eyebrow: DateFormat('EEEE', context.languageCode)
                              .format(DateTime.now()),
                          title: staff.waiter
                              ? 'Your payments'
                              : 'Payment history',
                          refreshControl: refreshControl),
                      if (!staff.waiter) ...[
                        search,
                        if (staff.can(P.paymentsView))
                          Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                  onPressed: () =>
                                      context.push('/payment-records'),
                                  child: const AppText('All payment records'))),
                        const SizedBox(height: 16)
                      ],
                    ]),
            loadKey: '$_page/$_search/${staff.id}/${staff.role}',
            interval: const Duration(seconds: 5),
            load: () => _load(staff),
            builder: (data, refresh) {
              final orders = data.items
                  .where((order) =>
                      order.paid &&
                      order.createdToday &&
                      (!staff.waiter || order.waiterId == staff.id))
                  .toList();
              return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionHeading('Paid orders'),
                    if (orders.isEmpty)
                      EmptyState('No paid orders',
                          _search.isNotEmpty ? 'Try another search.' : '',
                          icon: staff.waiter
                              ? Icons.payments_outlined
                              : Icons.history),
                    for (final order in orders)
                      Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: OrderCard(
                              order: order,
                              showAmount: true,
                              showWaiter: staff.cashier,
                              onTap: () =>
                                  context.push('/orders/${order.id}'))),
                    PageButtons(
                        page: data.page,
                        pages: data.totalPages,
                        total: data.totalCount,
                        onPage: (page) => setState(() => _page = page)),
                  ]);
            }));
  }
}
