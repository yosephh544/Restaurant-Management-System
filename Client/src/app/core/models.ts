export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN';

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
};

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
export type ItemStatus = 'ACTIVE' | 'PREPARED' | 'CANCELLED';

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  notes?: string;
  status: ItemStatus;
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

export type PayMethod = 'CASH' | 'QR_SCAN' | 'PHONE_PUSH';
export type PayState = 'INITIATED' | 'PAID' | 'FAILED' | 'RETRACTED' | 'TRANSFERRED' | 'REFUNDED';

export const METHOD_LABEL: Record<PayMethod, string> = {
  CASH: 'Cash',
  QR_SCAN: 'QR scan',
  PHONE_PUSH: 'Phone push',
};

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
  return ISSUE_LABEL[normalized as IssueReason] ?? reason;
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
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function clock(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      return 'Pending';
    case 'PREPARING':
      return 'Preparing';
    case 'READY':
      return 'Ready';
    case 'SERVED':
      return 'Served';
    case 'CANCELLEDBYKITCHEN':
      return 'Cancelled';
    default:
      return status;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'UNPAID':
      return 'Unpaid';
    case 'PAYMENTINITIATED':
      return 'Payment pending';
    case 'PAID':
      return 'Paid';
    case 'RETRACTED':
      return 'Retracted';
    case 'TRANSFERRED':
      return 'Transferred';
    case 'REFUNDPENDING':
      return 'Refund pending';
    case 'REFUNDED':
      return 'Refunded';
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
