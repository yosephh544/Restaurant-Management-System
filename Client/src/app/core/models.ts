import { locale, translate } from './i18n';
import {
  BillStatus,
  IssueReason,
  ItemStatus,
  OrderStatus,
  OrderType,
  PayMethod,
  PayState,
  PaymentStatus,
  PayoutStatus,
  Role,
  ShiftExceptionKind,
  Station,
  TableStatus,
  VerificationState,
} from './enums';

export * from './enums';

export const ROLE_LABEL: Record<Role, string> = {
  [Role.SuperAdmin]: 'Super Admin',
  [Role.Owner]: 'Owner',
  [Role.Manager]: 'Manager',
  [Role.Cashier]: 'Cashier',
  [Role.Waiter]: 'Waiter',
  [Role.Kitchen]: 'Kitchen',
  [Role.Bartender]: 'Bartender',
};

export function roleLabel(role: Role | string): string {
  return translate(ROLE_LABEL[role as Role] ?? role);
}

export function roleFrom(value: string | null | undefined): Role {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized in ROLE_LABEL ? (normalized as Role) : Role.Waiter;
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  phone?: string;
  role: Role;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
  defaultShifts: DefaultShiftSummary[];
}

export interface DefaultShiftSummary {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
}

export interface ShiftDefinition {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  isActive: boolean;
  crossesMidnight: boolean;
}

export interface ShiftStaff {
  userId: string;
  fullName: string;
  username: string;
  role: Role;
  isExtra: boolean;
  canSignInNow: boolean;
}

export interface ShiftColumn {
  shiftId: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  staff: ShiftStaff[];
}

export interface ShiftException {
  id: string;
  userId: string;
  fullName: string;
  shiftId: string;
  shiftName: string;
  kind: ShiftExceptionKind;
  note?: string;
}

export interface ShiftDay {
  date: string;
  shifts: ShiftColumn[];
  exceptions: ShiftException[];
}

export interface MyShiftWindow {
  shiftId: string;
  name: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  isExtra: boolean;
  startsAt: string;
  endsAt: string;
}

export interface MyShift {
  shiftRequired: boolean;
  unrestricted: boolean;
  canSignInNow: boolean;
  shifts: MyShiftWindow[];
  message?: string;
}

export function minutesLabel(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const at = new Date(2000, 0, 1, Math.floor(normalized / 60), normalized % 60);
  return at.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
}

export function shiftRange(startMinutes: number, endMinutes: number): string {
  return `${minutesLabel(startMinutes)} – ${minutesLabel(endMinutes)}`;
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function shiftDayLabel(key: string): string {
  return dateFromKey(key).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}


export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  nameAm?: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  notes?: string;
  status: ItemStatus;
  servedAt?: string;
  lineTotal: number;
}

export interface Order {
  id: string;
  number: string;
  table: string;
  orderType: OrderType;
  takeawayFee: number;
  queuePosition: number;
  waiterId: string;
  waiterName: string;
  parentOrderId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  pricesIncludeTax: boolean;
  notes?: string;
  createdAt: string;
  preparingAt?: string;
  readyAt?: string;
  servedAt?: string;
  lines: OrderLine[];
}

export interface DiningSession {
  id: string;
  tableId: string;
  table: string;
  status: string;
  openedAt: string;
  billRequestedAt?: string;
  closedAt?: string;
}

export interface BillItem {
  id: string;
  orderId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface Bill {
  id: string;
  sessionId: string;
  tableId?: string;
  table: string;
  orderType: OrderType;
  number: string;
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  pricesIncludeTax: boolean;
  status: BillStatus;
  createdAt: string;
  paidAt?: string;
  items: BillItem[];
}

export const PAY_STATE_LABEL: Record<PayState, string> = {
  [PayState.Initiated]: 'Initiated',
  [PayState.Paid]: 'Paid',
  [PayState.Failed]: 'Failed',
  [PayState.Retracted]: 'Retracted',
  [PayState.Transferred]: 'Transferred',
  [PayState.Refunded]: 'Refunded',
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  [PayMethod.Cash]: 'Cash',
  [PayMethod.QrScan]: 'QR scan',
  [PayMethod.PhonePush]: 'Phone push',
  [PayMethod.Telebirr]: 'Telebirr',
  [PayMethod.Cbe]: 'CBE',
};

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  [VerificationState.NotRequired]: 'Not required',
  [VerificationState.Unverified]: 'Unverified',
  [VerificationState.Verified]: 'Verified',
  [VerificationState.Failed]: 'Verification failed',
};

