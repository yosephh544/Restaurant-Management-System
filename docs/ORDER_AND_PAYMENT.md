# Orders & Payments — Complete Implementation Reference

Restaurant Management System — API v1

Last updated: 2026-11-19

This document describes the **entire order and payment implementation end to end**: the actors
(waiter, customer, cashier, kitchen, manager, owner), the order lifecycle, the money lifecycle,
every endpoint involved, the financial rules, and a candid list of remaining gaps and logical
flaws so they can be fixed deliberately.

Source of truth is the code under `Api/`. Where this document and the code disagree, the code wins.

## Contents

1. [Actors and responsibilities](#1-actors-and-responsibilities)
2. [Permission matrix](#2-permission-matrix)
3. [Authentication in one paragraph](#3-authentication-in-one-paragraph)
4. [Domain model](#4-domain-model)
5. [Order lifecycle](#5-order-lifecycle)
6. [Orders API](#6-orders-api)
7. [Kitchen API](#7-kitchen-api)
8. [Payment lifecycle](#8-payment-lifecycle)
9. [Payments API reference](#9-payments-api-reference)
10. [End-to-end scenarios](#10-end-to-end-scenarios)
11. [Financial and reporting rules](#11-financial-and-reporting-rules)
12. [Transactions, concurrency, security](#12-transactions-concurrency-security)
13. [Known gaps and logical flaws](#13-known-gaps-and-logical-flaws)
14. [Local run and test notes](#14-local-run-and-test-notes)

---

## 1. Actors and responsibilities

| Actor | How they interact | Main capabilities |
|---|---|---|
| **Waiter** | JWT login (phone + PIN) | Create orders, see **only their own** orders, add items, reorder cancelled tickets, mark orders served, take payment (cash / QR / USSD) for **their own** orders, see their own tip ledger |
| **Kitchen** | JWT login (PIN) | View the prep queue, move tickets PREPARING → READY, partially or fully cancel a ticket **before it is READY** |
| **Cashier** | JWT login (password) | View orders, create/add/serve orders, take payment for any order, retract a pending session, refund a served order, transfer a settled payment |
| **Manager** | JWT login (password) | Everything the cashier can do, plus menu, staff, kitchen and report management |
| **Owner** | JWT login (password) | Everything, including role/permission administration; the Owner role is immutable |
| **Customer** | No account | Reads the public menu anonymously; pays by cash at the table, by scanning a QR code, or by receiving a phone-push/USSD payment prompt |

Customers never call an authenticated endpoint. Their only server interactions are
`GET /api/v1/menu/public` and whatever the payment gateway does on their device.

---

## 2. Permission matrix

Permissions live in `Api/Infrustructure/Common/Constants/Permissions.cs`. Every controller is
`[Authorize]` at class level, and every action additionally requires a permission. Anonymous
exceptions are the auth/login endpoints, the public menu, and the payment webhook.

| Permission | Owner | Manager | Cashier | Waiter | Kitchen |
|---|:--:|:--:|:--:|:--:|:--:|
| `users.view` | ✅ | ✅ | | | |
| `users.create` | ✅ | ✅ | | | |
| `users.update` | ✅ | ✅ | | | |
| `users.status.manage` | ✅ | ✅ | | | |
| `roles.manage` | ✅ | | | | |
| `menu.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `menu.categories.manage` | ✅ | ✅ | | | |
| `menu.items.manage` | ✅ | ✅ | | | |
| `menu.availability.manage` | ✅ | ✅ | | | ✅ |
| `orders.view` | ✅ | ✅ | ✅ | ✅ | |
| `orders.create` | ✅ | ✅ | ✅ | ✅ | |
| `orders.items.add` | ✅ | ✅ | ✅ | ✅ | |
| `orders.reorder` | ✅ | ✅ | | ✅ | |
| `orders.serve` | ✅ | ✅ | ✅ | ✅ | |
| `kitchen.view` | ✅ | ✅ | | | ✅ |
| `kitchen.update` | ✅ | ✅ | | | ✅ |
| `kitchen.cancel` | ✅ | ✅ | | | ✅ |
| `payments.initiate` | ✅ | ✅ | ✅ | ✅ | |
| `payments.view` | ✅ | ✅ | ✅ | ✅ | |
| `payments.retract` | ✅ | ✅ | ✅ | | |
| `tips.view` | ✅ | ✅ | | ✅ | |
| `reports.view` | ✅ | ✅ | | | |

Notes:

- The **Owner** role always receives every permission and is kept in sync on startup; it cannot be
  edited through the roles API.
- Other roles receive their defaults **only when they have no permissions yet**. After that, changes
  made with `PUT /api/v1/roles/{roleId}/permissions` persist across restarts.
- `payments.retract` also guards refund **and** transfer. Waiters cannot refund or transfer.
- Permission checks are evaluated against the database on every request
  (`PermissionAuthorizationHandler`), so deactivating a user or role takes effect immediately even
  though the JWT is still valid.

---

## 3. Authentication in one paragraph

`POST /api/v1/auth/login` (phone + password) or `POST /api/v1/auth/pin-login` (phone + 4–6 digit PIN)
returns `accessToken`, `refreshToken`, `accessTokenExpiry` only. The profile and permission list come
from `GET /api/v1/auth/me`. Send `Authorization: Bearer <accessToken>` on every authenticated call.
Access tokens default to 60 minutes (`Jwt:ExpiryMinutes`); refresh tokens to 7 days
(`Jwt:RefreshTokenExpiryDays`).

---

## 4. Domain model

### 4.1 Order (`orders`)

| Field | Type | Meaning |
|---|---|---|
| `Id` | Guid | Primary key |
| `OrderNumber` | string(20), unique | `ORD-yyMMdd-XXXXXXXX` (readable + collision-safe) |
| `TableNumber` | string(20) | Free-text table/counter identifier (no table entity exists) |
| `WaiterId` | Guid → users | Waiter credited with the ticket; for cashier/manager-created orders this is the creator |
| `ParentOrderId` | Guid? | Set on a replacement order created by reorder |
| `OrderStatus` | enum string | PENDING, PREPARING, READY, SERVED, CANCELLEDBYKITCHEN (stored as `CancelledByKitchen`) — see §5 |
| `PaymentStatus` | enum string | UNPAID, PAYMENTINITIATED, PAID, RETRACTED, TRANSFERRED, REFUNDPENDING, REFUNDED |
| `Subtotal` | decimal(10,2) | Σ (unit price × quantity) of non-cancelled lines |
| `TaxTotal` | decimal(10,2) | Σ (line total × item tax rate at order time) |
| `TipAmount` | decimal(10,2) | Tip captured with the payment |
| `GrandTotal` | decimal(10,2) | `Subtotal + TaxTotal + TipAmount` |
| `CustomerNotes` | string? | Free text for the whole ticket |
| `CreatedAt`, `UpdatedAt` | datetime | Audit timestamps |
| `PreparingAt` | datetime? | Set when kitchen starts PREPARING |
| `ReadyAt` | datetime? | Set when kitchen marks READY |
| `ServedAt` | datetime? | Set when waiter marks SERVED |

Relationships: `Waiter` (user), self-referencing `ParentOrder`/`ReplacementOrders`,
`OrderItems`, `Cancellations`, `Payments`.

### 4.2 Order item (`order_items`)

| Field | Meaning |
|---|---|
| `Id`, `OrderId`, `MenuItemId` | Identity/FKs |
| `Quantity` | 1–100 |
| `UnitPrice` | **Snapshot** of the menu price at ordering time |
| `TaxRate` | **Snapshot** of the menu tax percentage at ordering time |
| `CustomerNotes` | Per-line special instructions |
| `ItemStatus` | ACTIVE → PREPARED, or CANCELLED |
| `CreatedAt`, `UpdatedAt` | Audit |

Price and tax snapshots mean later menu edits never change an existing bill, and partial
cancellations can reverse exactly the tax that was charged.

### 4.3 Payment (`payments`)

| Field | Meaning |
|---|---|
| `Id`, `OrderId` | Identity/FK |
| `InitiatedById` | User who took the payment (or who performed a transfer) |
| `Method` | `Cash`, `QrScan`, `PhonePush` (stored as string) |
| `ArifpaySessionId` | Locally generated session id (QR / phone push only) |
| `TxRef` | Locally generated transaction reference (QR / phone push only) |
| `BaseAmount` | `Subtotal + TaxTotal` (food + tax, no tip) |
| `TipAmount` | Tip portion |
| `TotalAmount` | `BaseAmount + TipAmount` |
| `Status` | INITIATED, PAID, FAILED, RETRACTED, **TRANSFERRED**, REFUNDED |
| `CustomerPhone` | Phone used for PHONE_PUSH/USSD |
| `AmountTendered` | Cash handed over (CASH only) |
| `ChangeGiven` | Change returned (CASH only) |
| `TransferredToOrderId` | Set on the retired record when it is transferred |
| `TransferredFromPaymentId` | Set on the new record that received a transfer |
| `CreatedAt`, `SettledAt`, `UpdatedAt` | Audit timestamps |

### 4.4 Waiter tip (`waiter_tips`)

One row per **settled** payment with `TipAmount > 0` (1:1 with `Payment`).

| Field | Meaning |
|---|---|
| `PaymentId` | Unique FK to the payment that generated the tip |
| `WaiterId` | `Order.WaiterId` at settlement time |
| `OrderId` | Order the tip belongs to |
| `TipAmount` | Amount |
| `PayoutStatus` | UNSETTLED / PAIDOUT |
| `CreatedAt`, `PaidOutAt` | Audit |

### 4.5 Cancellation (`order_cancellations`)

| Field | Meaning |
|---|---|
| `OrderId` | Cancelled order |
| `OrderItemId` | Null for a full cancellation, set for a line cancellation |
| `CancelledById` | Kitchen employee who executed it |
| `ReasonCode` | OUTOFSTOCK / EQUIPMENTISSUE / PREPDELAY / OTHER (stored via enum) |
| `ReasonNote` | Free text |
| `ResolvedByWaiterId`, `ResolvedAt` | Set when the waiter creates a replacement order |
| `ReplacementOrderId` | The reorder that recovered the ticket |

Note: enum values are stored as their `.ToString()` form (`OutOfStock`, etc.). The request accepts
`OUT_OF_STOCK` and strips underscores before parsing.

---

## 5. Order lifecycle

### 5.1 Order status state machine

```
POST /orders
     │
     ▼
  PENDING ──── kitchen: PREPARING ────▶ PREPARING
     │                                      │
     │ kitchen: READY                       │ kitchen: READY
     ▼                                      ▼
   READY ◀──────────────────────────────────┘
     │
     │ waiter: PATCH /served
     ▼
   SERVED

PENDING    ── kitchen: cancel ──▶ CANCELLEDBYKITCHEN
PREPARING  ── kitchen: cancel ──▶ CANCELLEDBYKITCHEN

READY and SERVED cannot be cancelled.
```

- **Allowed transitions**
  - `PENDING → PREPARING` (kitchen)
  - `PENDING → READY` (kitchen may skip PREPARING; `PreparingAt` is backfilled)
  - `PREPARING → READY` (kitchen)
  - `READY → SERVED` (waiter, only from READY)
  - `PENDING`/`PREPARING` → `CANCELLEDBYKITCHEN` (kitchen, full or by line)
- **Rejected transitions**
  - `READY → PREPARING` and `SERVED → PREPARING` — status may not move backwards
  - `SERVED → READY` — cannot reopen a served ticket
  - `READY → CANCELLEDBYKITCHEN` — food is plated; process a return/refund instead
  - `SERVED → CANCELLEDBYKITCHEN` — served food is refunded, not cancelled
  - Any change to a `CANCELLEDBYKITCHEN` order

### 5.2 Item status

```
ACTIVE ──(order marked READY)──▶ PREPARED
   │
   └──(partial kitchen cancellation)──▶ CANCELLED
```

When the order is marked READY, only `ACTIVE` lines become `PREPARED`; already-cancelled lines stay
cancelled.

### 5.3 Order number

`ORD-{yyMMdd}-{first 8 hex characters of a GUID}` — 19 characters, unique index, readable by the
kitchen and cashier, and effectively collision-free under concurrency.

### 5.4 Waiter scoping

If the caller's role is `Waiter`:

- `GET /orders` silently forces `WaiterId = current user`, even if another `waiterId` is supplied.
- `GET /orders/{id}`, add items, serve, reorder and payment initiation reject orders owned by another
  waiter with `403 You can only access your own orders.`

Cashier, Manager and Owner see all orders. Kitchen does not have `orders.view` at all; it only uses
the queue endpoint.

---

## 6. Orders API

Base: `/api/v1/orders`

### 6.1 Create order

`POST /api/v1/orders` — permission `orders.create` — 201

```json
{
  "tableNumber": "T-12",
  "customerNotes": "Birthday table",
  "items": [
    { "menuItemId": "5c0d…", "quantity": 2, "customerNotes": "No onions" },
    { "menuItemId": "90a1…", "quantity": 1 }
  ]
}
```

Rules:

- At least one item (500 validation otherwise); 1–100 per line.
- Every menu item must exist and have `IsAvailable = true`; otherwise `404` / `409`.
- `WaiterId` is the authenticated user (cashier/manager included).
- New order is `PENDING` / `UNPAID`, tip `0`.
- Prices and tax rates are copied into the lines.
- `Subtotal`, `TaxTotal` and `GrandTotal` are computed and rounded to 2 decimals.

Response `data` is the full `OrderResponse` (see §6.7).

### 6.2 List orders

`GET /api/v1/orders` — permission `orders.view` — 200, paged

Query parameters: `page` (default 1), `pageSize` (default 20, max 100), `orderStatus`,
`paymentStatus`, `waiterId`, `tableNumber`, `from`, `to`, `search` (matches order number or table),
`sortDesc` (orders by `CreatedAt`). `sortBy` is accepted but currently ignored.

`orderStatus`/`paymentStatus` are parsed case-insensitively; unrecognised values are ignored.

### 6.3 Get one order

`GET /api/v1/orders/{orderId}` — permission `orders.view` — 200

Includes waiter name, parent order id, both statuses, all amounts, notes, timestamps and item lines
(with current menu item names). Waiter scoping applies.

### 6.4 Add items

`POST /api/v1/orders/{orderId}/items` — permission `orders.items.add` — 200

```json
{ "items": [{ "menuItemId": "5c0d…", "quantity": 1, "customerNotes": "Extra sauce" }] }
```

Rules:

- Waiter must own the order.
- Rejected when the order is `SERVED`, `CANCELLEDBYKITCHEN`, or its payment status is
  `PAID`, `PAYMENTINITIATED`, `TRANSFERRED`, `REFUNDPENDING` or `REFUNDED`.
- New lines inherit current price/tax snapshots; totals are recalculated including the existing tip.

### 6.5 Reorder a cancelled ticket

`POST /api/v1/orders/{orderId}/reorder` — permission `orders.reorder` — 201

```json
{
  "parentOrderId": "…the same id as the route…",
  "tableNumber": "T-12",
  "customerNotes": "Replacement",
  "items": [{ "menuItemId": "5c0d…", "quantity": 2 }]
}
```

Rules:

- `parentOrderId`, if supplied, must equal the route id.
- The original order must be `CANCELLEDBYKITCHEN`.
- Waiter must own the original order (managers/cashiers are not scoped).
- A brand-new `PENDING` / `UNPAID` order is created in a transaction.
- `ParentOrderId` is set, and `WaiterId` is forced to the **original waiter**, so credit and tips stay
  with the same person even when a manager creates the replacement.
- The newest unlinked cancellation for the original is linked:
  `ReplacementOrderId`, `ResolvedByWaiterId`, `ResolvedAt`.
- There is **no** payment carry-over: a cancelled pre-READY ticket has no payment, so the replacement
  is simply unpaid.

### 6.6 Mark served

`PATCH /api/v1/orders/{orderId}/served` — permission `orders.serve` — 200

- Only from `READY`; otherwise `409` with the current status.
- Sets `ServedAt` and `UpdatedAt`.
- Waiter must own the order.

### 6.7 OrderResponse shape

```json
{
  "id": "…",
  "orderNumber": "ORD-261119-1A2B3C4D",
  "tableNumber": "T-12",
  "waiterId": "…",
  "waiterName": "Abebe",
  "parentOrderId": null,
  "orderStatus": "READY",
  "paymentStatus": "UNPAID",
  "subtotal": 400.00,
  "taxTotal": 60.00,
  "tipAmount": 0.00,
  "grandTotal": 460.00,
  "customerNotes": "Birthday table",
  "createdAt": "2026-11-19T10:00:00Z",
  "updatedAt": "2026-11-19T10:12:00Z",
  "servedAt": null,
  "items": [
    {
      "id": "…",
      "menuItemId": "…",
      "menuItemName": "Doro Wat",
      "quantity": 2,
      "unitPrice": 200.00,
      "totalPrice": 400.00,
      "customerNotes": "No onions",
      "itemStatus": "PREPARED"
    }
  ]
}
```

`PreparingAt` and `ReadyAt` are stored but **not** returned by this DTO.

---

## 7. Kitchen API

Base: `/api/v1/kitchen`

### 7.1 Queue

`GET /api/v1/kitchen/queue` — permission `kitchen.view` — 200, paged

- Only `PENDING` and `PREPARING`, oldest first.
- Returns order number, table, waiter name, both statuses, creation time, computed
  `elapsedMinutes`, and items (name, quantity, notes, item status). **Prices are not exposed.**
- Pagination params are accepted; `search`/`sortBy` are ignored.

### 7.2 Update status

`PATCH /api/v1/kitchen/orders/{orderId}/status` — permission `kitchen.update` — 200

```json
{ "status": "PREPARING" }
```

- `PREPARING`: rejected for `READY`/`SERVED`; sets `PreparingAt` once.
- `READY`: sets `PreparingAt` if missing, sets `ReadyAt` once, moves all `ACTIVE` items to `PREPARED`.
- Returns the full `OrderResponse`.
- Any other value → `422`.

### 7.3 Cancel (full or line)

`POST /api/v1/kitchen/orders/{orderId}/cancel` — permission `kitchen.cancel` — 200

```json
{
  "reasonCode": "OUT_OF_STOCK",
  "reasonNote": "Supplier did not deliver",
  "orderItemId": null
}
```

Rules:

- Only `PENDING` and `PREPARING` can be cancelled. `READY` is rejected
  (`Only orders in PENDING or PREPARING status can be cancelled.`); `SERVED` tells you to process a
  customer return; already-cancelled is rejected.
- **Full cancellation** (`orderItemId` null): order → `CANCELLEDBYKITCHEN`, every line → `CANCELLED`,
  any `INITIATED` gateway payment is retracted defensively, and an `OrderCancellation` row (full) is
  written.
- **Line cancellation**: the line must not already be cancelled. Its price and snapshotted tax are
  subtracted from `Subtotal`, `TaxTotal` and `GrandTotal`. An `OrderCancellation` row with
  `OrderItemId` is written. If that leaves every line cancelled, the full-cancellation path also runs.
- **No refund or payment reversal is performed**, because payment cannot exist before `READY`.
- Reason codes: `OUT_OF_STOCK`, `EQUIPMENT_ISSUE`, `PREP_DELAY`, `OTHER`.

---

## 8. Payment lifecycle

### 8.1 Statuses

Order payment status (`PaymentStatus`):

| Value | Meaning |
|---|---|
| `UNPAID` | No payment activity |
| `PAYMENTINITIATED` | QR / phone-push session created, waiting for the gateway |
| `PAID` | Settled |
| `RETRACTED` | The pending session was voided |
| `TRANSFERRED` | This order's payment was moved to another order |
| `REFUNDPENDING` | Legacy value; the current refund flow goes straight to `REFUNDED` |
| `REFUNDED` | Money returned after a served-food return |

Gateway payment status (`PaymentGatewayStatus`):

| Value | Meaning |
|---|---|
| `INITIATED` | Session created |
| `PAID` | Settled |
| `FAILED` | Gateway reported failure |
| `RETRACTED` | Session voided |
| `TRANSFERRED` | Retired record whose money now lives on another order |
| `REFUNDED` | Money returned |

### 8.2 When payment is allowed

`Initiate` requires **all** of:

- Order status is `READY` or `SERVED` — a `PENDING`/`PREPARING` ticket has no payment yet.
- Order is not `CANCELLEDBYKITCHEN`.
- Order payment status is not `PAID`, `REFUNDPENDING` or `REFUNDED`.
- The caller is a waiter who owns the order (cashier/manager/owner are not scoped).

### 8.3 Amounts

```
BaseAmount  = round(Subtotal + TaxTotal, 2)
TipAmount   = round(request.tipAmount, 2)          // 0 … 100,000
TotalAmount = round(BaseAmount + TipAmount, 2)

Order.TipAmount   = TipAmount
Order.GrandTotal  = TotalAmount
```

Cash adds:

```
AmountTendered >= TotalAmount (otherwise 422)
ChangeGiven = AmountTendered - TotalAmount
```

### 8.4 Payment methods

| API value | Stored method | Behaviour |
|---|---|---|
| `CASH` | Cash | Settled immediately, no gateway; change is returned in the response |
| `QR_SCAN` | QrScan | Creates a local session + txRef, returns a QR payload URL |
| `PHONE_PUSH` | PhonePush | Requires `customerPhone`; local session; customer confirms on device |
| `USSD` | PhonePush | Alias for `PHONE_PUSH`; requires `customerPhone` |

> **Important:** the gateway is currently simulated. `ArifpaySessionId`, `TxRef` and the QR URL are
> generated locally; there is no outbound call to ArifPay and no SMS/USSD push is sent. The webhook
> must be triggered manually (or by a future real integration) to settle QR/phone-push payments.

### 8.5 Cash payment sequence

1. Waiter opens the bill for a `READY` or `SERVED` order.
2. `POST /payments/initiate` with `method: "CASH"`, optional `tipAmount`, required `amountTendered`.
3. Any earlier `INITIATED` session on the order is retracted.
4. A payment row is written with `Status = Paid`, `SettledAt = now`, tendered/change recorded.
5. The order becomes `PAID`, its tip/grand total include the tip.
6. If `tipAmount > 0`, a waiter tip row is created immediately (`UNSETTLED`).
7. Response includes `changeGiven`; the controller message reads
   `Cash payment accepted. Change due: X.XX ETB.`

### 8.6 QR / USSD / phone push sequence

1. Waiter/cashier calls `POST /payments/initiate` with `QR_SCAN`, `PHONE_PUSH`, or `USSD`.
2. Earlier `INITIATED` sessions are retracted.
3. Payment row `INITIATED`; local `ArifpaySessionId` + `TxRef`; order `PAYMENTINITIATED`.
4. `QR_SCAN` returns `qrData = https://checkout.arifpay.net/pay/{sessionId}`.
5. Customer completes payment on their device.
6. Gateway calls `POST /payments/arifpay/webhook`:
   - Optional HMAC-SHA256 signature check (`Arifpay:WebhookSecret` over `rawPayload`).
   - Payment located by `txRef` or `sessionId`.
   - Early return for `PAID`, `RETRACTED`, `FAILED`, `TRANSFERRED` (idempotency / stale sessions).
   - If `amount > 0`, it must equal `TotalAmount` within 0.01.
   - `PAID` / `SUCCESS` / `COMPLETED`: payment → `PAID`, order → `PAID`, tip ledger credited.
   - `FAILED` / `CANCELLED`: payment → `FAILED`; order returns to `UNPAID` only if it was
     `PAYMENTINITIATED` (a failed retry never un-pays a settled order).
7. `GET /payments/{paymentId}/status` can be polled: `isSettled` is true only for `PAID`.

### 8.7 Retract

`POST /api/v1/payments/{paymentId}/retract` — permission `payments.retract`

- Only non-`PAID` payments. Settled payments must be refunded.
- Payment → `RETRACTED`; if the order was `PAYMENTINITIATED`, order → `RETRACTED`.

### 8.8 Refund (customer returns served food)

`POST /api/v1/payments/{paymentId}/refund` — permission `payments.retract`

Requirements:

- Payment status is `PAID`.
- The order status is `SERVED` — i.e. the food was delivered and returned.

Effects:

- Payment → `REFUNDED`; order → `REFUNDED`.
- If a tip exists and is still `UNSETTLED`, it is deleted. A `PAIDOUT` tip is left untouched.
- No gateway refund call is made; QR/USSD money must be returned through the gateway manually.

### 8.9 Transfer (payment applied to the wrong order)

`POST /api/v1/payments/{paymentId}/transfer` — permission `payments.retract`

```json
{ "targetOrderId": "…" }
```

Requirements:

- Source payment is `PAID`.
- Source order is `SERVED` (before that no payment exists to transfer).
- Target order exists, is `READY` or `SERVED`, and is not the same order.
- Target payment status is `UNPAID`, `RETRACTED`, or `TRANSFERRED`.
- `target.Subtotal + target.TaxTotal + payment.TipAmount` equals `payment.TotalAmount` (±0.01).
- The tip has not been paid out.

Effects (single transaction):

- Source payment → `TRANSFERRED`, `TransferredToOrderId = target`.
- Source order → `TRANSFERRED`.
- New **`PAID`** payment on the target, copying method, amounts, tip, gateway refs, tendered/change,
  `TransferredFromPaymentId = source`, and the **original** `CreatedAt`/`SettledAt`.
- Target order → `PAID` with the tip and grand total applied.
- Tip row is moved to the new payment, target order, and target waiter.

Revenue is recognised exactly once because the report sums only `PAID` payments.

### 8.10 Tips

- Created on cash settlement and on webhook settlement when `tipAmount > 0`.
- One row per payment (unique `PaymentId`).
- `WaiterId` is the order's waiter; transfers move the row to the target order's waiter.
- `GET /api/v1/payments/tips/my-ledger` (permission `tips.view`) returns only the caller's tips.
- There is **no payout endpoint**; `PayoutStatus.PaidOut` and `PaidOutAt` are never set by the API.

---

## 9. Payments API reference

Base: `/api/v1/payments`

| Method & path | Permission | Purpose |
|---|---|---|
| `POST /initiate` (alias `POST /arifpay/initiate`) | `payments.initiate` | Take payment: CASH, QR_SCAN, PHONE_PUSH, USSD |
| `POST /arifpay/webhook` | anonymous | Gateway settlement callback |
| `GET /{paymentId}/status` | `payments.view` | Minimal status polling |
| `POST /{paymentId}/retract` | `payments.retract` | Void a pending session |
| `POST /{paymentId}/refund` | `payments.retract` | Refund served, returned food |
| `POST /{paymentId}/transfer` | `payments.retract` | Move a settled payment to another order |
| `GET /tips/my-ledger` | `tips.view` | Caller's tip history, paged |

### 9.1 Initiate examples

Cash:

```json
{ "orderId": "…", "method": "CASH", "tipAmount": 20, "amountTendered": 500 }
```

Response `data`:

```json
{
  "id": "…",
  "orderId": "…",
  "orderNumber": "ORD-261119-1A2B3C4D",
  "method": "CASH",
  "baseAmount": 460.00,
  "tipAmount": 20.00,
  "totalAmount": 480.00,
  "status": "PAID",
  "qrData": null,
  "amountTendered": 500.00,
  "changeGiven": 20.00,
  "createdAt": "2026-11-19T10:20:00Z",
  "settledAt": "2026-11-19T10:20:00Z"
}
```

QR:

```json
{ "orderId": "…", "method": "QR_SCAN", "tipAmount": 0 }
```

Response: `status = "INITIATED"`, `qrData` populated, `amountTendered`/`changeGiven = null`.

USSD / phone push:

```json
{ "orderId": "…", "method": "USSD", "customerPhone": "0911223344", "tipAmount": 0 }
```

`method` in responses is normalised to `CASH`, `QR_SCAN`, or `PHONE_PUSH`.

### 9.2 Webhook example

```json
{
  "txRef": "TX-ORD-261119-1A2B3C4D-20261119102000",
  "sessionId": "ARIF-SESS-…",
  "status": "PAID",
  "amount": 480.00,
  "currency": "ETB",
  "signature": "hex-hmac-sha256",
  "rawPayload": "{…exact bytes that were signed…}"
}
```

### 9.3 Response envelope

Single object:

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "errorCode": null,
  "data": { },
  "timestamp": "2026-11-19T10:20:00.0000000Z"
}
```

Paged:

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "errorCode": null,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "timestamp": "2026-11-19T10:20:00.0000000Z"
}
```

Errors use `success = false` with `errorCode` (`NOT_FOUND`, `CONFLICT`, `FORBIDDEN`,
`VALIDATION_ERROR`, `INTERNAL_SERVER_ERROR`, …) and appropriate HTTP status. Raw exception details
are never returned.

---

## 10. End-to-end scenarios

### Scenario A — normal table service

1. Waiter: `POST /orders` → PENDING/UNPAID.
2. Kitchen: queue shows it; `PATCH .../status {"status":"PREPARING"}` → PREPARING, `PreparingAt` set.
3. Kitchen: `PATCH .../status {"status":"READY"}` → READY, `ReadyAt` set, lines PREPARED.
4. Waiter: `PATCH /orders/{id}/served` → SERVED, `ServedAt` set.
5. Waiter or cashier: `POST /payments/initiate` with CASH / QR / USSD → PAID (cash immediate, digital
   after webhook).
6. Tip row created if a tip was given.

### Scenario B — kitchen cancels before cooking

1. Order PENDING/PREPARING, **no payment exists**.
2. Kitchen: `POST /kitchen/orders/{id}/cancel`.
3. Order CANCELLEDBYKITCHEN; lines CANCELLED; cancellation row written.
4. **Nothing financial happens** — no refund, no reversal, no cash movement.
5. If the customer still wants the food, the waiter calls `POST /orders/{id}/reorder`. A new unpaid
   order is linked to the cancellation; recovery rate is recorded.

### Scenario C — single line unavailable

1. Kitchen cancels one line (`orderItemId` set).
2. That line's price **and its snapshotted tax** are removed from the bill.
3. Remaining lines continue cooking.
4. If all lines are eventually cancelled, the order itself becomes CANCELLEDBYKITCHEN.

### Scenario D — customer returns served food

1. Order SERVED and PAID.
2. `POST /payments/{paymentId}/refund`.
3. Payment and order become REFUNDED; an unsettled tip is removed.
4. Sales reports stop counting the payment (they sum `PAID` only).

### Scenario E — payment applied to the wrong order

1. Order A SERVED and PAID.
2. `POST /payments/{A-paymentId}/transfer {"targetOrderId": B}`.
3. A's payment is retired as TRANSFERRED; A becomes TRANSFERRED; B receives a PAID payment and
   becomes PAID; the tip moves to B's waiter.

### Scenario F — digital payment session expires

1. Payment INITIATED, order PAYMENTINITIATED.
2. Either the customer retries: a new initiate retracts the old session, or
3. Cashier calls `retract` → payment RETRACTED, order RETRACTED, and payment can be taken again.

---

## 11. Financial and reporting rules

Endpoints: `GET /api/v1/reports/{sales-summary|waiterperformance|cancellations|kitchenturnaround}`
all require `reports.view`.

### 11.1 Sales summary

Filters orders and paid payments by `CreatedAt` within the requested range.

- `grossSales` = Σ `TotalAmount` of `PAID` payments (includes tax and tips).
- `tipsCollected` = Σ tips of those payments.
- `taxCollected` = Σ `TaxTotal` of orders whose `PaymentStatus = PAID`.
- `netRevenue` = `grossSales - taxCollected - tipsCollected` (food revenue excluding tax and tips).
- `totalOrders` = orders created in range.
- `completedOrders` = those orders with `PaymentStatus = PAID`.
- `cancelledOrders` = those orders with `OrderStatus = CANCELLEDBYKITCHEN`.
- `phonePushVolume`, `qrScanVolume`, `cashVolume` = paid payment counts by method.

### 11.2 Waiter performance

- Groups orders created in range by `WaiterId`.
- `totalRevenue` = Σ `GrandTotal` of that waiter's orders with `PaymentStatus = PAID`
  (**includes tips**).
- `totalTips` = Σ tip ledger rows for that waiter created in range.
- `cancelledOrders` = that waiter's cancelled orders.
- Ordered by revenue descending.

### 11.3 Cancellation report

- Grouped by reason code.
- `lostRevenue` for a line cancellation = `UnitPrice × Quantity × (1 + TaxRate/100)`.
- `lostRevenue` for a full cancellation = the order's `GrandTotal`.
- `reordersCreated` = cancellations with a `ReplacementOrderId`.
- `recoveryRatePercentage` = cancellations with replacement ÷ total cancellations.

### 11.4 Kitchen turnaround

- Only `SERVED` orders with `ServedAt`.
- `avgPrepMinutes` = average of `ReadyAt - PreparingAt`.
- `avgPickupMinutes` = average of `ServedAt - ReadyAt`.
- Orders missing the newer timestamps are counted in `totalOrdersAnalyzed` but excluded from the
  averages; averages are `0` when no data exists.

### 11.5 Revenue recognition invariants

- A payment is counted **once**: `PAID` only. Retracted, transferred (source), failed and refunded
  records are excluded.
- Transfers copy the original `CreatedAt`, so revenue stays in the original period.
- Refunds remove the payment from revenue.
- Tips are recognised when the payment settles and removed if refunded before payout.

---

## 12. Transactions, concurrency, security

- **Transactions**: reorder (create + lineage + cancellation link) and transfer (source retire +
  target settlement + tip move) run in explicit DB transactions.
- **Webhook idempotency**: already-settled, retracted, failed and transferred payments return without
  changes; a retracted/failed session can never settle later.
- **Concurrency**: there are no row-version/concurrency tokens. Two simultaneous cash submissions or
  refund/transfer calls can both pass their status checks. See gap G4.
- **Secrets/config**:
  - `Jwt:Key`, `Jwt:Issuer`, `Jwt:Audience`, `Jwt:ExpiryMinutes`, `Jwt:RefreshTokenExpiryDays`
  - `Arifpay:WebhookSecret` — when empty, signature verification is skipped and a warning is logged
  - `ConnectionStrings:DefaultConnection`
  - `Cors:AllowedOrigins`
- **Seeded owner**: username `joseph`, phone `0920496730`; the initial password is set only when the
  account is created, never reset on restart.
- **Migrations** (applied automatically on startup via `MigrateAsync`):
  1. `InitialCreate`
  2. `AddRefreshTokens`
  3. `AddDynamicRolesAndPermissions`
  4. `AddOrderKitchenTimestamps`
  5. `AddCashPaymentsAndItemTax`
  6. `AddPaymentTransferTracking`
  7. `AddUsernameLogin` — adds the unique `Username` login identifier and makes `Phone` optional

---

## 13. Known gaps and logical flaws

These are real behaviours (or missing behaviours) worth deciding on. Ordered by severity.

### High

**G1. The payment gateway is simulated.**
`InitiatePaymentAsync` generates `ARIF-SESS-…`, `TX-…`, and the QR URL locally. No call is made to
ArifPay, no phone-push/USSD message is sent, and the QR points at a fabricated checkout URL. A real
integration must create the session and send the push. Until then, only cash is truly settled end to
end, and digital payments must be settled by manually posting a webhook.

**G2. Refunds and transfers never call the gateway.**
`RefundPaymentAsync` and `TransferPaymentAsync` only change database state. QR/phone-push money is not
actually returned or moved; that remains a manual gateway operation. Cash refunds also leave no
cash-drawer record.

**G3. Paid READY orders are a dead end.**
Payment is allowed at `READY`, but:
- kitchen cannot cancel `READY`,
- refund requires `SERVED`.
So if a customer pays at READY and leaves before being served, there is no void/refund path. Decide
one of: allow refunds at READY, or allow payment only at SERVED.

**G4. No concurrency control on money operations.**
No row version / optimistic concurrency. Duplicate cash submissions, double refunds, or double
transfers can race past their status checks. A unique constraint on “one PAID payment per order” plus
a `rowversion` would close this.

**G5. Webhook authentication is optional.**
If `Arifpay:WebhookSecret` is empty, anyone who knows a `txRef`/`sessionId` can settle a payment.
Signature checking also assumes HMAC-SHA256 over `rawPayload` (a client-supplied field), and there is
no timestamp/nonce replay protection or rate limiting.

### Medium

**G6. No audit actor on refunds/transfers.**
`Payment` records `InitiatedById`, `UpdatedAt`, and the transfer link, but not who refunded or who
transferred, or when (beyond `UpdatedAt`). Financial corrections cannot be attributed.

**G7. Tip payout is incomplete.**
`PayoutStatus.PaidOut` and `PaidOutAt` are never set, and there is no payout endpoint, so the ledger
can only ever be `UNSETTLED`. Refunds delete unsettled tips; paid-out tips block transfers.

**G8. `PaymentStatus.RefundPending` is dead.**
Nothing writes it now: refunds go straight to `REFUNDED`, and kitchen cancellations no longer touch
payment state.

**G9. No split billing or partial payments.**
One active payment per order; transfers require an exact amount match. Two customers cannot split a
bill, and a partial cash payment is impossible.

**G10. No table or shift model.**
`TableNumber` is free text. There is no table occupancy, no waiter-to-table assignment, and no
cash-drawer/shift session despite cash being tracked.

**G11. Cancellation report can understate a fully cancelled, partially reduced order.**
If lines are cancelled first, `GrandTotal` shrinks; a later full cancellation records the reduced
`GrandTotal` as lost revenue, losing the original value. The original total is not snapshotted on the
cancellation row.

**G12. Waiter performance double counts tips.**
`totalRevenue` sums order `GrandTotal` (tips included) and `totalTips` is also returned; a dashboard
adding them double counts.

**G13. Tax in sales summary comes from orders, not payments.**
`taxCollected` is derived from paid orders while gross sales come from payments. If an order ever has
multiple payment records (transfer chains, retries), tax could drift from gross/net.

**G14. No return/void record.**
A refunded order stays `SERVED`; there is no `RETURNED` status and no reason/notes for the return.

**G15. Waiter ownership uses the JWT role claim.**
Scoping checks the token's role (`CurrentUserService.Role`) rather than the live DB role. Permission
checks are DB-live, so access is still gated, but a stale role can affect scoping until the token
expires. A demoted user might pass an ownership check during the token lifetime (though permissions
would usually block the action).

**G16. `sortBy` is ignored.**
Orders and kitchen lists accept `sortBy` but always sort by `CreatedAt`.

**G17. Reorder accepts arbitrary items.**
A replacement can contain anything; nothing verifies it matches the cancelled ticket. Repeated
reorders can also create long chains without limit.

**G18. Kitchen queue hides READY tickets.**
Expected for prep, but there is no waiter-facing “ready for pickup” feed; waiters must poll orders.

**G19. No manager override for READY/SERVED.**
The only post-service correction is refund/transfer; there is no privileged cancel or re-open.

**G20. No notifications.**
`DeviceToken` is stored on refresh tokens, but no push/SMS is sent on ready, cancel, or payment.

**G21. No idempotency keys or rate limiting.**
Payment initiation, refund, and transfer accept repeated identical requests; login/PIN/webhook are
not rate limited.

### Low

**G22. `PaymentStatusResponse` is minimal.**
It omits method, order number, tendered/change, and transfer links; clients must fetch the order.

**G23. `OrderResponse` omits `PreparingAt`/`ReadyAt`.**
Kitchen timing is only visible in reports.

**G24. Currency is implicit.**
All amounts are treated as ETB; there is no currency field or rounding policy beyond 2 decimals.

**G25. Enum string casing.**
Order/payment statuses are returned upper-cased (`PAYMENTINITIATED`, `CANCELLEDBYKITCHEN`,
`PENDING`), while request filters parse case-insensitively. Clients must follow the upper-case
convention for display.

**G26. Role seeding does not add newly introduced permissions to existing non-empty roles.**
After deploying a new permission, roles that already have permissions need it granted through the
roles API (the Owner role is synced automatically).

---

## 14. Local run and test notes

```bash
# from the repository root
dotnet run --project Api/Api/RestaurantManagement.Api.csproj

# Swagger (Development): http://localhost:5012/swagger
# HTTP profile:            http://localhost:5012
```

- Seed owner: username `joseph` (password is set when the account is first created).
- Create staff via `POST /api/v1/users` (Owner/Manager) with a username, then log in with username +
  password/PIN. Phone is an optional contact field, not a login identifier.
- Menu must be populated before orders can be created.
- For digital payments, post the webhook yourself with `status: "PAID"` and the matching amount.
- Cash payments need no webhook.
- Apply migrations by restarting the API; `SeedOwnerAsync` runs `MigrateAsync` on startup.

A quick manual test path:

1. Login as Owner → create a Kitchen user (PIN) and a Waiter user (PIN), plus a Cashier if you want
   to test refund/transfer (those need `payments.retract`).
2. As Owner or Manager: create a menu category and menu items (`menu.categories.manage` /
   `menu.items.manage`).
3. As Waiter: create an order.
4. As Kitchen: PREPARING → READY (or straight to READY).
5. As Waiter: mark the order served.
6. As Waiter: `POST /payments/initiate` with `method: "CASH"` and `amountTendered` greater than the
   total → check `changeGiven`.
7. As Cashier/Manager: refund that payment, or create a second READY/SERVED order with the same total
   and transfer the payment to it.
8. As Kitchen: create and cancel a PENDING order, then reorder it as the Waiter and verify no payment
   or refund was created.
