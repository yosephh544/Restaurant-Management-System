# RMS Service mobile app

Android app for Waiter, Kitchen, and Cashier accounts, using the existing ASP.NET Core API in `Api`. The interface uses English and displays monetary amounts in ETB.

## Run locally

Start the database and API from the repository root. These commands work in Git Bash:

```bash
SqlLocalDB start MSSQLLocalDB
dotnet ef database update --project Api/Api/RestaurantManagement.Api.csproj --context RestaurantDbContext
dotnet run --project Api/Api/RestaurantManagement.Api.csproj --launch-profile http --urls http://0.0.0.0:5012
```

The HTTP-only launch profile is needed for local Android testing so that the API does not redirect to an untrusted development HTTPS certificate. The app never bypasses certificate validation.

Start an Android emulator, then run:

```bash
cd mobileapp
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5012/api/v1
```

`10.0.2.2` is the Android emulator's address for this computer. It is also the app's default server. For a physical device on the same Wi-Fi, replace it with the computer's LAN IP:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5012/api/v1
```

Allow the local API port through Windows Firewall when testing on Wi-Fi. Alternatively, for a USB-connected Android device:

```bash
adb reverse tcp:5012 tcp:5012
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:5012/api/v1
```

The **Restaurant server** control on the sign-in screen can save another full API URL. A saved URL takes precedence over the build-time default. Changing servers signs out the current user and clears drafts and saved test sessions for that account on this device.

## Accounts and supported workflows

The backend applies its migrations and seeds the initial Owner when it starts. On a fresh database, sign in through Swagger with phone `0920496730` and password `P@ssw0rd`, authorize with the returned bearer token, then create Waiter/Kitchen/Cashier users through `POST /api/v1/users`. An existing Owner password is preserved. Owner/Manager accounts belong in the administration client, not this service app. This app has no offline demo or automatic staff-account creation.

- **Waiter:** phone and PIN/password sign-in; today's own orders; today's paid orders in Payments; saved drafts; notes; create/add/serve orders; unpaid replacement orders; cash/electronic test payments. History is available only to Cashier.
- **Kitchen:** queue and item instructions; pending → preparing → ready; item or full-order cancellation with a required explanation.
- **Cashier:** existing orders; serve where permitted; cash payment with tendered amount and change; electronic test sessions; paid-order History; pending-session retraction; recording refunds and transfers. Cashiers do not create new or replacement orders or add items in this app.
- **Manager/Owner:** unsupported in this service app. Use a management client for those accounts.

Navigation and actions use the `permissions` returned by `GET /auth/me`. Login and token refresh first receive tokens, then retrieve the staff profile with the access token. The backend remains authoritative for permission and ownership checks. Dish selection is available within order creation, adding items, and replacement orders; there is no separate Menu section for these roles.

Kitchen detail reads pending/preparing tickets from the existing paginated `GET /api/v1/kitchen/queue` endpoint, using `kitchen.view`. Item instructions and statuses are available; order-level notes are not returned by this endpoint. Users without `orders.view` see no bill totals and return to the queue when a ticket is ready or fully cancelled. This app update requires no backend changes or migrations.

Only waiters can add items, while an order is pending or preparing. Once it is ready, create a new order for extra dishes so they appear in the current backend's kitchen queue.

The waiter selects dishes, quantities, and instructions, then submits the order to the kitchen. Kitchen staff prepare it and mark it ready; the waiter marks it served and then accepts payment. Order entry and detail pages show no subtotal, tax, tip, or order total. Payment amounts are displayed when accepting payment. Waiters can initiate payment only after the order is served.

## Payments and current API limitations

**Cash payments are manual records; phone and QR sessions remain test-only.** Waiters accept payment after serving the order; cashiers can accept payment for READY/SERVED orders. For cash, enter the amount actually received; the server marks the payment paid immediately and returns the change due. The electronic adapter still generates placeholder sessions rather than contacting ArifPay. The app displays those returned QR payloads with test labels.

The app never invokes the provider webhook or simulates success. During local testing, a developer can exercise callback behavior separately through the API's development tools, then observe status changes in the app.

Payment IDs and their metadata are stored securely by user and server and recovered after an app restart. Sessions created on another device/account cannot be retrieved through the current API; their order-level payment state is still visible. Logout clears the local session history, so keep the creating account signed in when testing session recovery.

The cashier's History tab lists today's orders currently marked PAID on the server, with search and pagination. It includes paid orders across the restaurant, including payments accepted by waiters or on other devices. Open an entry to view its order details. Waiters do not have a History tab.

The waiter's Payments tab lists only their own orders created today and currently marked PAID on the server, with search and pagination. It includes their orders paid by a cashier or on another device. Pending payments remain in Orders, with saved payment details accessible after checkout or through the order's saved-payment link.

Paid orders are excluded from Waiter's and Cashier's Orders tabs and payment-status choices. The app filters using the existing API and paginates the remaining orders, so counts and pages exclude paid orders.

Orders for Waiter and Cashier, Waiter's Payments, and Cashier's History use the order's creation date within the phone's current local calendar day. Local midnight boundaries are sent as UTC through the existing `from` and `to` filters. Refreshing and polling use the current day and reset pagination after midnight.

Partial cancellations reduce the server subtotal and snapshotted tax. Cancelled lines remain visible but are excluded from charged totals. The waiter can accept payment for the remaining order after serving it. Kitchen cancellation is limited to pending/preparing tickets. Reorders create fresh unpaid tickets and no longer send the obsolete `carryOverPayment` field.

Refunds are full backend records allowed only for paid, served orders. Return cash manually before recording a cash refund; an electronic refund record does not contact a provider. Transfers require a paid/served source and a different eligible READY/SERVED target with the matching total, including the source tip. The app saves the destination's new payment ID and marks the source saved payment as transferred.

Billing/receipts, issue approval, push notifications, management screens, and live electronic provider operations remain outside this app's current capabilities. Kitchen and order screens poll every 5 seconds; pending payment sessions poll every 3 seconds. Polling pauses in the background and backs off after failures.

Order and payment mutations are never automatically retried after an ambiguous network failure. The draft is retained and the user must check the existing order/session before submitting again.

## Validation and Android builds

Use Flutter 3.27/Dart 3.6 or a compatible later SDK, Java 17 or 21, Android SDK 35, and Android NDK 27.0.12077973. The Android project uses AGP 8.7.0, Kotlin 2.1.10, and Gradle 8.14.3.

```bash
flutter analyze
flutter test
flutter build apk --debug
```

Debug APK: `build/app/outputs/flutter-apk/app-debug.apk`.

Automated tests were skipped for this compatibility update at the user's request. The existing test fixtures reflect earlier response contracts and need updating before they can validate the new token-only login, permission rules, and payment flows. For manual verification, create staff/menu data, sign in, create an order, prepare it in Kitchen, mark it ready, record cash or an electronic test session, then verify the updated backend status. Refund/transfer actions require a served order.

HTTP is enabled only for Android debug builds. Release configuration requires a trusted HTTPS server:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://your-api.example/api/v1
```

The starter application ID and debug signing setup remain in place. Configure your own application ID and release signing before distributing a production build.