export function payStateLabel(status: PayState): string {
  return translate(PAY_STATE_LABEL[status] ?? status);
}

export function methodLabel(method: string): string {
  return translate(METHOD_LABEL[method as PayMethod] ?? method);
}

export function verificationLabel(status: VerificationState | string): string {
  return translate(VERIFICATION_LABEL[status as VerificationState] ?? status);
}

export interface Payment {
  id: string;
  billId?: string;
  orderId: string;
  orderNumber: string;
  billNumber?: string;
  waiterId?: string;
  waiterName?: string;
  method: PayMethod;
  base: number;
  tip: number;
  total: number;
  status: PayState;
  tendered?: number;
  change?: number;
  phone?: string;
  createdAt: string;
  settledAt?: string;
  actor: string;
  tipPaidOut: boolean;
  qrData?: string;
  receiptUrl?: string;
  receiptReference?: string;
  amountPaid?: number;
  orderStatus?: OrderStatus;
  orderPaymentStatus?: PaymentStatus;
  verification: VerificationState;
  verifiedAmount?: number;
  verifiedPayer?: string;
  verifiedBank?: string;
  verifiedAt?: string;
  verifiedVia?: string;
  verificationNote?: string;
}

export interface PaymentStatusInfo {
  paymentId: string;
  orderId: string;
  status: string;
  settled: boolean;
  total: number;
  settledAt?: string;
}

export interface TipEntry {
  id: string;
  waiterId?: string;
  waiterName?: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  payoutStatus: PayoutStatus;
  createdAt: string;
  paidOutAt?: string;
}

/** Mirrors RestaurantManagement.Infrustructure.Enums.Menu.MenuCategoryType. */
export enum MenuCategoryType {
  Food = 1,
  Beverage = 2,
  Extra = 3,
}

export const MENU_CATEGORY_TYPE_LABEL: Record<MenuCategoryType, string> = {
  [MenuCategoryType.Food]: 'Food',
  [MenuCategoryType.Beverage]: 'Beverage',
  [MenuCategoryType.Extra]: 'Extra',
};

/** Mirrors RestaurantManagement.Infrustructure.Enums.Menu.MenuItemFastingType. */
export enum MenuItemFastingType {
  NotApplicable = 0,
  Fasting = 1,
  NonFasting = 2,
}

export const FASTING_TYPE_LABEL: Record<MenuItemFastingType, string> = {
  [MenuItemFastingType.NotApplicable]: 'Not applicable',
  [MenuItemFastingType.Fasting]: 'Fasting',
  [MenuItemFastingType.NonFasting]: 'Non-fasting',
};

/** Mirrors RestaurantManagement.Infrustructure.Enums.Menu.MenuItemAlcoholType. */
export enum MenuItemAlcoholType {
  NotApplicable = 0,
  NonAlcoholic = 1,
  Alcoholic = 2,
}

export const ALCOHOL_TYPE_LABEL: Record<MenuItemAlcoholType, string> = {
  [MenuItemAlcoholType.NotApplicable]: 'Not applicable',
  [MenuItemAlcoholType.NonAlcoholic]: 'Non-alcoholic',
  [MenuItemAlcoholType.Alcoholic]: 'Alcoholic',
};

export interface MenuItem {
  id: string;
  categoryId: string;
  category: string;
  name: string;
  nameAm?: string;
  description?: string;
  price: number;
  taxRate: number;
  available: boolean;
  imageUrl?: string;
  fastingType: MenuItemFastingType;
  alcoholType: MenuItemAlcoholType;
  displayOrder: number;
  featured: boolean;
  preparationTimeMinutes?: number;
  sku?: string;
}

export interface MenuCategory {
  id: string;
  parentCategoryId?: string;
  parentCategoryName?: string;
  name: string;
  description?: string;
  type: MenuCategoryType;
  allowsAlcoholClassification: boolean;
  displayOrder: number;
  active: boolean;
  items: MenuItem[];
}

export interface Table {
  id: string;
  number: string;
  name?: string;
  capacity: number;
  status: TableStatus;
  active: boolean;
}

