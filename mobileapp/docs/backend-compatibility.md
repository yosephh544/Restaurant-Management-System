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
- Telebirr/CBE transfers use `/payments/record` with a generated `billId` and raw
  `qrData`. The backend detects and directly verifies the bank. Older clients
  may supply one receipt URL or transaction reference, with an optional method.
- **Scan receipt QR** appears directly in the payment dialog. A successful scan
  submits once for verification; staff do not choose the bank or enter an amount.
  Manual receipt link/legacy CBE FT entry uses **Verify payment**.
- Checkout also offers cash entry. The redundant payment-method dropdown and
  phone-request/generated-QR test options have been removed from this dialog.
- The bank's principal amount is authoritative. It must cover the bill and match
  the configured receiving account. Excess becomes the waiter tip.
- Bank errors and unverified responses do not authorize settlement. Same-bill
  receipt retries recover the existing verified payment; uncertain responses
  require checking the bill before another submission.
- Configuration, legacy PDF support, locking, and deployment are documented in
  [direct bank receipt verification](../../docs/DIRECT_BANK_RECEIPTS.md).

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

Camera scanning, platform permission prompts, and live bank requests still
need device/backend verification. Do not build an APK unless explicitly requested.
