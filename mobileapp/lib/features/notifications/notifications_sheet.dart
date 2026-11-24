import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/order_alert_providers.dart';
import '../../core/widgets.dart';

Future<void> showOrderNotifications(BuildContext context) =>
    showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const _NotificationsSheet());

class _NotificationsSheet extends ConsumerWidget {
  const _NotificationsSheet();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(orderAlertsProvider);
    final controller = ref.read(orderAlertsProvider.notifier);
    return SafeArea(
        child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .75,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 12, 4),
                      child: Row(children: [
                        const Expanded(
                            child: AppText('Notifications',
                                style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700))),
                        if (feed.unread > 0)
                          TextButton(
                              onPressed: controller.markAllRead,
                              child: const AppText('Mark all read')),
                        IconButton(
                            tooltip: context.t('Close'),
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.close)),
                      ])),
                  const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 20),
                      child: AppText('Keep the app open for alerts.',
                          style: TextStyle(color: muted))),
                  if (feed.phoneSupported && !feed.phoneEnabled)
                    Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(children: [
                          const Expanded(
                              child: AppText('Phone notifications are off.')),
                          TextButton(
                              onPressed: controller.enablePhoneAlerts,
                              child: const AppText('Enable')),
                        ])),
                  if (feed.error != null)
                    Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Notice(feed.error!, error: true)),
                  const SizedBox(height: 8),
                  Expanded(
                      child: RefreshIndicator(
                          color: forest,
                          onRefresh: controller.pollNow,
                          child: ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                              children: [
                                if (feed.entries.isEmpty)
                                  const Padding(
                                      padding: EdgeInsets.all(24),
                                      child:
                                          EmptyState('No notifications', '')),
                                for (final alert in feed.entries)
                                  Card(
                                      child: ListTile(
                                          title: AppText(alert.title,
                                              style: TextStyle(
                                                  fontWeight: alert.read
                                                      ? FontWeight.w400
                                                      : FontWeight.w700)),
                                          subtitle: AppText(
                                              '${alert.body}\n${DateFormat('MMM d, HH:mm', context.languageCode).format(alert.created.toLocal())}'),
                                          isThreeLine: true,
                                          trailing: alert.read
                                              ? null
                                              : const Icon(Icons.circle,
                                                  size: 8, color: forest),
                                          onTap: () {
                                            Navigator.pop(context);
                                            controller.open(alert);
                                          })),
                              ]))),
                ])));
  }
}
