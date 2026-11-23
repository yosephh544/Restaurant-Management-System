import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'session.dart';
import 'models.dart';
import 'widgets.dart';
import 'permissions.dart';
import '../features/authentication/auth_pages.dart';
import '../features/orders/orders_page.dart';
import '../features/orders/history_page.dart';
import '../features/orders/cart_page.dart';
import '../features/orders/order_detail_page.dart';
import '../features/kitchen/queue_page.dart';
import '../features/payments/payment_pages.dart';
import 'order_alert_providers.dart';
import '../features/notifications/notifications_sheet.dart';

List<(String, String, IconData)> destinationsFor(Staff staff) => [
      if (staff.canViewStation)
        (
          '/queue',
          staff.bartender ? 'Bar' : 'Queue',
          staff.bartender
              ? Icons.local_bar_outlined
              : Icons.soup_kitchen_outlined
        ),
      if (staff.can(P.ordersView))
        ('/orders', 'Orders', Icons.receipt_long_outlined),
      if (staff.cashier && staff.can(P.ordersView))
        ('/history', 'History', Icons.history),
      if (!staff.cashier &&
          staff.can(P.paymentsView) &&
          (!staff.waiter || staff.can(P.ordersView)))
        ('/sessions', 'Payments', Icons.payments_outlined),
      ('/profile', 'Profile', Icons.person_outline),
    ];
String homeFor(Staff staff) => destinationsFor(staff).first.$1;
String? routeRedirect(SessionState state, String path) {
  if (!state.ready) return path == '/loading' ? null : '/loading';
  final staff = state.session?.staff;
  if (staff == null) return path == '/login' ? null : '/login';
  if (!staff.supported) return path == '/unsupported' ? null : '/unsupported';
  if (['/', '/loading', '/login', '/unsupported', '/menu', '/tips']
      .contains(path)) {
    return homeFor(staff);
  }
  if (path == '/sessions' && staff.cashier) {
    return staff.can(P.ordersView) ? '/history' : homeFor(staff);
  }
  if (staff.preparationStaff && staff.canViewStation) {
    final orderLink = RegExp(r'^/orders/([^/]+)$').firstMatch(path);
    if (orderLink != null && orderLink.group(1) != 'new') {
      return '/queue/orders/${orderLink.group(1)}';
    }
  }
  if ((path == '/queue' || path.startsWith('/queue/')) &&
          !staff.canViewStation ||
      path == '/history' && !(staff.cashier && staff.can(P.ordersView)) ||
      path == '/sessions' && staff.waiter && !staff.can(P.ordersView) ||
      path.startsWith('/sessions') && !staff.can(P.paymentsView) ||
      path == '/payment-records' &&
          !(staff.cashier && staff.can(P.paymentsView)) ||
      path == '/orders' && !staff.can(P.ordersView) ||
      path == '/orders/new' && !staff.canCreateOrders ||
      path.endsWith('/add') && !staff.canAddItems ||
      path.endsWith('/replace') && !staff.canReplaceOrders ||
      path.startsWith('/orders/') &&
          path != '/orders/new' &&
          !(staff.can(P.ordersView) || staff.canViewStation)) {
    return homeFor(staff);
  }
  return null;
}

class RouterRefresh extends ChangeNotifier {
  void changed() => notifyListeners();
}