export interface KitchenTicketItem {
  id: string;
  menuItemId: string;
  name: string;
  nameAm?: string;
  qty: number;
  notes?: string;
  status: ItemStatus;
}

export interface KitchenTicket {
  id: string;
  number: string;
  table: string;
  orderType: OrderType;
  queuePosition: number;
  waiterName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  elapsedMinutes: number;
  items: KitchenTicketItem[];
}

export const ISSUE_LABEL: Record<IssueReason, string> = {
  [IssueReason.OutOfStock]: 'Out of stock',
  [IssueReason.EquipmentIssue]: 'Equipment issue',
  [IssueReason.PrepDelay]: 'Prep delay',
  [IssueReason.Other]: 'Other',
};

export function issueLabel(reason: string): string {
  const normalized =
    reason === 'EQUIPMENT' ? IssueReason.EquipmentIssue : reason === 'DELAY' ? IssueReason.PrepDelay : reason;
  return translate(ISSUE_LABEL[normalized as IssueReason] ?? reason);
}

export interface Issue {
  id: string;
  orderId: string;
  orderNumber: string;
  table: string;
  item: string;
  reason: IssueReason | string;
  note?: string;
  createdAt: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  replacementOrderId?: string;
}

export type AuditKind = 'order' | 'payment' | 'cancel' | 'refund' | 'transfer' | 'staff' | 'menu';

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  detail: string;
  kind: string;
}

export interface Settings {
  restaurant: string;
  branch: string;
  phone: string;
  address: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  serviceCharge: number;
  takeawayFee: number;
  tipPresets: number[];
  cash: boolean;
  qr: boolean;
  phonePay: boolean;
  webhookSecret: string;
  telebirr: string;
  cbe: string;
  accountName: string;
  paymentQr: string;
}

export interface BankReachabilityItem {
  bank: string;
  url: string;
  reachable: boolean;
  resolvedAddresses: string[];
  tlsProtocol?: string | null;
  certificateValid?: boolean | null;
  certificateSubject?: string | null;
  certificateIssuer?: string | null;
  certificateExpires?: string | null;
  httpStatus?: number | null;
  elapsedMs: number;
  bodyBytes: number;
  contentType?: string | null;
  server?: string | null;
  rateLimitRemaining?: string | null;
  rateLimitLimit?: string | null;
  looksLikeReceiptPage?: boolean | null;
  error?: string | null;
}

export interface BankReachabilityResponse {
  checkedAt: string;
  reference: string;
  banks: BankReachabilityItem[];
}

export const DEFAULT_SETTINGS: Settings = {
  restaurant: 'Majete Corner',
  branch: '',
  phone: '',
  address: '',
  taxRate: 0,
  pricesIncludeTax: false,
  serviceCharge: 0,
  takeawayFee: 0,
  tipPresets: [],
  cash: true,
  qr: true,
  phonePay: true,
  webhookSecret: '',
  telebirr: '',
  cbe: '',
  accountName: '',
  paymentQr: '',
};

export interface FinancialDailyPoint {
  date: string;
  orders: number;
  expected: number;
  collected: number;
  refunds: number;
  tips: number;
}

export interface SalesSummary {
  grossSales: number;
  tipsCollected: number;
  expectedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  refundedAmount: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  paidOrders: number;
  unpaidOrders: number;
  pendingPaymentOrders: number;
  refundPendingOrders: number;
  refundedOrders: number;
  transferredOrders: number;
  phonePushAmount: number;
  qrScanAmount: number;
  cashAmount: number;
  telebirrAmount: number;
  cbeAmount: number;
  phonePushVolume: number;
  qrScanVolume: number;
  cashVolume: number;
  telebirrVolume: number;
  cbeVolume: number;
  daily: FinancialDailyPoint[];
  periodFrom?: string;
  periodTo?: string;
}

export interface WaiterPerformance {
  waiterId: string;
  waiterName: string;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  expectedRevenue: number;
  totalTips: number;
  unsettledTips: number;
  cancelledOrders: number;
}

export interface OrderReportItem {
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  orderType: OrderType;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  waiterId: string;
  waiterName: string;
  billNumber?: string;
  expectedAmount: number;
  collectedAmount: number;
  tipAmount: number;
  createdAt: string;
  servedAt?: string;
}

