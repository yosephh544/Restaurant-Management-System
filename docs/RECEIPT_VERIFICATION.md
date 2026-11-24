# Receipt Verifier (check.et) — Backend Implementation

How the API confirms customer **Telebirr / CBE transfer receipts** before a bill is marked paid.

Last updated: 2026-11-23 · Source of truth is the code under `Api/`. Where this document and the code disagree, the code wins.

## Contents

1. [What it does](#1-what-it-does)
2. [Moving parts](#2-moving-parts)
3. [End-to-end flow](#3-end-to-end-flow)
4. [Request contract](#4-request-contract)
5. [Step-by-step implementation](#5-step-by-step-implementation)
6. [The check.et client](#6-the-checket-client)
7. [Amount and tip rules](#7-amount-and-tip-rules)
8. [Data model](#8-data-model)
9. [Verification statuses](#9-verification-statuses)
10. [Configuration](#10-configuration)
11. [Error and status matrix](#11-error-and-status-matrix)
12. [Current limitations](#12-current-limitations)
13. [Local testing](#13-local-testing)

---

## 1. What it does

A customer pays by transferring money directly to the restaurant's Telebirr number or CBE
account. The waiter scans the customer's receipt QR (or, for CBE, types the transaction
number), and the server asks **check.et** (an Ethiopian bank-receipt verification service)
whether that receipt is real, unused, and for the expected amount.

The verifier is **not** a payment gateway. Money moves bank-to-bank; the backend only
*records and verifies* the transfer, then settles the bill. This is separate from the
ArifPay integration (`/payments/initiate`, webhook), which is a real gateway and is still
present but dormant.

Key properties:

- Verification is **fail-closed when configured**: if a key is set and check.et cannot
  confirm the receipt, the payment is rejected (HTTP 409) and nothing is settled.
- Verification is **skipped when not configured**: without `CheckEt:ApiKey` the transfer is
  still recorded, but flagged `UNVERIFIED` with an explicit note.
- The API key lives in configuration/environment only. It is never returned by any
  settings or payment endpoint.

## 2. Moving parts

| Component | File | Role |
|---|---|---|
| Endpoint | `Api/Api/Controllers/Payment/PaymentsController.cs` (`POST /api/v1/payments/record`) | HTTP entry, requires `PaymentsInitiate` |
| Request DTO | `Api/Implementation/Dtos/Payment/RecordDigitalPaymentRequest.cs` | Method, receipt URL, transaction number, optional amount/payer |
| Orchestration | `Api/Implementation/Services/Payment/PaymentService.cs` → `RecordDigitalPaymentAsync` | Validations, duplicate checks, verification call, settlement |
| Verifier interface | `Api/Implementation/Interfaces/Payment/ICheckEtVerifier.cs` | `VerifyAsync(receiptUrl, bank, transactionNumber, accountNumber)` |
| Verifier client | `Api/Implementation/Services/Payment/CheckEtVerifier.cs` | Typed `HttpClient` wrapper over check.et's `POST api/v1/verify` |
| Result type | `Api/Implementation/Dtos/Payment/CheckEtVerificationResult.cs` | Normalized outcome (`IsConfigured`, `Verified`, `Duplicate`, receipt fields) |
| Entity | `Api/Infrustructure/Models/Billing/Payment.cs` | Stores the receipt, verification verdict and audit fields |
| Settings entity | `Api/Infrustructure/Models/Configuration/RestaurantSettings.cs` | Telebirr number, CBE account number, account holder name |
| Registration | `Api/Api/Extensions/ServiceCollectionExtensions.cs` (lines ~132–145) | Typed client, base URL, timeout |
| Schema | `Api/Api/Migrations/20261121085945_AddDigitalPaymentVerification.cs` | Verification columns + unique receipt index |

## 3. End-to-end flow

```
Waiter (client)                    API                          check.et
    |  scan receipt QR / type txn   |                              |
    |-- POST /payments/record ----->|                              |
    |                               | 1. load bill + session + orders
    |                               | 2. validate method/inputs
    |                               | 3. local duplicate checks
    |                               | 4. build payload, POST api/v1/verify -->
    |                               |<-- success/exists/duplicate + receipt data
    |                               | 5. reject (409) or compute amount/tip
    |                               | 6. write payment + settle bill/orders/session
    |<-- PaymentResponse -----------|                              |
```

1. The waiter generates the table bill first (the session must be in `BillRequested`).
2. The waiter taps **Telebirr** or **CBE** at the till, scans the customer's receipt QR,
   and the client posts to `/payments/record`.
3. The server verifies with check.et, then marks the payment `Paid`, the bill `Paid`, every
   open order on the bill `Paid`, closes the dining session, and frees the table.
4. Any overpayment above the bill total is recorded as the waiter's tip.

Authorization: the endpoint uses `[Permission(Permissions.PaymentsInitiate)]`. A user with
the Waiter role must additionally pass `WaiterMayCollect` — they may only collect payment
for a session they opened, a bill they requested, or an order they own. Cashiers/managers
and owners are not restricted by that check.

## 4. Request contract

`POST /api/v1/payments/record` — header `Authorization: Bearer <JWT>`.

```json
{
  "billId": "…guid…",            // BillId or OrderId is required
  "orderId": "…guid…",           // OrderId resolves the open bill itself
  "method": "TELEBIRR",          // TELEBIRR | CBE (regex-validated on the DTO)
  "receiptUrl": "https://…",     // decoded from the customer's receipt QR
  "transactionNumber": "FT…",    // CBE fallback when there is no receipt link
  "amountPaid": 517.50,          // optional; check.et's amount wins when returned
  "payerName": "Abebe"           // optional; check.et's payer name wins when returned
}
```

Input rules (enforced in `RecordDigitalPaymentAsync` and by DTO attributes):

- `ReceiptUrl` must be an absolute `http`/`https` URL; anything else is a 422.
- **Telebirr requires `receiptUrl`.** A bare transaction number is not accepted.
- **CBE requires either `receiptUrl` or `transactionNumber`.**
- `Method` must be `TELEBIRR` or `CBE`.
- The bill must exist, not be `Paid`/`Refunded`/`Voided`, its session must be in
  `BillRequested`, and the bill must still have unpaid orders.

## 5. Step-by-step implementation

### 5.1 Resolve the bill and its orders

`BillId` loads the bill's session, table and orders. `OrderId` loads the order, requires a
dining session, and picks that session's newest `Requested` / `PaymentInitiated` bill.
`billOrders` is every order on the session that is still `Unpaid`, `PaymentInitiated` or
`Retracted`, not kitchen-cancelled, and has `GrandTotal > 0`. The oldest of these becomes
the *representative order* on the payment record (`OrderId` on `payments` is non-null).

### 5.2 Duplicate receipt checks (local, before calling check.et)

Both checks look only at `Paid` payments and return **409** naming the other order:

- Same `ReceiptReference` (transaction number) already used → *"This transaction was
  already recorded for order X."*
- Same `ReceiptUrl` already used → *"This receipt was already recorded for order X."*

A third guard exists at the database level: a **unique filtered index**
`IX_payments_ReceiptReference` (`WHERE ReceiptReference IS NOT NULL AND Status = 'Paid'`).
If two requests race past the SELECT checks, the second `SaveChanges` throws
`DbUpdateException`, caught and re-thrown as a 409.

### 5.3 Call the verifier

The settings row supplies the restaurant's CBE account number. The arguments depend on how
the receipt was captured (`PaymentService.cs`, ~line 407):

| Captured as | Payload sent to check.et |
|---|---|
| Receipt URL (either method) | `receipt_url` only |
| CBE + transaction number | `bank: "cbe"`, `transaction_number`, `account_number` (from settings) |

Local duplicate checks run **before** this call, so a re-scanned receipt is rejected without
spending a check.et request.

### 5.4 Interpret the verdict

`CheckEtVerificationResult.IsConfigured` is the switch:

- **`IsConfigured = false`** (no key or `CheckEt:Enabled = false`): verification is skipped.
  The payment is still recorded with `VerificationStatus = Unverified` and the note
  *"Recorded without check.et verification. Review the receipt before releasing tips."*
  This keeps local/offline development usable.
- **Configured and `Verified = false`**: throw **409** with check.et's message, or a
  generic *"check.et could not confirm this receipt."* A `Duplicate = true` flag from
  check.et produces *"This receipt has already been verified for another payment."*
  Nothing is settled — fail closed.
- **Configured and `Verified = true`**: continue to amount checks and settlement.

### 5.5 Amounts, settlement and persistence

1. `baseAmount = bill.Subtotal + bill.TaxTotal − bill.DiscountAmount` (tips are never
   entered at the till).
2. The paid amount is `verification.Amount` (check.et) if present, else `request.AmountPaid`.
3. If a paid amount is known and is **lower than the bill**, the request is rejected with a
   409 that states the paid amount, bill total and remaining shortfall.
4. Overpayment becomes `TipAmount`; any earlier `Initiated` session on the bill is retracted.
5. One `payments` row is written with `Status = Paid`, the receipt data, and either
   `VerificationStatus.Verified` (plus `VerifiedAt`, `VerifiedVia = "check.et"`,
   `VerifiedById`, bank and payer from check.et) or `Unverified`.
6. The bill becomes `Paid`, all open orders become `Paid`, the dining session becomes `Paid`
   and closes, and the table returns to `Available`.
7. If a tip was derived, a `WaiterTip` row is created for the collecting waiter (or the
   session owner when a manager/cashier collected).
8. A structured info log line records payment id, bill number, method and verdict.

Payment transfer (`POST /payments/{id}/transfer`) copies every receipt/verification field
onto the destination payment, so the proof of payment moves with the money.

## 6. The check.et client

`CheckEtVerifier` is registered in `ServiceCollectionExtensions` as a **typed HttpClient**:

- `BaseAddress` = `CheckEt:BaseUrl` (default `https://api.check.et`); a trailing `/` is
  appended if missing. The request path is `api/v1/verify`.
- `Timeout` = `CheckEt:TimeoutSeconds` (default 20, clamped to 3–60 s).
- Auth: `Authorization: Bearer <CheckEt:ApiKey>`.

Request body (JSON, omitted fields are not sent):

```json
{ "receipt_url": "…", "bank": "cbe", "transaction_number": "…", "account_number": "…" }
```

Response parsing is deliberately tolerant — property lookup is case-insensitive and
handles both numbers and numeric strings:

| check.et field | Used for |
|---|---|
| `success`, `exists` | `Verified = success && exists` |
| `duplicate` | Rejection with the "already verified" message |
| `message` | Rejection reason shown to the till operator |
| `data.bank`, `data.bank_name` | Stored as `VerifiedBank` |
| `data.receipt.amount`, `currency` | `VerifiedAmount`; amount drives under/overpay logic |
| `data.receipt.payer_name` | `VerifiedPayerName` (falls back to `request.PayerName`) |
| `data.receipt.receiver_name`, `status`, `transaction_date` | Parsed into the result (receiver/status/date are currently not persisted) |

Client-side failure handling:

| Situation | Behavior |
|---|---|
| Request times out (not caller-cancelled) | `ServiceUnavailableException` → 503 |
| Connection refused / DNS / TLS | `ServiceUnavailableException` → 503 |
| HTTP 401 / 403 | Logs an error, `ServiceUnavailableException` → 503 (misconfigured key, not the customer's fault) |
| Non-JSON body | `ServiceUnavailableException` → 503 |
| JSON with non-2xx status | Result `Verified = false` with check.et's message → 409 |
| JSON with 2xx and `success/exists` false | Result `Verified = false` → 409 |

## 7. Amount and tip rules

- Bill total is the **pre-tip** amount (`Subtotal + TaxTotal − DiscountAmount`).
- check.et's reported receipt amount always beats the waiter-typed amount.
- Paid < bill → rejected (409). No partial settlement at the till.
- Paid > bill → difference becomes `TipAmount` and a `WaiterTip` row; the bill's
  `GrandTotal` becomes the paid total.
- No known amount (unconfigured verifier and `amountPaid` omitted) → `AmountPaid` stays
  null, tip is 0, and the payment is flagged `UNVERIFIED` for later review.
- Tips are created even for `UNVERIFIED` payments; the note warns staff to review the
  receipt before **payout** (`POST /payments/tips/payout` does not check verification).

## 8. Data model

### `payments` (receipt-related columns)

| Column | Type | Purpose |
|---|---|---|
| `ReceiptUrl` | nvarchar(500) | Decoded receipt link, kept for later review |
| `ReceiptReference` | nvarchar(120) | Bank transaction number |
| `AmountPaid` | decimal(10,2) | Amount as recorded (check.et or typed) |
| `VerificationStatus` | nvarchar(20) | `NotRequired` / `Unverified` / `Verified` / `Failed` |
| `VerifiedAmount` | decimal(10,2) | Amount check.et reported |
| `VerifiedPayerName` | nvarchar(120) | Payer from check.et (or typed fallback) |
| `VerifiedBank` | nvarchar(40) | Bank name/id from check.et |
| `VerifiedAt` | datetime2 | When check.et confirmed |
| `VerifiedVia` | nvarchar(40) | `"check.et"` today; free-text for future manual overrides |
| `VerifiedById` | uniqueidentifier FK → users | Actor whose session ran the verification |
| `VerificationNote` | nvarchar(300) | check.et message or the unverified warning |

Index: `IX_payments_ReceiptReference` — unique, filtered on
`ReceiptReference IS NOT NULL AND Status = 'Paid'`.

### `restaurant_settings` (customer-facing account details)

| Column | Purpose |
|---|---|
| `TelebirrNumber` | Number customers transfer to (shown by the client) |
| `CbeAccountNumber` | CBE account; sent to check.et as `account_number` |
| `AccountHolderName` | Shown next to the account numbers |
| `PaymentQrUrl` | Static payment QR image/link |

These four are editable through the settings API (`SettingsService`). The check.et API key
is **not** part of `RestaurantSettings` and is never serialized.

## 9. Verification statuses

`PaymentVerificationStatus` (`payments.VerificationStatus`, serialized as-is):

| Value | Meaning | API string |
|---|---|---|
| `NotRequired` | Cash / gateway payments | `NOT_REQUIRED` |
| `Unverified` | Transfer recorded but check.et could not confirm | `UNVERIFIED` |
| `Verified` | check.et confirmed the receipt | `VERIFIED` |
| `Failed` | Reserved — see limitations | `FAILED` |

`GET /api/v1/payments?verification=VERIFIED` filters the cashier ledger by this column.
The query parameter is parsed as the enum *name* (case-insensitive), so the accepted values
are `VERIFIED`, `UNVERIFIED` and `NOTREQUIRED` — note that `NOT_REQUIRED` (the API's wire
value) does **not** parse and is silently ignored. Payment list items expose every receipt
and verification field, so back-office staff can open `ReceiptUrl` and re-check a receipt.

## 10. Configuration

| Key | Default | Notes |
|---|---|---|
| `CheckEt:Enabled` | `true` | `false` disables the remote call entirely (results are unverified) |
| `CheckEt:ApiKey` | *(none)* | Bearer token. Missing key = verification skipped, transfers recorded as unverified |
| `CheckEt:BaseUrl` | `https://api.check.et` | Override for sandbox/proxy; `/` is appended automatically |
| `CheckEt:TimeoutSeconds` | `20` | Clamped to 3–60 |

Provide the key through environment variables or user secrets in deployment, e.g.
`CheckEt__ApiKey`. Do not commit it to `appsettings*.json`.

## 11. Error and status matrix

| Outcome | HTTP | Envelope code |
|---|---|---|
| Verified and settled | 200 | — |
| Recorded but unverified (verifier not configured) | 200 | — |
| Invalid method/receipt URL/amount, missing required input | 422 | `VALIDATION_ERROR` |
| Bill already settled/unavailable, session not `BillRequested`, no unpaid orders | 409 | `CONFLICT` |
| Waiter collecting someone else's table | 403 | `FORBIDDEN` |
| Receipt rejected by check.et / duplicate / underpayment / duplicate txn | 409 | `CONFLICT` |
| check.et unreachable, timed out, key rejected, malformed response | 503 | `SERVICE_UNAVAILABLE` |
| Missing/invalid JWT or missing `PaymentsInitiate` permission | 401 / 403 | — |

## 12. Current limitations

- **No manual verify/override endpoint.** Once a transfer is recorded as `Unverified`
  (verifier not configured), there is no API to re-run verification later; `VerifiedVia`
  and `VerificationNote` were designed to support a manual override, but nothing writes
  them besides the auto-verifier.
- **`Failed` is never assigned.** Rejections throw before any payment row is created; a
  failed verification therefore leaves no record. `Unverified` is only used when the
  verifier is not configured.
- **Tips are not gated on verification.** Overpayment tips are created for unverified
  receipts; payout does not check `VerificationStatus`.
- **No amount verification when the amount is unknown.** With the verifier disabled and no
  `amountPaid`, a bill can be settled without any amount comparison.
- **Receiver account is not matched.** check.et's `receiver_name` is parsed but not stored
  or compared against `AccountHolderName`.
- **Receipt uniqueness is only enforced for `Paid` payments.** Retracted/transferred
  duplicates rely on the check.et `duplicate` flag.
- **The `verification` list filter uses enum names.** `NOT_REQUIRED` sent by a client is
  ignored (no filter applied) because the enum member is `NotRequired`.
- **The verifier call is synchronous** inside the request. A slow check.et (up to 20 s)
  blocks the till; the client should show a pending state and allow retry.

## 13. Local testing

The verifier is optional locally. Without `CheckEt:ApiKey`:

1. Generate a table bill, then call the record endpoint with a dummy receipt URL —
   the payment settles and returns `verificationStatus: "UNVERIFIED"`.

With a real (or sandbox) key configured, use the API directly:

```bash
curl -X POST http://localhost:5012/api/v1/payments/record \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "billId": "'$BILL_ID'",
    "method": "TELEBIRR",
    "receiptUrl": "https://receipts.telebirr.et/…"
  }'
```

Expected outcomes to test:

- Valid unused receipt → 200, `verificationStatus: VERIFIED`, fields populated.
- Same receipt twice → 409 *"already recorded for order …"* (local check, no check.et call).
- Receipt for a different amount → 409 with the shortfall message.
- Blocked network → 503 with `SERVICE_UNAVAILABLE`.
- Verifier disabled → 200, `UNVERIFIED`, warning note present.
