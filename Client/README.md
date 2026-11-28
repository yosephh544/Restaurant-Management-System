# RestoPro — Angular client

Restaurant management UI for the Restaurant Management System API. Angular 20, standalone
components, signals, lazy routes, no UI framework — the RestoPro design system lives in
`src/styles.css`.

## Run

```bash
cd Client
npm install
npm start        # http://localhost:4200
npm run build    # production build in dist/
npm run build:prod # explicit production build
```

## Demo accounts

The client ships with an in-memory demo dataset (staff, menu, orders, payments, issues, tips) so
every screen and flow works without the API running. Pick an account on the sign-in page, or use:

| Role | Name | Username | Password | PIN |
|---|---|---|---|---|
| Owner | Alex Bekele | `alex` | `demo1234` | — |
| Manager | Sara Ahmed | `sara` | `demo1234` | — |
| Cashier | Hana Girma | `hana` | `demo1234` | — |
| Waiter | Yoseph Tesfaye | `yoseph` | `demo1234` | `1234` |
| Waiter | Selam Bekele | `selam` | `demo1234` | `1234` |
| Kitchen | Dawit Alemu | `dawit` | `demo1234` | `1234` |

Usernames are case-insensitive. Waiters and kitchen staff can switch the login form to **Device
PIN** and still enter their username. Deactivated accounts cannot sign in. Owner-only screens are
hidden from other roles and guarded at the route level. Phone numbers are optional contact details
and are never used to sign in.

## Routes

| Role | Routes |
|---|---|
| Public | `/login`, `/forgot-password`, `/reset-password` |
| Waiter | `/waiter/new`, `/waiter/orders`, `/waiter/orders/:id`, `/waiter/issues` |
| Kitchen | `/kitchen`, `/kitchen/:id` |
| Cashier | `/cashier/bills`, `/cashier/bills/:id`, `/cashier/bills/:id/receipt`, `/cashier/payments` |
| Manager | `/manager`, `/manager/reports`, `/manager/staff`, `/manager/issues`, `/manager/audit`, `/manager/menu` |
| Owner | Manager routes plus `/admin/users`, `/admin/settings` |

`/` redirects to the signed-in role's workspace. Unknown URLs fall back there.

## What each workspace does

- **Waiter** — compose an order by table and category, add line notes, send it to the kitchen, track
  active tickets, add items, mark served, take payment (cash / QR / phone), and reorder tickets the
  kitchen cancelled. Kitchen issues on their own tickets appear in `/waiter/issues`.
- **Kitchen** — oldest-first ticket board with live timers, accept → mark ready, an "at the pass"
  strip, full ticket view, and an issue dialog that removes a line or the whole ticket and notifies
  the floor. Prices are deliberately hidden.
- **Cashier** — open bills with outstanding totals, printable receipts, tip entry, cash tendered /
  change, QR and phone payment requests with a pending state, refunds for served returns, and
  transfers of a settled payment to a matching bill.
- **Manager** — live sales/floor dashboard, sales chart, reports (sales, waiters, cancellations,
  kitchen timing) with CSV export, staff status and tip payouts, issue management, and the audit log.
- **Owner** — everything above plus user/role administration, menu and availability management, and
  restaurant/billing/payment settings. Settings includes a demo-data reset.

## Data layer

`src/app/core/store.ts` is the single state container: signals for users, menu, orders, payments,
issues, audit and settings, plus every action (create order, advance kitchen, cancel/reorder, pay,
refund, transfer, pay tips, edit menu, manage users, resolve issues). It is seeded by
`src/app/core/seed.ts` and mirrors the API's order/payment rules, including:

- payment only at READY or SERVED,
- no payment exists before READY, so kitchen cancellation never refunds,
- refund only for served orders,
- transfer requires a served source, an unpaid target and an exact total match,
- a payment is recognised once (PAID only), and tips are tracked per waiter.

To connect the real API, replace the store actions with `HttpClient` calls to
`/api/v1/orders`, `/api/v1/kitchen`, `/api/v1/payments` and `/api/v1/reports`; the UI's request and
response shapes were modelled on `docs/ORDER_AND_PAYMENT.md`. Auth currently validates against demo
users instead of `POST /api/v1/auth/login`, and the QR/phone gateway is simulated (a "Customer
confirmed" button settles it).

## Notes

- The UI shows a 5% service charge (configurable in Settings). The current API has no service-charge
  field, so align this before wiring the backend.
- Receipts use the browser print dialog and hide the app shell when printing.
- "Reset demo data" in Settings restores the seeded dataset without reloading the page.
