# Order notifications

This mobile feature reads the existing API; it does not change backend statuses, serving, or Kitchen/Bar queues.

## Recipients and behavior

- Waiter with `orders.view`: their own whole orders becoming `READY`, fetched from all pages of the Orders API without a date restriction so overnight ready orders are included.
- Kitchen with `kitchen.view`: new tickets and newly added active item IDs in the Kitchen queue.
- Bartender with `bar.view`: the same events in the Bar queue.
- Cashier and other roles do not subscribe to preparation or ready alerts.

The first successful snapshot establishes a baseline. Existing ready orders appear silently in the waiter's list; existing preparation tickets do not trigger an alert. Later events trigger an in-app banner and, if allowed, a local phone notification. The header bell shows unread entries, supports marking all read and pulling to refresh, and opens the matching order when tapped. The list keeps the latest 50 alerts for the current sign-in.

The in-app banner dismisses after five seconds, including when its **View** action is present. Dismissing the banner does not mark the alert as read; it stays available through the notification bell.

Waiter detection remembers the non-cancelled item IDs in each ready order. When added items become ready, new item IDs trigger another ready alert for the same order. This also works if preparation finishes between polls; unchanged ready snapshots do not repeat the notification.

Detection history is kept in memory separately by server, account, and role so switching between quick sign-in accounts does not repeatedly announce the same events. Alert lists reset on account changes. Signing out or switching accounts clears delivered phone notifications, and notification taps cannot open an order under a different account. App restarts establish a fresh baseline; this is not a persistent event inbox.

## Delivery limits

The watcher checks every five seconds while the app is in the foreground, regardless of the current screen. Failed checks back off to at most 30 seconds. A failed or incomplete page fetch does not advance detection history. Polling pauses in the background and checks immediately on resume. New events while the app is closed require a backend push service, which is outside this change.

Ready alerts currently require the backend's **whole-order READY** state. A food station finishing while the bar is still preparing will not trigger a ready alert until the backend reports the whole order ready. The backend developer will handle station readiness and queue collection separately.

Android/iOS notifications use the device's notification permission and settings. Android uses the `restaurant_orders` channel with sound and vibration. The notification list offers **Enable** if permission is unavailable; in-app notifications remain usable. Unsupported platforms or native-plugin failures also retain the in-app list. No permission or notification action writes to the backend.

## Validation

Run `flutter test test/order_alerts_test.dart test/kitchen_navigation_test.dart` for detection, pagination, failure recovery, lifecycle, account isolation, permission fallback, bell/list navigation, grouped banner navigation, and station Back-key regressions. These tests fake native delivery; actual phone permission, sound, vibration, and notification taps require device verification. No APK build was performed for this change.