// Paint the entire route, including loading states, while it slides over the
// stationary tab page. Fading transparent content would blend both pages' text.
CustomTransitionPage<void> _detailPage(
        BuildContext context, GoRouterState state, Widget child) =>
    CustomTransitionPage<void>(
        key: state.pageKey,
        transitionDuration: const Duration(milliseconds: 220),
        reverseTransitionDuration: const Duration(milliseconds: 180),
        child: ColoredBox(
            color: Theme.of(context).scaffoldBackgroundColor,
            child: SizedBox.expand(child: child)),
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            ClipRect(
                child: SlideTransition(
                    position: Tween<Offset>(
                            begin: const Offset(1, 0), end: Offset.zero)
                        .chain(CurveTween(curve: Curves.easeOutCubic))
                        .animate(animation),
                    child: child)));

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = RouterRefresh();
  ref.listen(sessionProvider, (previous, next) {
    if (previous?.ready != next.ready ||
        previous?.session?.staff.id != next.session?.staff.id ||
        previous?.session?.staff.role != next.session?.staff.role ||
        previous?.session?.staff.permissions.join('|') !=
            next.session?.staff.permissions.join('|')) {
      refresh.changed();
    }
  });
  final router = GoRouter(
      initialLocation: '/',
      refreshListenable: refresh,
      redirect: (context, state) =>
          routeRedirect(ref.read(sessionProvider), state.uri.path),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const SizedBox.shrink()),
        GoRoute(
            path: '/loading',
            builder: (_, __) => const Scaffold(
                body: Center(child: CircularProgressIndicator()))),
        GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
        GoRoute(
            path: '/unsupported',
            builder: (_, __) => const UnsupportedRolePage()),
        ShellRoute(
            builder: (context, state, child) =>
                ServiceShell(path: state.uri.path, child: child),
            routes: [
              GoRoute(
                  path: '/orders',
                  pageBuilder: (_, state) => NoTransitionPage(
                      key: state.pageKey, child: const OrdersPage()),
                  routes: [
                    GoRoute(
                      path: 'new',
                      pageBuilder: (context, s) => _detailPage(
                          context,
                          s,
                          CartPage(
                              key: ValueKey(s.uri.toString()),
                              itemId: s.uri.queryParameters['item'])),
                    ),
                    GoRoute(
                        path: ':id',
                        pageBuilder: (context, s) => _detailPage(
                            context,
                            s,
                            OrderDetailPage(
                                key: ValueKey(s.pathParameters['id']),
                                id: s.pathParameters['id']!)),
                        routes: [
                          GoRoute(
                              path: 'add',
                              pageBuilder: (context, s) => _detailPage(
                                  context,
                                  s,
                                  CartPage(
                                      key: ValueKey(
                                          'add/${s.pathParameters['id']}'),
                                      orderId: s.pathParameters['id']!))),
                          GoRoute(
                              path: 'replace',
                              pageBuilder: (context, s) => _detailPage(
                                  context,
                                  s,
                                  CartPage(
                                      key: ValueKey(
                                          'replace/${s.pathParameters['id']}'),
                                      orderId: s.pathParameters['id']!,
                                      replacement: true))),
                        ]),
                  ]),
              GoRoute(
                  path: '/queue',
                  pageBuilder: (_, state) => NoTransitionPage(
                      key: state.pageKey, child: const QueuePage()),
                  routes: [
                    GoRoute(
                        path: 'orders/:id',
                        pageBuilder: (context, s) => _detailPage(
                            context,
                            s,
                            OrderDetailPage(
                                key:
                                    ValueKey('queue/${s.pathParameters['id']}'),
                                id: s.pathParameters['id']!))),
                  ]),
              GoRoute(
                  path: '/history',
                  pageBuilder: (_, state) => NoTransitionPage(
                      key: state.pageKey, child: const PaidOrdersPage())),
              GoRoute(
                  path: '/payment-records',
                  pageBuilder: (context, state) =>
                      _detailPage(context, state, const SessionsPage())),
              GoRoute(
                  path: '/sessions',
                  pageBuilder: (_, state) => NoTransitionPage(
                      key: state.pageKey,
                      child: ref.read(sessionProvider).session?.staff.waiter ==
                              true
                          ? const PaidOrdersPage()
                          : const SessionsPage())),
              GoRoute(
                  path: '/sessions/:id',
                  pageBuilder: (context, s) => _detailPage(
                      context,
                      s,
                      PaymentPage(
                          key: ValueKey(s.pathParameters['id']),
                          id: s.pathParameters['id']!))),
              GoRoute(
                  path: '/profile',
                  pageBuilder: (_, state) => NoTransitionPage(
                      key: state.pageKey, child: const ProfilePage())),
            ]),
      ],
      errorBuilder: (context, state) => Scaffold(
          body: Center(
              child: EmptyState('Page not found', '',
                  action: FilledButton(
                      onPressed: () => context.go('/'),
                      child: const Text('Home'))))));
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

