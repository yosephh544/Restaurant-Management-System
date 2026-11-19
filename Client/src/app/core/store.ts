import { computed, Injectable, signal } from '@angular/core';
import {
  AuditEvent,
  AuditKind,
  Bill,
  bill,
  dayKey,
  Issue,
  ISSUE_LABEL,
  IssueReason,
  MenuItem,
  money,
  Order,
  OrderLine,
  orderTotal,
  PayMethod,
  Payment,
  Role,
  Settings,
  shortDate,
  StaffUser,
} from './models';
import { createSeed, SeedData } from './seed';

export interface DraftLine {
  menuItemId: string;
  qty: number;
  notes: string;
}

const byNewest = <T extends { createdAt: string }>(a: T, b: T) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const byNewestEvent = (a: AuditEvent, b: AuditEvent) =>
  new Date(b.at).getTime() - new Date(a.at).getTime();

@Injectable({ providedIn: 'root' })
export class Store {
  private seed: SeedData = createSeed();

  readonly users = signal<StaffUser[]>(this.seed.users);
  readonly menu = signal<MenuItem[]>(this.seed.menu);
  readonly orders = signal<Order[]>(this.seed.orders.slice().sort(byNewest));
  readonly payments = signal<Payment[]>(this.seed.payments.slice().sort(byNewest));
  readonly issues = signal<Issue[]>(this.seed.issues.slice().sort(byNewest));
  readonly audit = signal<AuditEvent[]>(this.seed.audit.slice().sort(byNewestEvent));
  readonly settings = signal<Settings>(this.seed.settings);
  readonly actor = signal<StaffUser | null>(null);

  private seq = this.seed.nextNumber;

  /* ------------------------------------------------------------------ */
  /* Derived state                                                       */
  /* ------------------------------------------------------------------ */

  readonly kitchenQueue = computed(() =>
    this.orders()
      .filter((o) => o.status === 'PENDING' || o.status === 'PREPARING')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  );

  readonly readyOrders = computed(() =>
    this.orders()
      .filter((o) => o.status === 'READY')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  );

