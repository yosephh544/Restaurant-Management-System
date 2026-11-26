/**
 * Wire values mirror RestaurantManagement.Infrustructure.Enums.* as the API
 * serializes them: Enum.ToString().ToUpperInvariant() (e.g. CancelledByKitchen
 * becomes CANCELLEDBYKITCHEN). Keep members in sync with the backend enums.
 */

/** Mirrors RestaurantManagement.Infrustructure.Enums.Identity.UserRole. */
export enum Role {
  SuperAdmin = 'SUPERADMIN',
  Owner = 'OWNER',
  Manager = 'MANAGER',
  Cashier = 'CASHIER',
  Waiter = 'WAITER',
  Kitchen = 'KITCHEN',
  Bartender = 'BARTENDER',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.OrderStatus. */
export enum OrderStatus {
  Pending = 'PENDING',
  Preparing = 'PREPARING',
  Ready = 'READY',
  Served = 'SERVED',
  CancelledByKitchen = 'CANCELLEDBYKITCHEN',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.PaymentStatus. */
export enum PaymentStatus {
  Unpaid = 'UNPAID',
  PaymentInitiated = 'PAYMENTINITIATED',
  Paid = 'PAID',
  Retracted = 'RETRACTED',
  Transferred = 'TRANSFERRED',
  RefundPending = 'REFUNDPENDING',
  Refunded = 'REFUNDED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.OrderItemStatus. */
export enum ItemStatus {
  Active = 'ACTIVE',
  Prepared = 'PREPARED',
  Cancelled = 'CANCELLED',
  Served = 'SERVED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.OrderType. */
export enum OrderType {
  DineIn = 'DINE_IN',
  Takeaway = 'TAKEAWAY',
  Takeout = 'TAKEOUT',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.BillStatus. */
export enum BillStatus {
  Draft = 'DRAFT',
  Requested = 'REQUESTED',
  PaymentInitiated = 'PAYMENTINITIATED',
  Paid = 'PAID',
  Voided = 'VOIDED',
  Refunded = 'REFUNDED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.PaymentMethod. */
export enum PayMethod {
  Cash = 'CASH',
  QrScan = 'QR_SCAN',
  PhonePush = 'PHONE_PUSH',
  Telebirr = 'TELEBIRR',
  Cbe = 'CBE',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.PaymentGatewayStatus. */
export enum PayState {
  Initiated = 'INITIATED',
  Paid = 'PAID',
  Failed = 'FAILED',
  Retracted = 'RETRACTED',
  Transferred = 'TRANSFERRED',
  Refunded = 'REFUNDED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.PaymentVerificationStatus. */
export enum VerificationState {
  NotRequired = 'NOT_REQUIRED',
  Unverified = 'UNVERIFIED',
  Verified = 'VERIFIED',
  Failed = 'FAILED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.PayoutStatus. */
export enum PayoutStatus {
  Unsettled = 'UNSETTLED',
  PaidOut = 'PAIDOUT',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.CancellationReasonCode. */
export enum IssueReason {
  OutOfStock = 'OUT_OF_STOCK',
  EquipmentIssue = 'EQUIPMENT_ISSUE',
  PrepDelay = 'PREP_DELAY',
  Other = 'OTHER',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Orders.PreparationStation. */
export enum Station {
  Kitchen = 'KITCHEN',
  Bar = 'BAR',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Identity.ShiftExceptionKind. */
export enum ShiftExceptionKind {
  Off = 'OFF',
  Extra = 'EXTRA',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Identity.PasswordResetStatus. */
export enum PasswordResetStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Billing.TableStatus (client normalizes to upper case). */
export enum TableStatus {
  Available = 'AVAILABLE',
  Occupied = 'OCCUPIED',
  Reserved = 'RESERVED',
  OutOfService = 'OUTOFSERVICE',
}
