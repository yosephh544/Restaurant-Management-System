# Majete Corner mobile app

Android app for Waiter, Kitchen, Bartender, and Cashier accounts, using the existing ASP.NET Core API in `Api`. The interface supports English and Amharic and displays monetary amounts in Ethiopian birr (ETB).

The restaurant logo is bundled from `assets/images/logo.jpg` and appears on the sign-in screen, navigation, and Android/iOS launcher icons. To regenerate the launcher icons after replacing the logo, run `powershell -ExecutionPolicy Bypass -File tool/generate_brand_icons.ps1` on Windows.

## Run locally

### Connect to a backend

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
flutter run --dart-define=API_BASE_URL=http://192.168.1.2:5012/api/v1
```

`10.0.2.2` is the Android emulator's address for this computer. Use the build-time API URL above for emulator testing. For a physical device on the same Wi-Fi, replace it with the computer's LAN IP:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5012/api/v1
```

Allow the local API port through Windows Firewall when testing on Wi-Fi. Alternatively, for a USB-connected Android device:

```bash
adb reverse tcp:5012 tcp:5012
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:5012/api/v1
```

The **Restaurant server** control on the sign-in screen can save another full API URL. A saved URL takes precedence over the build-time default. Changing servers signs out the current user and clears drafts and saved payment sessions for that account on this device.

## Accounts and supported workflows

Debug builds temporarily offer **Add quick sign-in account**. Enter a real staff username/PIN and select **Save account**; repeat to add more accounts without signing in. Each saved username/role has a separate sign-in button and **Remove** control. Saving the same username again updates its PIN/details while preserving the other accounts. Normal sign-ins do not replace the saved list. Credentials stay in secure device storage, are tied to the configured server, and are cleared when changing servers. The shortcuts are hidden in profile/release builds and still require a reachable backend, valid credentials, and an allowed shift. See [the temporary feature removal notes](docs/temporary-quick-login.md).

The backend applies its migrations and seeds the initial Owner when it starts. On a fresh database, sign in through Swagger with username `joseph` and the configured Owner password, authorize with the returned bearer token, then create Waiter/Kitchen/Bartender/Cashier users through `POST /api/v1/users`, assign their default shifts, and configure active tables. An existing Owner password is preserved. Owner/Manager accounts belong in the administration client, not this service app. The app does not create staff accounts.

- **Waiter:** username and PIN sign-in; today's own orders; today's paid orders in Payments; saved drafts; notes; create/add/serve orders; unpaid replacement orders; cash payments and verified Telebirr/CBE receipts. History is available only to Cashier.
- **Kitchen:** queue and item instructions; pending → preparing → ready; item or full-order cancellation with a required reason and optional details.
- **Bartender:** drink queue; pending → preparing → ready; cancellation of drink items with a required reason and optional details. Bartender uses the live Bar API.
- **Cashier:** view existing orders; cash payment with tendered amount and change; verified Telebirr/CBE receipts; paid-order History; pending-session retraction; recording refunds and transfers. Cashiers do not create new or replacement orders, add items, or mark orders served in this app.
- **Manager/Owner:** unsupported in this service app. Use a management client for those accounts.

Navigation and actions use the `permissions` returned by `GET /auth/me`, with creation, additions, replacements, and serving additionally reserved for Waiter in this service app. Mobile sign-in uses `username` and a 4–6 digit PIN through `/auth/pin-login`. Staff accounts need a PIN configured by their manager; password sign-in is available only in the administration client. Login and token refresh first receive tokens, then retrieve and decrypt the AES-GCM staff profile with the access token. The current profile omits phone and active fields; a successful `/auth/me` response confirms the account is active. Shift restrictions apply to both sign-in and token refresh. Profile displays the staff member’s shift windows in EAT. The backend remains authoritative for permission and ownership checks; its broader staff grants do not enable waiter actions for Cashier in the app. Dish selection is available within order creation, adding items, and replacement orders; there is no separate Menu section for these roles.

Kitchen detail reads food tickets from paginated `GET /api/v1/kitchen/queue`, using `kitchen.view`. Bartender uses the matching Bar endpoints. Preparation screens use `stationStatus`, so food can be ready while drinks are still preparing. Pending tickets show **Start preparing**, followed by **Ready all** while preparing; individual items also support preparation controls. Ready tickets leave the mobile station board, and their detail screen returns to the queue, including when the last item becomes ready. Queue counts and pages include only pending/preparing tickets. Waiters can serve individual ready items while the rest are cooking, or use **Serve all** once the whole order is ready. Item instructions and statuses are available; order-level notes are not returned by this endpoint. Queue positions come from the backend. Preparation staff see only their station’s items, with no bill totals. This app update requires the current backend and its existing migrations; it adds no backend changes or migrations.

