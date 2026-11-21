import { locale, translate } from './i18n';

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'BARTENDER';

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  BARTENDER: 'Bartender',
};

export function roleLabel(role: Role | string): string {
  return translate(ROLE_LABEL[role as Role] ?? role);
}

export function roleFrom(value: string | null | undefined): Role {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized in ROLE_LABEL ? (normalized as Role) : 'WAITER';
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  phone?: string;
  role: Role;
  active: boolean;
  createdAt: string;
  defaultShift?: DefaultShiftSummary | null;
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
  kind: 'OFF' | 'EXTRA';
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


export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLEDBYKITCHEN';
export type PaymentStatus =
  | 'UNPAID'
  | 'PAYMENTINITIATED'
  | 'PAID'
  | 'RETRACTED'
  | 'TRANSFERRED'
  | 'REFUNDPENDING'
  | 'REFUNDED';
export type ItemStatus = 'ACTIVE' | 'PREPARED' | 'CANCELLED' | 'SERVED';

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
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

export type BillStatus = 'DRAFT' | 'REQUESTED' | 'PAYMENTINITIATED' | 'PAID' | 'VOIDED' | 'REFUNDED';

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
  tableId: string;
  table: string;
  number: string;
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  status: BillStatus;
  createdAt: string;
  paidAt?: string;
  items: BillItem[];
}

export type PayMethod = 'CASH' | 'QR_SCAN' | 'PHONE_PUSH' | 'TELEBIRR' | 'CBE';
export type PayState = 'INITIATED' | 'PAID' | 'FAILED' | 'RETRACTED' | 'TRANSFERRED' | 'REFUNDED';
export type VerificationState = 'NOT_REQUIRED' | 'UNVERIFIED' | 'VERIFIED' | 'FAILED';

export const PAY_STATE_LABEL: Record<PayState, string> = {
  INITIATED: 'Initiated',
  PAID: 'Paid',
  FAILED: 'Failed',
  RETRACTED: 'Retracted',
  TRANSFERRED: 'Transferred',
  REFUNDED: 'Refunded',
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  CASH: 'Cash',
  QR_SCAN: 'QR scan',
  PHONE_PUSH: 'Phone push',
  TELEBIRR: 'Telebirr',
  CBE: 'CBE',
};

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  NOT_REQUIRED: 'Not required',
  UNVERIFIED: 'Unverified',
  VERIFIED: 'Verified',
  FAILED: 'Verification failed',
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
  payoutStatus: 'UNSETTLED' | 'PAIDOUT' | string;
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
  status: string;
  active: boolean;
}

export interface KitchenTicketItem {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  notes?: string;
  status: ItemStatus;
}

export interface KitchenTicket {
  id: string;
  number: string;
  table: string;
  waiterName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  elapsedMinutes: number;
  items: KitchenTicketItem[];
}

export type IssueReason = 'OUT_OF_STOCK' | 'EQUIPMENT_ISSUE' | 'PREP_DELAY' | 'OTHER';

export const ISSUE_LABEL: Record<IssueReason, string> = {
  OUT_OF_STOCK: 'Out of stock',
  EQUIPMENT_ISSUE: 'Equipment issue',
  PREP_DELAY: 'Prep delay',
  OTHER: 'Other',
};

export function issueLabel(reason: string): string {
  const normalized = reason === 'EQUIPMENT' ? 'EQUIPMENT_ISSUE' : reason === 'DELAY' ? 'PREP_DELAY' : reason;
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

export const DEFAULT_SETTINGS: Settings = {
  restaurant: 'Majete Corner',
  branch: '',
  phone: '',
  address: '',
  taxRate: 0,
  pricesIncludeTax: false,
  serviceCharge: 0,
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

export interface SalesSummary {
  grossSales: number;
  netRevenue: number;
  taxCollected: number;
  tipsCollected: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  phonePushVolume: number;
  qrScanVolume: number;
  cashVolume: number;
  periodFrom?: string;
  periodTo?: string;
}

export interface WaiterPerformance {
  waiterId: string;
  waiterName: string;
  totalOrders: number;
  totalRevenue: number;
  totalTips: number;
  cancelledOrders: number;
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
    case 'PENDING':
      return 'amber';
    case 'PREPARING':
      return 'orange';
    case 'READY':
      return 'green';
    case 'SERVED':
      return 'blue';
    default:
      return 'grey';
  }
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'PENDING':
      return translate('Pending');
    case 'PREPARING':
      return translate('Preparing');
    case 'READY':
      return translate('Ready');
    case 'SERVED':
      return translate('Served');
    case 'CANCELLEDBYKITCHEN':
      return translate('Cancelled');
    default:
      return status;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'UNPAID':
      return translate('Unpaid');
    case 'PAYMENTINITIATED':
      return translate('Payment pending');
    case 'PAID':
      return translate('Paid');
    case 'RETRACTED':
      return translate('Retracted');
    case 'TRANSFERRED':
      return translate('Transferred');
    case 'REFUNDPENDING':
      return translate('Refund pending');
    case 'REFUNDED':
      return translate('Refunded');
    default:
      return status;
  }
}

export function paymentTone(status: PayState): string {
  switch (status) {
    case 'PAID':
      return 'pill-green';
    case 'INITIATED':
      return 'pill-amber';
    case 'REFUNDED':
    case 'FAILED':
      return 'pill-red';
    case 'TRANSFERRED':
      return 'pill-blue';
    default:
      return 'pill-grey';
  }
}

export function billIsOpen(bill: Bill | undefined | null): boolean {
  return !!bill && (bill.status === 'REQUESTED' || bill.status === 'PAYMENTINITIATED');
}
