# Direct CBE and Telebirr receipt verification

The mobile payment dialog exposes **Scan receipt QR** without a bank selector.
The app recognizes likely bank formats for feedback and sends the raw payload
with the generated bill ID. The server independently resolves the bank, checks
its own receipt endpoint and settles the generated bill, including all orders
on a combined table bill. Excess principal payment is the collecting waiter's tip.

## API

`POST /api/v1/payments/record` requires normal authentication/payment permission:

```json
{"billId":"<generated bill UUID>","qrData":"<raw scanned QR>"}
```

Exactly one of `qrData`, `receiptUrl`, or `transactionNumber` must be supplied.
The optional legacy `method` must agree with the detected bank. Standalone
opaque current CBE tokens from older clients need `method: "CBE"`; new mobile
manual entry accepts a current receipt link or an older FT reference.
`amountPaid` and `payerName` remain accepted for wire compatibility, but only
the bank's amount and payer information are used for settlement.

Valid digital responses retain the existing payment response and report
`status: "PAID"`, `verificationStatus: "VERIFIED"`, the actual bank reference,
amount, payer, verification source and timestamp. Bad references, recipient
mismatches, incomplete/non-final transfers, insufficient amounts, invalid payment
timestamps and reused
receipts do not settle the bill. Definitive bank-service failures return 503
with `errorCode: "SERVICE_UNAVAILABLE"`. A lost HTTP response is uncertain;
check the current bill/payment before retrying. Same-bill retries return the
existing verified payment when the same receipt can be identified.

## Server configuration

Set the restaurant's receiving CBE account, Telebirr number and account-holder
name through the existing settings endpoint. Full identifiers must match;
masked identifiers need at least four visible suffix digits for both banks,
matching other visible digits and an exact
normalized holder name. Local and country-code phone formats are normalized,
including masked numbers. The hidden digits cannot be verified from a public
receipt; the full receiving number and holder name must be configured independently.
Masked numbers cannot be used as the configured receiving account. A name alone
or a short internal Telebirr gateway account does not identify the restaurant. Telebirr
bank transfers may match their actual receiving bank account to configured CBE.

The old `CheckEt` configuration is removed. CBE app headers have the supplied
defaults; override `BankReceipts:CbeAppId` and `BankReceipts:CbeAppVersion` if
CBE changes its web application. There is no verifier-disable/unverified-payment
fallback. Historic check.et audit records remain readable and unchanged.

Endpoints are fixed: current CBE's JSON API at `mb.cbe.com.et`, legacy CBE's
PDF at `apps.cbe.com.et:100`, and Telebirr HTML at
`transactioninfo.ethiotelecom.et/receipt/{reference}`. Legacy links preserve their
supplied eight-digit account suffix for lookup; CBE accepts either the payer or
receiver suffix. The lookup suffix is not proof of the receiver. Recipient matching uses the receiver account and name
inside the bank's PDF. A bare FT reference tries the configured CBE account's
last eight digits; if that lookup fails, provide the full legacy link or a current
CBE receipt link. Certificate checks remain enabled; outbound bank host/port
allowlists and request/body limits are enforced.

CBE network errors and HTTP 404, 408, 429 or server errors get up to four fetch
attempts, with 500 ms between attempts, within the existing 10-second current
receipt or 30-second legacy receipt deadline. A parsed failed payment, recipient
mismatch or insufficient amount is rejected. Exhausted lookups leave the bill
unpaid and prompt for a full receipt link or another attempt.

Telebirr's receipt host stalls the connection instead of answering when it
throttles a caller, so Telebirr lookups get up to three attempts with 500 ms
between them, each bounded to seven seconds inside the existing 20-second
deadline. Only transport failures, 408/429 and server errors are retried; a
parsed receipt for a different reference, a different recipient or a failed
payment still fails immediately without another request. Each failed attempt is
logged with the bank, host, attempt number, HTTP status, elapsed time and any
`X-RateLimit-*` headers, and an unreadable body is described by structural
markers (empty, reference rejected, no Telebirr markers, unexpected layout)
rather than raw page text, so customer names and phone numbers stay out of logs.

Receipt lookups resolve the two bank hosts through the server's own resolver
first and fall back to DNS-over-HTTPS (`1.1.1.1`, then `8.8.8.8`) when that
resolver cannot answer for a host, which happens on some deployment networks for
the Telebirr host. The verifier connects to the resolved address while keeping
the bank hostname for SNI and certificate validation. Diagnostics report the
resolver used as `dnsSource` (`system` or `dns-over-https`).

`GET /api/v1/diagnostics/banks` (SuperAdmin only) checks the
verification deployment rather than a receipt: it probes both receipt hosts from
the API server itself and returns, per bank, the resolved addresses, negotiated
TLS version, certificate subject/issuer/expiry and chain validity, HTTP status,
response size, `Server`/`Content-Type` and `X-RateLimit-*` headers, and whether
the body still looks like a receipt page. An optional `?reference=` uses a real
transaction reference. It settles nothing and changes no data, but it makes one
request per bank, so it consumes part of Telebirr's small per-IP request budget.

New receipt settlements require a readable bank payment date and time. Dates
are normalized to UTC; Ethiopian receipt times without an explicit timezone
use UTC+03:00. The payment must fall between the earliest saved session/order
start minus two minutes and the verification time plus two minutes. This clock
tolerance accommodates bank clock differences and timestamp precision. Bill
creation time is not the lower bound, and payments across midnight remain valid.
Missing, unreadable, older or future timestamps outside this window return a
conflict without creating a payment, tip or paid bill. Existing settled-payment
retries continue returning the original result without rechecking its age.

No schema migration is required. Conditional bill/order updates inside a SQL
transaction protect settlement across cash, receipt, gateway and transfer
paths. New digital records always carry the bank-returned reference. The
existing unique settled-receipt index protects against concurrent reuse. Historic
records lacking a bank reference can only be compared by their stored receipt
URL; do not assume complete duplicate coverage for those old records.

## Validation and deployment

From the repository root:

```text
dotnet build Api/Api/RestaurantManagement.Api.csproj
dotnet test Api/Tests/RestaurantManagement.Tests.csproj
```

Settlement tests create and delete only uniquely named
`CodexBankReceiptTests_*` SQL Server LocalDB databases; production settings and
connection strings are not used. LocalDB is required for these integration tests.

From `mobileapp`, run Flutter analysis and the backend-compatibility, kitchen
navigation and order-alert tests. Existing authentication fixtures should be
checked independently; their encrypted profile data predates the current API.

Deploy the backend before mobile. From the actual Ethiopian server, confirm DNS,
HTTPS access and valid receipt responses for both banks. Check authorized CBE,
legacy CBE and Telebirr receipts on an Android/iOS device, including denied camera
permission, cancellation, underpayment, duplicate use, offline errors and an
overpayment tip. Local synthetic tests do not establish live-bank availability.
No APK is built as part of routine source validation.