export interface OrderReport {
  orders: OrderReportItem[];
  totalOrders: number;
  expectedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  paidOrders: number;
  unpaidOrders: number;
  pendingPaymentOrders: number;
  refundPendingOrders: number;
  refundedOrders: number;
  cancelledOrders: number;
}

export interface WaiterDailyPoint {
  date: string;
  orders: number;
  expected: number;
  collected: number;
  tips: number;
}

export interface WaiterReport {
  waiterId: string;
  waiterName: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  expectedAmount: number;
  collectedAmount: number;
  tipsCollected: number;
  tipsUnsettled: number;
  tipsPaidOut: number;
  daily: WaiterDailyPoint[];
}

export interface StationDailyPoint {
  date: string;
  orders: number;
  items: number;
  ready: number;
}

export interface StationReport {
  station: Station;
  totalOrders: number;
  totalItems: number;
  itemsReady: number;
  itemsServed: number;
  itemsInProgress: number;
  avgPrepMinutes: number;
  avgPickupMinutes: number;
  daily: StationDailyPoint[];
}

export interface CancellationItem {
  reasonCode: string;
  count: number;
  lostRevenue: number;
  reordersCreated: number;
}

export interface CancellationReport {
  byReasonCode: CancellationItem[];
  totalCancellations: number;
  totalLostRevenue: number;
  recoveryRatePercentage: number;
}

export interface KitchenTurnaround {
  avgPrepMinutes: number;
  avgPickupMinutes: number;
  totalOrdersAnalyzed: number;
}

export interface Reports {
  summary: SalesSummary | null;
  waiters: WaiterPerformance[];
  cancellations: CancellationReport | null;
  turnaround: KitchenTurnaround | null;
  orders: OrderReport | null;
  kitchenStation: StationReport | null;
  barStation: StationReport | null;
}

export function money(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function ageLabel(iso: string): string {
  const m = minutesSince(iso);
  if (m < 1) return translate('just now');
  if (m < 60) return `${m} ${translate('min')}`;
  const h = Math.floor(m / 60);
  return `${h} ${translate('hr')} ${m % 60} ${translate('min')}`;
}

export function clock(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
}

export function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function statusTone(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.Pending:
      return 'amber';
    case OrderStatus.Preparing:
      return 'orange';
    case OrderStatus.Ready:
      return 'green';
    case OrderStatus.Served:
      return 'blue';
    default:
      return 'grey';
  }
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.Pending:
      return translate('Pending');
    case OrderStatus.Preparing:
      return translate('Preparing');
    case OrderStatus.Ready:
      return translate('Ready');
    case OrderStatus.Served:
      return translate('Served');
    case OrderStatus.CancelledByKitchen:
      return translate('Cancelled');
    default:
      return status;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.Unpaid:
      return translate('Unpaid');
    case PaymentStatus.PaymentInitiated:
      return translate('Payment pending');
    case PaymentStatus.Paid:
      return translate('Paid');
    case PaymentStatus.Retracted:
      return translate('Retracted');
    case PaymentStatus.Transferred:
      return translate('Transferred');
    case PaymentStatus.RefundPending:
      return translate('Refund pending');
    case PaymentStatus.Refunded:
      return translate('Refunded');
    default:
      return status;
  }
}

export function paymentTone(status: PayState): string {
  switch (status) {
    case PayState.Paid:
      return 'pill-green';
    case PayState.Initiated:
      return 'pill-amber';
    case PayState.Refunded:
    case PayState.Failed:
      return 'pill-red';
    case PayState.Transferred:
      return 'pill-blue';
    default:
      return 'pill-grey';
  }
}

export function billIsOpen(bill: Bill | undefined | null): boolean {
  return !!bill && (bill.status === BillStatus.Requested || bill.status === BillStatus.PaymentInitiated);
}

export function isTakeaway(order: Order | KitchenTicket | Bill | null | undefined): boolean {
  return order?.orderType === OrderType.Takeaway;
}

export function isTakeout(order: Order | KitchenTicket | Bill | null | undefined): boolean {
  return order?.orderType === OrderType.Takeout;
}

export function hasNoTable(order: Order | KitchenTicket | Bill | null | undefined): boolean {
  return !!order && order.orderType !== OrderType.DineIn;
}

export function orderTypeLabel(order: Order | KitchenTicket | Bill | null | undefined): string {
  return isTakeout(order) ? 'Takeout' : isTakeaway(order) ? 'Takeaway' : 'Dine-in';
}