Only the assigned waiter can add items to pending, preparing, ready, or served orders while payment is unpaid or retracted and the dining session has no open bill. Adding items returns the order to preparation and preserves the earlier items' ready/served states. New and replacement orders choose **Dine in** or **Takeaway**; this choice is saved with drafts. Dine-in orders select a configured active table and check its session before submitting. A table with a generated bill must be paid or reopened by an authorized cashier before more orders are placed. Takeaway tickets need no table and are billed independently, including the server's snapshotted packaging fee.

The waiter selects dishes, quantities, and instructions, then submits the order. Food goes to Kitchen and drinks to Bar; the full order becomes ready after both stations finish. The waiter marks it served and then accepts payment. Order entry and detail pages show no subtotal, tax, tip, or order total. Payment amounts are displayed when accepting payment. Waiters can initiate payment only after the order is served.

Status chips filter the Orders list directly. Cards use prominent table labels, concise status text, and shortcuts for the current role: Waiter can mark a ready order served, Kitchen can start preparation or mark a ticket ready, and eligible Waiter/Cashier accounts can open payment entry. Serving and kitchen shortcuts re-read the current record and permissions before changing its status. Additional Cashier filters are available under **More filters**. The visual direction favors readable text and alignment over repeated icon tiles, colored strips, gradients, and decorative containers; see [design notes](docs/design-notes.md).

Order entry uses a scrolling menu that renders visible dishes and nearby dishes as needed, with search and category filters for larger menus. The fixed **Review order** button opens selected items, quantities, table, and notes, with **Send order** fixed at the bottom. **Back to dishes** preserves the selection and menu position. Selected quantities and notes are retained while reviewing or refreshing the menu.

## Order notifications

Waiters receive alerts when their own orders become READY. Kitchen and Bartender accounts receive alerts for new tickets and newly added items in their station's queue. The header bell shows unread alerts; tap an entry or a notification's **View** action to open its order. Android/iOS phone notifications use sound and vibration where permitted by the device, with in-app alerts available even when phone permission is denied.

Notifications check the existing API every five seconds across screens while the app is open, pause in the background, and check again on resume. They do not arrive for new events while the app is closed. Ready alerts follow the backend's whole-order READY status; station readiness and collection behavior are unchanged. See [notification behavior and verification](docs/order-notifications.md).

## Payments and current API limitations

**Checkout offers cash payments and verified bank receipts.** Waiters accept payment after serving the order; cashiers can accept payment for READY/SERVED orders. Checkout reviews the table's eligible orders or the single takeaway ticket and generates or reuses its bill. Every included order must be ready; Waiters must serve all their own included orders first. Payment submits `billId` and uses the server bill's subtotal, tax, discount, and packaging fee. Tax-inclusive menu pricing is already reflected in these totals. For cash, enter the amount received; the server marks the payment paid immediately and returns change. Manual tip entry has been removed: cash tips stay outside the system.

**Telebirr/CBE receipts:** open an order, take payment, and tap **Scan receipt QR** without selecting a bank. Flutter gives a bank hint; the .NET backend independently decodes and verifies the official receipt and pays the generated bill. Manual receipt-link or legacy CBE FT entry remains available. Bank-confirmed principal amounts cover the bill; any excess becomes the waiter tip. Recipient mismatch, missing settings, incomplete payments, unavailable banks and duplicate receipts leave the bill unpaid. No check.et subscription or unverified fallback is used. See [direct bank receipt verification](../docs/DIRECT_BANK_RECEIPTS.md).

The app never invokes the provider webhook or simulates success. During local testing, a developer can exercise callback behavior separately through the API's development tools, then observe status changes in the app.

Payment IDs and metadata are stored securely by user and server and recovered after restart. Payment detail also retrieves server records, including payments created on other devices. Refresh keeps a locally saved test QR when the server's payment list omits it. Logout clears local payment storage.

The cashier's History tab lists today's orders currently marked PAID on the server, with search and pagination. It includes paid orders across the restaurant, including payments accepted by waiters or on other devices. Open an entry to view its order details. **All payment records** opens paginated server payments of every status, so cancelled prepaid and refunded payments can be reviewed. Waiters do not have a History tab.

The waiter's Payments tab lists only their own orders created today and currently marked PAID on the server, with search and pagination. It includes their orders paid by a cashier or on another device. Pending payments remain in Orders, with saved payment details accessible after checkout or through the order's saved-payment link.

