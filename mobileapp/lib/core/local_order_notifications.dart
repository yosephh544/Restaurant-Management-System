import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';
import 'order_alerts.dart';

class LocalOrderNotifications implements OrderNotificationSink {
  final SharedPreferences preferences;
  final FlutterLocalNotificationsPlugin plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false, _allowed = false;
  int _nextId = 0;
  LocalOrderNotifications(this.preferences);
  @override
  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  Future<void> initialize(void Function(OrderAlert) onTap) async {
    if (!supported || _initialized) return;
    void open(String? payload) {
      if (payload == null) return;
      try {
        onTap(OrderAlert.fromJson(jsonObject(jsonDecode(payload))));
      } catch (_) {/* Ignore obsolete or malformed notification payloads. */}
    }

    try {
      await plugin.initialize(
          const InitializationSettings(
              android: AndroidInitializationSettings('ic_stat_order'),
              iOS: DarwinInitializationSettings(
                  requestAlertPermission: false,
                  requestBadgePermission: false,
                  requestSoundPermission: false)),
          onDidReceiveNotificationResponse: (response) =>
              open(response.payload));
      if (defaultTargetPlatform == TargetPlatform.android) {
        await plugin
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(const AndroidNotificationChannel(
                'restaurant_orders', 'Order alerts',
                description:
                    'New preparation tickets and orders ready for service.',
                importance: Importance.max));
      }
      _initialized = true;
      final launch = await plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) {
        open(launch?.notificationResponse?.payload);
      }
    } catch (_) {
      // In-app notifications remain usable if the native plugin is unavailable.
      _initialized = false;
    }
  }

  @override
  Future<bool> requestPermission({bool force = false}) async {
    if (!_initialized) return false;
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        final android = plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        final asked =
            preferences.getBool('order_notification_permission_requested') ==
                true;
        _allowed = force || !asked
            ? await android?.requestNotificationsPermission() ?? false
            : await android?.areNotificationsEnabled() ?? false;
      } else {
        _allowed = await plugin
                .resolvePlatformSpecificImplementation<
                    IOSFlutterLocalNotificationsPlugin>()
                ?.requestPermissions(alert: true, badge: true, sound: true) ??
            false;
      }
      await preferences.setBool(
          'order_notification_permission_requested', true);
    } catch (_) {
      _allowed = false;
    }
    return _allowed;
  }

  @override
  Future<void> show(OrderAlert alert) async {
    if (!_initialized || !_allowed) return;
    await plugin.show(
        ++_nextId,
        alert.title,
        alert.body,
        const NotificationDetails(
            android: AndroidNotificationDetails(
                'restaurant_orders', 'Order alerts',
                channelDescription:
                    'New preparation tickets and orders ready for service.',
                icon: 'ic_stat_order',
                importance: Importance.max,
                priority: Priority.high,
                playSound: true,
                enableVibration: true),
            iOS: DarwinNotificationDetails(
                presentAlert: true,
                presentSound: true,
                presentBanner: true,
                presentList: true,
                threadIdentifier: 'restaurant_orders')),
        payload: jsonEncode(alert.toJson()));
  }

  @override
  Future<void> cancelAll() async {
    if (_initialized) await plugin.cancelAll();
  }
}
