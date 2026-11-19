export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN';

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
};

export type StaffStatus = 'ACTIVE' | 'INACTIVE';

export interface StaffUser {
  id: string;
  name: string;
  /** Login identifier. Case-insensitive, unique. */
  username: string;
  /** Optional contact number; never used to sign in. */
  phone?: string;
  role: Role;
  status: StaffStatus;
  password: string;
  pin?: string;
  startedAt: string;
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type PaymentStatus =
  | 'UNPAID'
  | 'INITIATED'
  | 'PAID'
  | 'RETRACTED'
  | 'TRANSFERRED'
  | 'REFUNDED';
export type ItemStatus = 'ACTIVE' | 'PREPARED' | 'CANCELLED';
export type PayMethod = 'CASH' | 'QR' | 'PHONE';
export type PayState = 'INITIATED' | 'PAID' | 'RETRACTED' | 'TRANSFERRED' | 'REFUNDED';

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
  emoji: string;
  description: string;
  available: boolean;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  emoji: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  notes: string;
  status: ItemStatus;
}

export interface Order {
  id: string;
  number: string;
  table: string;
  waiterId: string;
  waiterName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  lines: OrderLine[];
  notes: string;
  tip: number;
  createdAt: string;
  preparingAt?: string;
  readyAt?: string;
  servedAt?: string;
  parentNumber?: string;
  cancelReason?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  waiterId: string;
  waiterName: string;
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
  tipPaidOut: boolean;
  actor: string;
}

export type IssueReason = 'OUT_OF_STOCK' | 'EQUIPMENT' | 'DELAY' | 'OTHER';

export const ISSUE_LABEL: Record<IssueReason, string> = {
  OUT_OF_STOCK: 'Out of stock',
  EQUIPMENT: 'Equipment issue',
  DELAY: 'Prep delay',
  OTHER: 'Other',
};

export interface Issue {
  id: string;
  orderId: string;
  orderNumber: string;
  table: string;
  item: string;
  reason: IssueReason;
  note: string;
  createdAt: string;
  status: 'OPEN' | 'RESOLVED';
  resolvedBy?: string;
}

export type AuditKind = 'order' | 'payment' | 'cancel' | 'refund' | 'transfer' | 'staff' | 'menu';

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  role: Role;
  action: string;
  detail: string;
  kind: AuditKind;
}

export interface Settings {
  restaurant: string;
  branch: string;
  phone: string;
  address: string;
  taxRate: number;
  serviceCharge: number;
  tipPresets: number[];
  cash: boolean;
  qr: boolean;
  phonePay: boolean;
  webhookSecret: string;
}

export interface Bill {
  subtotal: number;
  tax: number;
  service: number;
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function bill(lines: OrderLine[], serviceRate = 5): Bill {
  const live = lines.filter((l) => l.status !== 'CANCELLED');
  const subtotal = r2(live.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const tax = r2(live.reduce((s, l) => s + (l.qty * l.unitPrice * l.taxRate) / 100, 0));
  const service = r2((subtotal * serviceRate) / 100);
  return { subtotal, tax, service, total: r2(subtotal + tax + service) };
}

export function orderTotal(order: Order, serviceRate = 5): number {
  return r2(bill(order.lines, serviceRate).total + order.tip);
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
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