Paid orders are excluded from Waiter's and Cashier's Orders tabs and payment-status choices. The app filters using the existing API and paginates the remaining orders, so counts and pages exclude paid orders.

Orders for Waiter and Cashier, Waiter's Payments, and Cashier's History use the order's creation date within the phone's current local calendar day. Local midnight boundaries are sent as UTC through the existing `from` and `to` filters. Refreshing and polling use the current day and reset pagination after midnight.

Partial cancellations reduce the server subtotal and snapshotted tax. Cancelled lines remain visible but are excluded from charged totals. The waiter can accept payment for the remaining order after serving it. Kitchen cancellation is limited to pending/preparing tickets. Reorders create fresh unpaid tickets and no longer send the obsolete `carryOverPayment` field.

Refunds require a settled payment whose representative order is served, cancelled, or refund-pending. They refund the full payment and, for a bill payment, every included order; the confirmation states this scope. Return cash or electronic funds manually before recording a refund; recording does not contact a payment provider. Transfers require a paid/served source and a different eligible READY/SERVED target with a matching total including packaging and the source tip. Payment-pending targets are supported by the current API. The app saves the destination payment ID and marks the source as transferred. Transfer remains limited to legacy individual-order source payments in this app. Bills retain their `billId` in secure storage and can be reopened by an authorized cashier before payment. Ambiguous bill-generation or payment failures are never retried automatically.

Table-bill review and generation are supported. Receipt printing, issue approval, push notifications, management screens, and live electronic provider operations remain outside this app's current capabilities. Kitchen and order screens poll every 5 seconds; pending payment sessions poll every 3 seconds. Polling pauses in the background and backs off after failures.

Pull down to refresh Orders, order details, History, Payments, Kitchen/Bar queues, Profile, dish selection, and bill/transfer lists. Short and empty lists support the same gesture. Refresh keeps existing data visible on connection failures. Dish refresh updates menu prices/availability and active tables while preserving selected quantities, notes, and search; it never reloads an older saved draft. Saved payment lists retrieve current server statuses when refreshed.

Order and payment mutations are never automatically retried after an ambiguous network failure. The draft is retained and the user must check the existing order/session before submitting again.

Order and kitchen screens show short references such as `#001`, alongside the table or takeaway label. Full order references stay in API requests, stored records, and payment history. Receipt verification displays a centered spinner until the bank responds; a failed check restores the entered receipt and cash amount for correction.

## Language

Choose **English** or **አማርኛ** on sign-in or in **Profile → Language**. The choice applies immediately and stays saved on this device after sign-out and restart. Screens, validation messages, payment errors, and order notifications use the selected language.

Menu items use the backend’s Amharic name when one is available and keep their English name otherwise. Customer notes, staff names, bank references, and receipt links stay as entered. Dates use translated labels with the Gregorian calendar; shift times remain EAT.

Mobile translations and plain English error wording live in `lib/core/translations_am.dart` and `lib/core/localization.dart`. Run `node tool/localize_ui.cjs` to refresh the UI string inventory for translation review.

## Validation and Android builds

Use Flutter 3.47.7/Dart 3.13.5 (the verified SDK) or a compatible later SDK, Java 17 or 21, Android SDK 35, and Android NDK 27.0.12077973. The Android project uses AGP 8.7.0, Kotlin 2.1.10, and Gradle 8.14.3.

```bash
flutter analyze
flutter test
```

Use focused tests when needed for behavior changes. APK builds run only on explicit request. Debug APK output: `build/app/outputs/flutter-apk/app-debug.apk`.

The tests use the encrypted staff profile and current backend contracts. They cover takeaway checkout/drafts, cash totals, receipt payments and recovery, cancelled prepaid refunds, stale payment protection, role restrictions, kitchen navigation, added-item notifications, daily tips, saved language switching, and narrow-phone layouts in Amharic. Camera scanning and live bank verification still require a device and configured receiving accounts on a reachable backend.

HTTP is enabled only for Android debug builds. Release configuration requires a trusted HTTPS server:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://your-api.example/api/v1 --dart-define=RESPONSE_ENCRYPTION_KEY=your-profile-key
```

`RESPONSE_ENCRYPTION_KEY` must match the server’s `ResponseEncryption:Key` (`ResponseEncryption__Key` environment variable). Debug builds default to the same development key supplied by the backend’s HTTP/HTTPS launch profiles; release builds require an explicit key. This is the profile response key, separate from the JWT signing key.

The starter application ID and debug signing setup remain in place. Configure your own application ID and release signing before distributing a production build.