class ServiceShell extends ConsumerWidget {
  final String path;
  final Widget child;
  const ServiceShell({required this.path, required this.child, super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final alerts = ref.watch(orderAlertsProvider);
    final staff = session.session?.staff;
    if (staff == null) return const SizedBox.shrink();
    final destinations = destinationsFor(staff);
    final found = destinations
        .indexWhere((d) => path == d.$1 || path.startsWith('${d.$1}/'));
    final selected = found < 0 ? 0 : found;
    final root = destinations.any((d) => path == d.$1);
    void selectDestination(int index) {
      final destination = destinations[index].$1;
      if (path != destination) context.go(destination);
    }

    final title = path == '/orders/new'
        ? 'New order'
        : path.endsWith('/add')
            ? 'Add items'
            : path.endsWith('/replace')
                ? 'Replacement order'
                : path.startsWith('/orders/') ||
                        path.startsWith('/queue/orders/')
                    ? 'Order details'
                    : path == '/payment-records'
                        ? 'Payment records'
                        : path.startsWith('/sessions/')
                            ? 'Payment details'
                            : destinations[selected].$2;
    final wide = MediaQuery.sizeOf(context).width >= 600;
    return Scaffold(
        appBar: AppBar(
          toolbarHeight: 72,
          leading: root
              ? const Center(child: BrandMark(size: 42))
              : IconButton(
                  tooltip: 'Back',
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () async {
                    if (context.canPop()) {
                      await GoRouter.of(context).routerDelegate.popRoute();
                    } else {
                      context.go(homeFor(staff));
                    }
                  }),
          titleSpacing: 0,
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              root ? restaurantName : title,
              style: TextStyle(fontSize: 20),
            ),
          ]),
          bottom: const PreferredSize(
              preferredSize: Size.fromHeight(1), child: Divider(height: 1)),
          actions: [
            if (alerts.enabled)
              IconButton(
                  tooltip: 'Notifications',
                  onPressed: () => showOrderNotifications(context),
                  icon: Badge.count(
                      count: alerts.unread,
                      isLabelVisible: alerts.unread > 0,
                      child: const Icon(Icons.notifications_outlined))),
            if (MediaQuery.sizeOf(context).width >= 360)
              Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Text(statusLabel(staff.role),
                      style: const TextStyle(
                          color: muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600))),
            IconButton(
                tooltip: 'Profile',
                onPressed: () {
                  if (path != '/profile') context.go('/profile');
                },
                style: IconButton.styleFrom(
                    side: const BorderSide(color: lineColor),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(13))),
                icon: const Icon(Icons.person_outline, size: 20)),
            const SizedBox(width: 10),
          ],
        ),
        body: SafeArea(
            child:
                Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (wide)
            NavigationRail(
                selectedIndex: selected,
                labelType: NavigationRailLabelType.all,
                backgroundColor: Colors.white,
                indicatorColor: mint,
                selectedIconTheme: const IconThemeData(color: forest),
                unselectedIconTheme: const IconThemeData(color: muted),
                selectedLabelTextStyle: const TextStyle(
                    color: forestDark,
                    fontWeight: FontWeight.w700,
                    fontSize: 11),
                unselectedLabelTextStyle:
                    const TextStyle(color: muted, fontSize: 11),
                leading: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: BrandMark()),
                onDestinationSelected: selectDestination,
                destinations: [
                  for (final d in destinations)
                    NavigationRailDestination(
                        icon: Icon(d.$3), label: Text(d.$2))
                ]),
          Expanded(child: child),
        ])),
        floatingActionButton: path == '/orders' && staff.canCreateOrders
            ? FloatingActionButton.extended(
                onPressed: () => context.go('/orders/new'),
                backgroundColor: forest,
                foregroundColor: Colors.white,
                elevation: 3,
                icon: const Icon(Icons.add),
                label: const Text('New order'))
            : null,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
        bottomNavigationBar: wide
            ? null
            : Container(
                decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: lineColor)),
                    boxShadow: [
                      BoxShadow(
                          color: Color(0x0D23312A),
                          blurRadius: 20,
                          offset: Offset(0, -5))
                    ]),
                child: SafeArea(
                    top: false,
                    child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 7),
                        child: Row(children: [
                          for (var i = 0; i < destinations.length; i++)
                            Expanded(
                                child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 2),
                                    child: Semantics(
                                        selected: i == selected,
                                        button: true,
                                        child: Material(
                                            color: i == selected
                                                ? mint
                                                : Colors.transparent,
                                            borderRadius:
                                                BorderRadius.circular(12),
                                            child: InkWell(
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                onTap: () =>
                                                    selectDestination(i),
                                                child: Padding(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                        horizontal: 4,
                                                        vertical: 9),
                                                    child: Column(
                                                        mainAxisSize:
                                                            MainAxisSize.min,
                                                        children: [
                                                          Icon(
                                                              destinations[i]
                                                                  .$3,
                                                              size: 21,
                                                              color: i ==
                                                                      selected
                                                                  ? forestDark
                                                                  : muted),
                                                          const SizedBox(
                                                              height: 5),
                                                          Text(
                                                              destinations[i]
                                                                  .$2,
                                                              textAlign:
                                                                  TextAlign
                                                                      .center,
                                                              style: TextStyle(
                                                                  fontSize: 12,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w700,
                                                                  color: i ==
                                                                          selected
                                                                      ? forestDark
                                                                      : muted)),
                                                        ]))))))),
                        ])))));
  }
}
