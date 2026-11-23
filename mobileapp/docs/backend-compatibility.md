# Backend compatibility — November 23, 2026

The service app uses the current API contracts for takeaway tickets, item serving,
receipt payments, and prepaid cancellation refunds. PIN authentication and encrypted
staff profiles continue to use their existing endpoints. Cashier cannot create,
add to, replace, or serve orders.

## Billing and receipts

- Dine-in bills use `tableId`; takeaway bills use `orderId` with
  `GET /bills/active/order/{orderId}` and `POST /bills/generate`.
- A takeaway bill's `tableId` is null. The packaging fee is included once in the
  server subtotal and displayed separately as an included charge.
- `/payments/initiate` sends no `tipAmount`. Cash change uses the server's base
  amount. Cash tips are outside the system.
- Telebirr/CBE transfers use `/payments/record`. Telebirr needs a receipt link;
  CBE permits a receipt link or transaction number. The transferred amount is
  entered for recording; the server's verified amount is authoritative and its
  overpayment tip is accepted without a false checkout-total error.
- Camera access is optional; staff may paste the receipt link instead. A scanned
  QR only fills the receipt field. It never submits payment automatically.
- check.et verification requires backend `CheckEt:Enabled` and `CheckEt:ApiKey`
  configuration. Credentials stay on the backend. A backend response marked
  unverified remains identified as unverified in mobile.

## Records and refunds

Cashier History retains today's paid orders. Its **All payment records** control
opens paginated server records, including payments created on other devices.
Payment detail retrieves current server metadata and preserves locally stored
test QR payloads omitted by the listing endpoint.

A settled payment may be refunded if its representative order is served,
cancelled, or refund-pending. The API refunds the full payment and all orders on
its bill, including for a partial kitchen cancellation. Mobile states this scope
before submission. Cash/electronic money must be returned manually. Payment and
refund actions recheck current state; an ambiguous checkout cannot be resubmitted
from the same dialog.

## Preparation and serving

Kitchen and Bartender item actions use their station-specific item status
endpoints. **Ready all** remains available for the station's unfinished items.
Waiter can serve a prepared line before the whole ticket finishes cooking, and
use **Serve all** once the whole order is ready. Served lines leave station
queues. Queue positions and takeaway labels use server response fields.

## Validation

Run these checks from `mobileapp`:

```bash
flutter test test/backend_compatibility_test.dart test/kitchen_navigation_test.dart test/order_alerts_test.dart
flutter analyze
```

Camera scanning, platform permission prompts, and live check.et requests still
need device/backend verification. Do not build an APK unless explicitly requested.