  readonly openBills = computed(() =>
    this.orders()
      .filter(
        (o) =>
          (o.status === 'READY' || o.status === 'SERVED') &&
          (o.paymentStatus === 'UNPAID' || o.paymentStatus === 'INITIATED' || o.paymentStatus === 'RETRACTED'),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  );

  readonly activeOrders = computed(() =>
    this.orders().filter((o) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY'),
  );

  readonly openIssues = computed(() => this.issues().filter((i) => i.status === 'OPEN'));

  readonly unreadIssues = computed(() => this.openIssues().length);

  readonly metrics = computed(() => {
    const today = dayKey(new Date().toISOString());
    const paidToday = this.payments().filter((p) => p.status === 'PAID' && dayKey(p.createdAt) === today);
    const refundedToday = this.payments().filter(
      (p) => p.status === 'REFUNDED' && p.settledAt && dayKey(p.settledAt) === today,
    );
    const ordersToday = this.orders().filter((o) => dayKey(o.createdAt) === today);
    const gross = paidToday.reduce((s, p) => s + p.total, 0);
    const tips = paidToday.reduce((s, p) => s + p.tip, 0);
    const refunds = refundedToday.reduce((s, p) => s + p.total, 0);
    const outstanding = this.openBills().reduce((s, o) => s + orderTotal(o, this.settings().serviceCharge), 0);
    const prepSamples = this.orders().filter((o) => o.preparingAt && o.readyAt);
    const avgPrep =
      prepSamples.length === 0
        ? 0
        : Math.round(
            prepSamples.reduce(
              (s, o) =>
                s + (new Date(o.readyAt as string).getTime() - new Date(o.preparingAt as string).getTime()) / 60000,
              0,
            ) / prepSamples.length,
          );
    return {
      orders: ordersToday.length,
      gross: Math.round(gross * 100) / 100,
      collected: Math.round((gross - refunds) * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      tips: Math.round(tips * 100) / 100,
      avgPrep,
      activeIssues: this.openIssues().length,
    };
  });

  /* ------------------------------------------------------------------ */
  /* Lookups                                                             */
  /* ------------------------------------------------------------------ */

  order(id: string): Order | undefined {
    return this.orders().find((o) => o.id === id);
  }

  orderByNumber(number: string): Order | undefined {
    return this.orders().find((o) => o.number === number);
  }

  payment(id: string): Payment | undefined {
    return this.payments().find((p) => p.id === id);
  }

  menuItem(id: string): MenuItem | undefined {
    return this.menu().find((m) => m.id === id);
  }

  user(id: string): StaffUser | undefined {
    return this.users().find((u) => u.id === id);
  }

  billFor(order: Order): Bill {
    return bill(order.lines, this.settings().serviceCharge);
  }

  totalFor(order: Order): number {
    return orderTotal(order, this.settings().serviceCharge);
  }

  paymentFor(orderId: string): Payment | undefined {
    return this.payments().find(
      (p) =>
        p.orderId === orderId &&
        (p.status === 'PAID' ||
          p.status === 'INITIATED' ||
          p.status === 'REFUNDED' ||
          p.status === 'TRANSFERRED'),
    );
  }

  ordersForWaiter(waiterId: string, scope: 'active' | 'all' = 'active'): Order[] {
    const list = this.orders().filter((o) => o.waiterId === waiterId);
    if (scope === 'all') return list;
    return list.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY');
  }

  tipsFor(waiterId: string): Payment[] {
    return this.payments().filter((p) => p.waiterId === waiterId && p.tip > 0 && p.status === 'PAID');
  }

  tipTotal(waiterId: string): number {
    return this.tipsFor(waiterId).reduce((s, p) => s + p.tip, 0);
  }

  salesSeries(range: 'today' | 'week'): { label: string; value: number }[] {
    const paid = this.payments().filter((p) => p.status === 'PAID');
    if (range === 'week') {
      const out: { label: string; value: number }[] = [];
      for (let d = 6; d >= 0; d -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        const key = dayKey(date.toISOString());
        out.push({
          label: shortDate(date.toISOString()),
          value: Math.round(paid.filter((p) => dayKey(p.createdAt) === key).reduce((s, p) => s + p.total, 0)),
        });
      }
      return out;
    }
    const today = dayKey(new Date().toISOString());
    return Array.from({ length: 14 }, (_, i) => {
      const hour = 9 + i;
      return {
        label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
        value: Math.round(
          paid
            .filter((p) => dayKey(p.createdAt) === today && new Date(p.createdAt).getHours() === hour)
            .reduce((s, p) => s + p.total, 0),
        ),
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Orders                                                              */
  /* ------------------------------------------------------------------ */

  createOrder(table: string, waiterId: string, draft: DraftLine[], notes = ''): Order {
    const waiter = this.user(waiterId);
    if (!waiter) throw new Error('Waiter not found');
    this.seq += 1;
    const lines: OrderLine[] = [];
    draft.forEach((d, i) => {
      const item = this.menuItem(d.menuItemId);
      if (!item) return;
      lines.push({
        id: `l-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        itemId: item.id,
        name: item.name,
        emoji: item.emoji,
        qty: d.qty,
        unitPrice: item.price,
        taxRate: item.taxRate,
        notes: d.notes,
        status: 'ACTIVE',
      });
    });
    const order: Order = {
      id: `o${this.seq}`,
      number: String(this.seq),
      table,
      waiterId,
      waiterName: waiter.name,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      lines,
      notes,
      tip: 0,
      createdAt: new Date().toISOString(),
    };
    this.orders.update((list) => [order, ...list]);
    this.log('Order sent to kitchen', `Order #${order.number} · Table ${order.table}`, 'order');
    return order;
  }

  addLine(orderId: string, menuId: string): void {
    const item = this.menuItem(menuId);
    if (!item) return;
    this.orders.update((list) =>
      list.map((o) => {
        if (o.id !== orderId) return o;
        const existing = o.lines.find((l) => l.itemId === menuId && l.status === 'ACTIVE' && !l.notes);
        if (existing) {
          return {
            ...o,
            lines: o.lines.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + 1 } : l)),
          };
        }
        const line: OrderLine = {
          id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          name: item.name,
          emoji: item.emoji,
          qty: 1,
          unitPrice: item.price,
          taxRate: item.taxRate,
          notes: '',
          status: 'ACTIVE',
        };
        return { ...o, lines: [...o.lines, line] };
      }),
    );
  }

  changeQty(orderId: string, lineId: string, delta: number): void {
    this.orders.update((list) =>
      list.map((o) => {
        if (o.id !== orderId) return o;
        const lines = o.lines
          .map((l) => (l.id === lineId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
          .filter((l) => l.qty > 0);
        return { ...o, lines };
      }),
    );
  }

  removeLine(orderId: string, lineId: string): void {
    this.orders.update((list) =>
      list.map((o) =>
        o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o,
      ),
    );
  }

  setLineNote(orderId: string, lineId: string, notes: string): void {
    this.orders.update((list) =>
      list.map((o) =>
        o.id === orderId
          ? { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, notes } : l)) }
          : o,
      ),
    );
  }

  setOrderNote(orderId: string, notes: string): void {
    this.orders.update((list) => list.map((o) => (o.id === orderId ? { ...o, notes } : o)));
  }

  advance(orderId: string): void {
    const order = this.order(orderId);
    if (!order) return;
    if (order.status === 'PENDING') {
      this.patchOrder(orderId, {
        status: 'PREPARING',
        preparingAt: new Date().toISOString(),
      });
      this.log('Order accepted by kitchen', `Order #${order.number} · Table ${order.table}`, 'order');
    } else if (order.status === 'PREPARING') {
      this.patchOrder(orderId, {
        status: 'READY',
        readyAt: new Date().toISOString(),
        lines: order.lines.map((l) => (l.status === 'ACTIVE' ? { ...l, status: 'PREPARED' } : l)),
      });
      this.log('Order marked ready', `Order #${order.number} · Table ${order.table}`, 'order');
    }
  }

  serve(orderId: string): void {
    const order = this.order(orderId);
    if (!order || order.status !== 'READY') return;
    this.patchOrder(orderId, { status: 'SERVED', servedAt: new Date().toISOString() });
    this.log('Order served', `Order #${order.number} · Table ${order.table}`, 'order');
  }

  cancelLine(orderId: string, lineId: string, reason: IssueReason, note: string): void {
    const order = this.order(orderId);
    if (!order) return;
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return;
    const lines = order.lines.map((l) => (l.id === lineId ? { ...l, status: 'CANCELLED' as const } : l));
    const allCancelled = lines.every((l) => l.status === 'CANCELLED');
    this.patchOrder(orderId, {
      lines,
      status: allCancelled ? 'CANCELLED' : order.status,
      cancelReason: allCancelled ? ISSUE_LABEL[reason] : order.cancelReason,
    });
    this.addIssue(order, line.name, reason, note);
    this.log(
      allCancelled ? 'Order cancelled by kitchen' : 'Item reported unavailable',
      `Order #${order.number} · ${line.name} · ${ISSUE_LABEL[reason]}`,
      'cancel',
    );
  }

  cancelOrder(orderId: string, reason: IssueReason, note: string): void {
    const order = this.order(orderId);
    if (!order) return;
    this.patchOrder(orderId, {
      status: 'CANCELLED',
      cancelReason: ISSUE_LABEL[reason],
      lines: order.lines.map((l) => ({ ...l, status: 'CANCELLED' as const })),
    });
    this.addIssue(order, 'Whole order', reason, note);
    this.log('Order cancelled by kitchen', `Order #${order.number} · ${ISSUE_LABEL[reason]}`, 'cancel');
  }

  reorder(orderId: string): Order | undefined {
    const original = this.order(orderId);
    if (!original || original.status !== 'CANCELLED') return undefined;
    this.seq += 1;
    const replacement: Order = {
      id: `o${this.seq}`,
      number: String(this.seq),
      table: original.table,
      waiterId: original.waiterId,
      waiterName: original.waiterName,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      lines: original.lines.map((l, i) => ({
        ...l,
        id: `l-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        status: 'ACTIVE',
      })),
      notes: original.notes,
      tip: 0,
      createdAt: new Date().toISOString(),
      parentNumber: original.number,
    };
    this.orders.update((list) => [replacement, ...list]);
    this.issues.update((list) =>
      list.map((i) =>
        i.orderId === original.id
          ? { ...i, status: 'RESOLVED', resolvedBy: this.actor()?.name ?? 'Waiter' }
          : i,
      ),
    );
    this.log('Replacement order created', `Order #${replacement.number} replaces #${original.number}`, 'order');
    return replacement;
  }

  resolveIssue(issueId: string): void {
    const issue = this.issues().find((i) => i.id === issueId);
    if (!issue) return;
    this.issues.update((list) =>
      list.map((i) =>
        i.id === issueId ? { ...i, status: 'RESOLVED', resolvedBy: this.actor()?.name ?? 'Manager' } : i,
      ),
    );
    this.log('Issue resolved', `Order #${issue.orderNumber} · ${issue.item}`, 'cancel');
  }

  /* ------------------------------------------------------------------ */
  /* Payments                                                            */
  /* ------------------------------------------------------------------ */

  canPay(order: Order): boolean {
    return (
      (order.status === 'READY' || order.status === 'SERVED') &&
      order.paymentStatus !== 'PAID' &&
      order.paymentStatus !== 'REFUNDED' &&
      order.paymentStatus !== 'TRANSFERRED'
    );
  }

  payCash(orderId: string, tip: number, tendered: number): Payment | null {
    const order = this.order(orderId);
    if (!order || !this.canPay(order)) return null;
    const b = this.billFor(order);
    const total = Math.round((b.total + tip) * 100) / 100;
    if (tendered < total) return null;
    this.retractPending(orderId);
    const now = new Date().toISOString();
    const payment: Payment = {
      id: `p-${Date.now()}`,
      orderId,
      orderNumber: order.number,
      waiterId: order.waiterId,
      waiterName: order.waiterName,
      method: 'CASH',
      base: b.total,
      tip,
      total,
      status: 'PAID',
      tendered,
      change: Math.round((tendered - total) * 100) / 100,
      createdAt: now,
      settledAt: now,
      tipPaidOut: false,
      actor: this.actor()?.name ?? order.waiterName,
    };
    this.payments.update((list) => [payment, ...list]);
    this.patchOrder(orderId, { paymentStatus: 'PAID', tip });
    this.log('Cash payment settled', `Order #${order.number} · ${money(total)} ETB`, 'payment');
    return payment;
  }

  initiatePayment(orderId: string, method: PayMethod, tip: number, phone?: string): Payment | null {
    const order = this.order(orderId);
    if (!order || !this.canPay(order)) return null;
    this.retractPending(orderId);
    const b = this.billFor(order);
    const total = Math.round((b.total + tip) * 100) / 100;
    const payment: Payment = {
      id: `p-${Date.now()}`,
      orderId,
      orderNumber: order.number,
      waiterId: order.waiterId,
      waiterName: order.waiterName,
      method,
      base: b.total,
      tip,
      total,
      status: 'INITIATED',
      phone,
      createdAt: new Date().toISOString(),
      tipPaidOut: false,
      actor: this.actor()?.name ?? order.waiterName,
    };
    this.payments.update((list) => [payment, ...list]);
    this.patchOrder(orderId, { paymentStatus: 'INITIATED', tip });
    this.log(
      `${method === 'QR' ? 'QR' : 'Phone'} payment requested`,
      `Order #${order.number} · ${money(total)} ETB`,
      'payment',
    );
    return payment;
  }

  confirmPayment(paymentId: string): void {
    const payment = this.payment(paymentId);
    if (!payment || payment.status !== 'INITIATED') return;
    const order = this.order(payment.orderId);
    const now = new Date().toISOString();
    this.payments.update((list) =>
      list.map((p) => (p.id === paymentId ? { ...p, status: 'PAID', settledAt: now } : p)),
    );
    if (order) {
      this.patchOrder(order.id, { paymentStatus: 'PAID', tip: payment.tip });
      this.log(
        `${payment.method === 'QR' ? 'QR' : 'Phone'} payment settled`,
        `Order #${order.number} · ${money(payment.total)} ETB`,
        'payment',
      );
    }
  }

  retractPayment(paymentId: string): void {
    const payment = this.payment(paymentId);
    if (!payment || payment.status !== 'INITIATED') return;
    this.payments.update((list) =>
      list.map((p) => (p.id === paymentId ? { ...p, status: 'RETRACTED' } : p)),
    );
    this.patchOrder(payment.orderId, { paymentStatus: 'RETRACTED', tip: 0 });
    this.log('Payment request retracted', `Order #${payment.orderNumber}`, 'payment');
  }

  refundPayment(paymentId: string): string | null {
    const payment = this.payment(paymentId);
    if (!payment) return 'Payment not found';
    if (payment.status !== 'PAID') return 'Only settled payments can be refunded';
    const order = this.order(payment.orderId);
    if (!order) return 'Order not found';
    if (order.status !== 'SERVED') return 'Refunds are only allowed after the order is served';
    this.payments.update((list) =>
      list.map((p) => (p.id === paymentId ? { ...p, status: 'REFUNDED' } : p)),
    );
    this.patchOrder(order.id, { paymentStatus: 'REFUNDED', tip: 0 });
    this.log('Payment refunded', `Order #${order.number} · ${money(payment.total)} ETB`, 'refund');
    return null;
  }

  transferPayment(paymentId: string, targetOrderId: string): string | null {
    const source = this.payment(paymentId);
    if (!source || source.status !== 'PAID') return 'Only settled payments can be transferred';
    const from = this.order(source.orderId);
    const target = this.order(targetOrderId);
    if (!from || !target) return 'Order not found';
    if (from.status !== 'SERVED') return 'Source order must be served first';
    if (source.tipPaidOut) return 'The tip on this payment has already been paid out';
    if (target.status !== 'READY' && target.status !== 'SERVED') return 'Target order is not ready for payment';
    if (target.id === from.id) return 'Choose a different order';
    if (!['UNPAID', 'RETRACTED', 'TRANSFERRED'].includes(target.paymentStatus)) {
      return 'Target order already has payment activity';
    }
    const targetTotal = Math.round((this.billFor(target).total + source.tip) * 100) / 100;
    if (Math.abs(targetTotal - source.total) > 0.01) return 'Target total must match the payment exactly';
    const now = new Date().toISOString();
    this.payments.update((list) =>
      list.map((p) => (p.id === source.id ? { ...p, status: 'TRANSFERRED' } : p)),
    );
    const moved: Payment = {
      ...source,
      id: `p-${Date.now()}`,
      orderId: target.id,
      orderNumber: target.number,
      waiterId: target.waiterId,
      waiterName: target.waiterName,
      status: 'PAID',
      createdAt: source.createdAt,
      settledAt: now,
      actor: this.actor()?.name ?? source.actor,
    };
    this.payments.update((list) => [moved, ...list]);
    this.patchOrder(from.id, { paymentStatus: 'TRANSFERRED', tip: 0 });
    this.patchOrder(target.id, { paymentStatus: 'PAID', tip: source.tip });
    this.log(
      'Payment transferred',
      `#${from.number} → #${target.number} · ${money(source.total)} ETB`,
      'transfer',
    );
    return null;
  }

  markTipsPaid(waiterId: string): void {
    const waiter = this.user(waiterId);
    this.payments.update((list) =>
      list.map((p) =>
        p.waiterId === waiterId && p.status === 'PAID' && p.tip > 0 ? { ...p, tipPaidOut: true } : p,
      ),
    );
    this.log('Tips paid out', `Waiter · ${waiter?.name ?? waiterId}`, 'staff');
  }

  /* ------------------------------------------------------------------ */
  /* Menu, users, settings                                               */
  /* ------------------------------------------------------------------ */

  setAvailability(id: string, available: boolean): void {
    this.menu.update((list) => list.map((m) => (m.id === id ? { ...m, available } : m)));
    const item = this.menuItem(id);
    this.log(
      available ? 'Item marked available' : 'Item marked unavailable',
      item?.name ?? id,
      'menu',
    );
  }

  saveMenuItem(item: MenuItem): void {
    this.menu.update((list) => {
      const exists = list.some((m) => m.id === item.id);
      return exists ? list.map((m) => (m.id === item.id ? { ...item } : m)) : [...list, { ...item }];
    });
    this.log('Menu item saved', item.name, 'menu');
  }

  saveUser(user: StaffUser): void {
    this.users.update((list) => {
      const exists = list.some((u) => u.id === user.id);
      return exists ? list.map((u) => (u.id === user.id ? { ...user } : u)) : [...list, { ...user }];
    });
    this.log('Staff account saved', `${user.name} · ${user.role}`, 'staff');
  }

  toggleUserStatus(id: string): void {
    const user = this.user(id);
    if (!user) return;
    const status = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.users.update((list) => list.map((u) => (u.id === id ? { ...u, status } : u)));
    this.log(status === 'ACTIVE' ? 'Staff reactivated' : 'Staff deactivated', user.name, 'staff');
  }

  resetPin(id: string): void {
    const user = this.user(id);
    if (!user) return;
    this.users.update((list) => list.map((u) => (u.id === id ? { ...u, pin: '1234' } : u)));
    this.log('PIN reset to 1234', user.name, 'staff');
  }

  saveSettings(settings: Settings): void {
    this.settings.set({ ...settings, tipPresets: [...settings.tipPresets] });
    this.log('Restaurant settings updated', settings.restaurant, 'staff');
  }

  resetDemo(): void {
    this.seed = createSeed();
    this.users.set(this.seed.users);
    this.menu.set(this.seed.menu);
    this.orders.set(this.seed.orders.slice().sort(byNewest));
    this.payments.set(this.seed.payments.slice().sort(byNewest));
    this.issues.set(this.seed.issues.slice().sort(byNewest));
    this.audit.set(this.seed.audit.slice().sort(byNewestEvent));
    this.settings.set(this.seed.settings);
    this.seq = this.seed.nextNumber;
  }

  setActor(user: StaffUser | null): void {
    this.actor.set(user);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private patchOrder(orderId: string, patch: Partial<Order>): void {
    this.orders.update((list) => list.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  }

  private retractPending(orderId: string): void {
    this.payments.update((list) =>
      list.map((p) => (p.orderId === orderId && p.status === 'INITIATED' ? { ...p, status: 'RETRACTED' } : p)),
    );
  }

  private addIssue(order: Order, itemName: string, reason: IssueReason, note: string): void {
    const issue: Issue = {
      id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      orderId: order.id,
      orderNumber: order.number,
      table: order.table,
      item: itemName,
      reason,
      note,
      createdAt: new Date().toISOString(),
      status: 'OPEN',
    };
    this.issues.update((list) => [issue, ...list]);
  }

  private log(action: string, detail: string, kind: AuditKind): void {
    const actor = this.actor();
    const event: AuditEvent = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      at: new Date().toISOString(),
      actor: actor?.name ?? 'System',
      role: (actor?.role ?? 'MANAGER') as Role,
      action,
      detail,
      kind,
    };
    this.audit.update((list) => [event, ...list]);
  }
}
