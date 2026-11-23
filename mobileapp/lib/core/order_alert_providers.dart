import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'local_order_notifications.dart';
import 'order_alerts.dart';
import 'session.dart';

final orderNotificationSinkProvider = Provider<OrderNotificationSink>(
    (ref) => LocalOrderNotifications(ref.read(preferencesProvider)));

final orderAlertsProvider =
    StateNotifierProvider<OrderAlertsController, OrderAlertsState>((ref) {
  final controller = OrderAlertsController(
      fetch: (staff) =>
          fetchAlertOrders(ref.read(restaurantApiProvider), staff),
      sink: ref.read(orderNotificationSinkProvider));
  void configure(SessionState session) => controller.configure(
      session.session?.staff, ref.read(sessionProvider.notifier).server);
  ref.listen(sessionProvider, (_, next) => configure(next));
  configure(ref.read(sessionProvider));
  return controller;
});
