import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import {
  AuditEvent,
  Bill,
  BillItem,
  BillStatus,
  CancellationReport,
  DEFAULT_SETTINGS,
  Issue,
  IssueReason,
  ItemStatus,
  KitchenTicket,
  KitchenTurnaround,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  OrderStatus,
  PayMethod,
  PayState,
  Payment,
  PaymentStatus,
  PaymentStatusInfo,
  Reports,
  roleFrom,
  SalesSummary,
  Settings,
  StaffUser,
  Table,
  TipEntry,
  WaiterPerformance,
} from './models';
import { SessionService } from './session.service';

export type Result<T = void> = { ok: true; data: T } | { ok: false, error: string };

export interface DraftLine {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface BillRequest {
  tableId: string;
  tipAmount?: number;
  discountAmount?: number;
}

export interface PaymentRequest {
  billId: string;
  method: PayMethod;
  tipAmount: number;
  customerPhone?: string;
  amountTendered?: number;
}

export interface MenuItemInput {
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  taxRate: number;
  available: boolean;
}

export interface UserInput {
  id?: string;
  fullName: string;
  username: string;
  phone?: string;
  role: string;
  pin?: string;
  password?: string;
}

interface UserDto {
  id: string;
  fullName: string;
  username: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface OrderItemDto {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  customerNotes?: string | null;
  itemStatus: ItemStatus;
}

interface OrderDto {
  id: string;
  orderNumber: string;
  tableNumber: string;
  waiterId: string;
  waiterName: string;
  parentOrderId?: string | null;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  taxTotal: number;
  tipAmount: number;
  grandTotal: number;
  pricesIncludeTax: boolean;
  customerNotes?: string | null;
  createdAt: string;
  preparingAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  items: OrderItemDto[];
}

interface BillItemDto {
  id: string;
  orderId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

interface BillDto {
  id: string;
  diningSessionId: string;
  tableId: string;
  tableNumber: string;
  billNumber: string;
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  tipAmount: number;
  grandTotal: number;
  status: BillStatus;
  createdAt: string;
  paidAt?: string | null;
  items: BillItemDto[];
}

interface PaymentDto {
  id: string;
  billId?: string | null;
  orderId: string;
  orderNumber: string;
  billNumber?: string | null;
  waiterId?: string | null;
  waiterName?: string | null;
  method: PayMethod;
  baseAmount: number;
  tipAmount: number;
  totalAmount: number;
  status: PayState;
  amountTendered?: number | null;
  changeGiven?: number | null;
  customerPhone?: string | null;
  createdAt: string;
  settledAt?: string | null;
  actor: string;
  tipPaidOut: boolean;
  qrData?: string | null;
}

interface PaymentStatusDto {
  paymentId: string;
  orderId: string;
  status: string;
  isSettled: boolean;
  totalAmount: number;
  settledAt?: string | null;
}

interface TipDto {
  tipId: string;
  waiterId: string;
  waiterName: string;
  orderId: string;
  orderNumber: string;
  tipAmount: number;
  payoutStatus: string;
  createdAt: string;
  paidOutAt?: string | null;
}

interface MenuItemDto {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description?: string | null;
  unitPrice: number;
  taxRate: number;
  isAvailable: boolean;
  imageUrl?: string | null;
}

interface MenuCategoryDto {
  id: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  items: MenuItemDto[];
}

interface TableDto {
  id: string;
  number: string;
  name?: string | null;
  capacity: number;
  status: string;
  isActive: boolean;
}

interface KitchenItemDto {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  customerNotes?: string | null;
  itemStatus: ItemStatus;
}

interface KitchenTicketDto {
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  waiterName: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  elapsedMinutes: number;
  items: KitchenItemDto[];
}

interface IssueDto {
  id: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  item: string;
  reason: string;
  note?: string | null;
  createdAt: string;
  isResolved: boolean;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  replacementOrderId?: string | null;
}

interface AuditDto {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  detail: string;
  kind: string;
}

interface SettingsDto {
  restaurant: string;
  branch: string;
  phone?: string | null;
  address?: string | null;
  taxRate: number;
  pricesIncludeTax: boolean;
  serviceCharge: number;
  tipPresets: number[];
  cash: boolean;
  qr: boolean;
  phonePay: boolean;
  webhookSecret?: string | null;
}

@Injectable({ providedIn: 'root' })
export class Store {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly tables = signal<Table[]>([]);
  readonly menuCategories = signal<MenuCategory[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly kitchenTickets = signal<KitchenTicket[]>([]);
  readonly bills = signal<Bill[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly tips = signal<TipEntry[]>([]);
  readonly issues = signal<Issue[]>([]);
  readonly audit = signal<AuditEvent[]>([]);
  readonly users = signal<StaffUser[]>([]);
  readonly reports = signal<Reports>({
    summary: null,
    waiters: [],
    cancellations: null,
    turnaround: null,
  });
  readonly loaded = signal(false);
  readonly refreshing = signal(false);

  readonly menu = computed<MenuItem[]>(() => this.menuCategories().flatMap((c) => c.items));

  readonly kitchenQueue = computed(() =>
    this.kitchenTickets().filter((t) => t.status === 'PENDING' || t.status === 'PREPARING'),
  );

  readonly readyOrders = computed(() => this.orders().filter((o) => o.status === 'READY'));

  readonly openBills = computed(() => this.bills().filter((b) => b.status === 'REQUESTED' || b.status === 'PAYMENTINITIATED'));

  readonly openIssues = computed(() => this.issues().filter((i) => !i.resolved));

  readonly unreadIssues = computed(() => this.openIssues().length);

  readonly metrics = computed(() => {
    const summary = this.reports().summary;
    return {
      orders: summary?.totalOrders ?? this.orders().length,
      gross: summary?.grossSales ?? 0,
      collected: summary?.netRevenue ?? 0,
      tips: summary?.tipsCollected ?? 0,
      tax: summary?.taxCollected ?? 0,
      cancelled: summary?.cancelledOrders ?? 0,
      outstanding: this.openBills().reduce((sum, b) => sum + b.total, 0),
      activeIssues: this.openIssues().length,
      activeTickets: this.orders().filter((o) => o.status !== 'SERVED' && o.status !== 'CANCELLEDBYKITCHEN').length,
      avgPrep: this.reports().turnaround?.avgPrepMinutes ?? 0,
    };
  });

  /* ------------------------------------------------------------------ */
  /* Loaders                                                             */
  /* ------------------------------------------------------------------ */

  async refreshAll(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    const jobs: Promise<unknown>[] = [this.loadSettings()];
    if (this.can('tables.view')) jobs.push(this.loadTables());
    if (this.can('menu.view')) jobs.push(this.loadMenu());
    if (this.can('orders.view')) jobs.push(this.loadOrders(), this.loadIssues());
    if (this.can('kitchen.view')) jobs.push(this.loadKitchen());
    if (this.can('payments.view')) jobs.push(this.loadBills(), this.loadPayments());
    if (this.can('tips.view')) jobs.push(this.loadTips());
    if (this.can('reports.view')) jobs.push(this.loadAudit());
    if (this.can('users.view')) jobs.push(this.loadUsers());
    await Promise.allSettled(jobs);
    this.loaded.set(true);
    this.refreshing.set(false);
  }

  async loadSettings(): Promise<void> {
    await this.guard(async () => {
      const dto = await this.api.get<SettingsDto>('/settings');
      this.settings.set({
        restaurant: dto.restaurant,
        branch: dto.branch,
        phone: dto.phone ?? '',
        address: dto.address ?? '',
        taxRate: dto.taxRate,
        pricesIncludeTax: dto.pricesIncludeTax,
        serviceCharge: dto.serviceCharge,
        tipPresets: dto.tipPresets ?? [],
        cash: dto.cash,
        qr: dto.qr,
        phonePay: dto.phonePay,
        webhookSecret: dto.webhookSecret ?? '',
      });
    });
  }

  async loadTables(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.get<TableDto[]>('/tables');
      this.tables.set(
        data.map((t) => ({
          id: t.id,
          number: t.number,
          name: t.name ?? undefined,
          capacity: t.capacity,
          status: (t.status ?? '').toUpperCase(),
          active: t.isActive,
        })),
      );
    });
  }

  async loadMenu(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.get<MenuCategoryDto[]>('/menu/categories');
      this.menuCategories.set(
        data.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? undefined,
          displayOrder: c.displayOrder,
          active: c.isActive,
          items: c.items.map((i) => this.mapMenuItem(i)),
        })),
      );
    });
  }

  async loadOrders(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<OrderDto>('/orders');
      this.orders.set(data.map((o) => this.mapOrder(o)));
    });
  }

  async loadKitchen(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<KitchenTicketDto>('/kitchen/queue');
      this.kitchenTickets.set(
        data
          .map((t) => ({
            id: t.orderId,
            number: t.orderNumber,
            table: t.tableNumber,
            waiterName: t.waiterName,
            status: t.orderStatus,
            paymentStatus: t.paymentStatus,
            createdAt: t.createdAt,
            elapsedMinutes: t.elapsedMinutes,
            items: t.items.map((i) => ({
              id: i.id,
              menuItemId: i.menuItemId,
              name: i.menuItemName,
              qty: i.quantity,
              notes: i.customerNotes ?? undefined,
              status: i.itemStatus,
            })),
          }))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      );
    });
  }

  async loadBills(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.get<BillDto[]>('/bills/active');
      this.bills.set(data.map((b) => this.mapBill(b)));
    });
  }

  async loadBill(billId: string): Promise<Bill | null> {
    const result = await this.guard(async () => {
      const bill = this.mapBill(await this.api.get<BillDto>(`/bills/${billId}`));
      this.upsertBill(bill);
      return bill;
    });
    return result.ok ? result.data : null;
  }

  async loadPayments(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<PaymentDto>('/payments');
      this.payments.set(data.map((p) => this.mapPayment(p)));
    });
  }

  async loadTips(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<TipDto>('/payments/tips');
      this.tips.set(
        data.map((t) => ({
          id: t.tipId,
          waiterId: t.waiterId,
          waiterName: t.waiterName,
          orderId: t.orderId,
          orderNumber: t.orderNumber,
          amount: t.tipAmount,
          payoutStatus: t.payoutStatus,
          createdAt: t.createdAt,
          paidOutAt: t.paidOutAt ?? undefined,
        })),
      );
    });
  }

  async loadIssues(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<IssueDto>('/issues');
      this.issues.set(
        data
          .map((i) => ({
            id: i.id,
            orderId: i.orderId,
            orderNumber: i.orderNumber,
            table: i.tableNumber,
            item: i.item,
            reason: i.reason,
            note: i.note ?? undefined,
            createdAt: i.createdAt,
            resolved: i.isResolved,
            resolvedBy: i.resolvedBy ?? undefined,
            resolvedAt: i.resolvedAt ?? undefined,
            replacementOrderId: i.replacementOrderId ?? undefined,
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      );
    });
  }

  async loadAudit(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<AuditDto>('/audit');
      this.audit.set(
        data.map((e) => ({
          id: e.id,
          at: e.at,
          actor: e.actor,
          role: e.role,
          action: e.action,
          detail: e.detail,
          kind: e.kind.toLowerCase(),
        })),
      );
    });
  }

  async loadUsers(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<UserDto>('/users');
      this.users.set(data.map((u) => this.mapUser(u)));
    });
  }

  async loadReports(from: Date, to: Date): Promise<void> {
    const params = { from: from.toISOString(), to: to.toISOString() };
    const [summary, waiters, cancellations, turnaround] = await Promise.allSettled([
      this.api.get<SalesSummary>('/reports/sales-summary', params),
      this.api.get<{ waiters: WaiterPerformance[] }>('/reports/waiterperformance', params),
      this.api.get<CancellationReport>('/reports/cancellations', params),
      this.api.get<KitchenTurnaround>('/reports/kitchenturnaround', params),
    ]);
    this.reports.set({
      summary: summary.status === 'fulfilled' ? summary.value : null,
      waiters: waiters.status === 'fulfilled' ? waiters.value.waiters : [],
      cancellations: cancellations.status === 'fulfilled' ? cancellations.value : null,
      turnaround: turnaround.status === 'fulfilled' ? turnaround.value : null,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lookups                                                             */
  /* ------------------------------------------------------------------ */

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  order(id: string): Order | undefined {
    return this.orders().find((o) => o.id === id);
  }

  bill(id: string): Bill | undefined {
    return this.bills().find((b) => b.id === id);
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

  tableByNumber(number: string): Table | undefined {
    return this.tables().find((t) => t.number === number);
  }

  activeBillForTable(tableId: string): Bill | undefined {
    return this.openBills().find((b) => b.tableId === tableId);
  }

  paymentsForBill(billId: string): Payment[] {
    return this.payments().filter((p) => p.billId === billId);
  }

  pendingPaymentForBill(billId: string): Payment | undefined {
    return this.payments().find((p) => p.billId === billId && p.status === 'INITIATED');
  }

  paidPaymentForBill(billId: string): Payment | undefined {
    return this.payments().find((p) => p.billId === billId && p.status === 'PAID');
  }

  orderForBill(bill: Bill | null | undefined): Order | undefined {
    return bill?.items[0] ? this.order(bill.items[0].orderId) : undefined;
  }

  ordersForWaiter(waiterId: string, scope: 'active' | 'all' = 'active'): Order[] {
    const list = this.orders().filter((o) => o.waiterId === waiterId);
    if (scope === 'all') return list;
    return list.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY');
  }

  tipsFor(waiterId: string): TipEntry[] {
    return this.tips().filter((t) => t.waiterId === waiterId && t.payoutStatus === 'UNSETTLED');
  }

  /* ------------------------------------------------------------------ */
  /* Orders                                                              */
  /* ------------------------------------------------------------------ */

  async createOrder(tableNumber: string, items: DraftLine[], notes = ''): Promise<Result<Order>> {
    return await this.guard(async () => {
      const created = await this.api.post<OrderDto>('/orders', {
        tableNumber,
        items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, customerNotes: i.notes })),
        customerNotes: notes || null,
      });
      const order = this.mapOrder(created);
      this.orders.update((list) => [order, ...list]);
      return order;
    });
  }

  async addItems(orderId: string, items: DraftLine[]): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/orders/${orderId}/items`, {
        items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, customerNotes: i.notes })),
      });
      await this.loadOrders();
    });
  }

  async serveOrder(orderId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/orders/${orderId}/served`);
      await this.loadOrders();
    });
  }

  async reorder(orderId: string, items: DraftLine[]): Promise<Result<Order>> {
    const original = this.order(orderId);
    if (!original) return { ok: false, error: 'Order not found' };
    return await this.guard(async () => {
      const created = await this.api.post<OrderDto>(`/orders/${orderId}/reorder`, {
        parentOrderId: orderId,
        tableNumber: original.table,
        items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, customerNotes: i.notes })),
        customerNotes: original.notes ?? null,
      });
      const order = this.mapOrder(created);
      this.orders.update((list) => [order, ...list]);
      await this.loadIssues();
      return order;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Kitchen                                                             */
  /* ------------------------------------------------------------------ */

  async kitchenStatus(orderId: string, status: 'PREPARING' | 'READY'): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/kitchen/orders/${orderId}/status`, { status });
      await Promise.all([this.loadKitchen(), this.loadOrders()]);
    });
  }

  async cancelKitchen(
    orderId: string,
    reason: IssueReason,
    note: string,
    orderItemId?: string,
  ): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/kitchen/orders/${orderId}/cancel`, {
        reasonCode: reason,
        reasonNote: note || null,
        orderItemId: orderItemId ?? null,
      });
      await Promise.all([this.loadKitchen(), this.loadOrders(), this.loadIssues()]);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bills                                                               */
  /* ------------------------------------------------------------------ */

  async generateBill(request: BillRequest): Promise<Result<Bill>> {
    return await this.guard(async () => {
      const bill = this.mapBill(
        await this.api.post<BillDto>('/bills/generate', {
          tableId: request.tableId,
          tipAmount: request.tipAmount ?? 0,
          discountAmount: request.discountAmount ?? 0,
        }),
      );
      this.upsertBill(bill);
      await this.loadOrders();
      return bill;
    });
  }

  async reopenBill(billId: string): Promise<Result<Bill>> {
    return await this.guard(async () => {
      const bill = this.mapBill(await this.api.post<BillDto>(`/bills/${billId}/reopen`));
      this.upsertBill(bill);
      await this.loadOrders();
      return bill;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Payments                                                            */
  /* ------------------------------------------------------------------ */

  async initiatePayment(request: PaymentRequest): Promise<Result<Payment>> {
    return await this.guard(async () => {
      const dto = await this.api.post<PaymentDto>('/payments/initiate', {
        billId: request.billId,
        method: request.method,
        tipAmount: request.tipAmount,
        customerPhone: request.customerPhone || null,
        amountTendered: request.amountTendered ?? null,
      });
      const payment = this.mapPayment(dto);
      this.payments.update((list) => [payment, ...list]);
      await this.reloadBilling();
      return payment;
    });
  }

  async paymentStatus(paymentId: string): Promise<PaymentStatusInfo | null> {
    const result = await this.guard(async () => {
      const dto = await this.api.get<PaymentStatusDto>(`/payments/${paymentId}/status`);
      const info: PaymentStatusInfo = {
        paymentId: dto.paymentId,
        orderId: dto.orderId,
        status: dto.status,
        settled: dto.isSettled,
        total: dto.totalAmount,
        settledAt: dto.settledAt ?? undefined,
      };
      if (info.settled) await this.reloadBilling();
      return info;
    });
    return result.ok ? result.data : null;
  }

  async retractPayment(paymentId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/payments/${paymentId}/retract`);
      await Promise.all([this.loadPayments(), this.loadBills(), this.loadOrders()]);
    });
  }

  async refundPayment(paymentId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/payments/${paymentId}/refund`);
      await this.reloadBilling();
    });
  }

  async transferPayment(paymentId: string, targetOrderId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/payments/${paymentId}/transfer`, { targetOrderId });
      await this.reloadBilling();
    });
  }

  async payoutTips(waiterId: string): Promise<Result<number>> {
    return await this.guard(async () => {
      const response = await this.api.post<{ count: number }>('/payments/tips/payout', { waiterId });
      await Promise.all([this.loadTips(), this.loadPayments()]);
      return response.count;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Issues                                                              */
  /* ------------------------------------------------------------------ */

  async resolveIssue(issueId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/issues/${issueId}/resolve`);
      await this.loadIssues();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Menu                                                                */
  /* ------------------------------------------------------------------ */

  async saveMenuItem(input: MenuItemInput): Promise<Result<MenuItem>> {
    return await this.guard(async () => {
      const body = {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description || null,
        unitPrice: input.price,
        taxRate: input.taxRate,
        isAvailable: input.available,
      };
      const dto = input.id
        ? await this.api.patch<MenuItemDto>(`/menu/items/${input.id}`, body)
        : await this.api.post<MenuItemDto>('/menu/items', body);
      await this.loadMenu();
      return this.mapMenuItem(dto);
    });
  }

  async uploadMenuItemImage(itemId: string, file: File): Promise<Result> {
    return await this.guard(async () => {
      await this.api.upload<MenuItemDto>(`/menu/items/${itemId}/image`, file);
      await this.loadMenu();
    });
  }

  async removeMenuItemImage(itemId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.delete<MenuItemDto>(`/menu/items/${itemId}/image`);
      await this.loadMenu();
    });
  }

  async createCategory(name: string, description = ''): Promise<Result> {
    return await this.guard(async () => {
      const nextOrder = this.menuCategories().reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
      await this.api.post('/menu/categories', { name, description: description || null, displayOrder: nextOrder });
      await this.loadMenu();
    });
  }

  async setAvailability(itemId: string, available: boolean): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/menu/items/${itemId}/availability`, { isAvailable: available });
      await this.loadMenu();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tables, users, settings                                             */
  /* ------------------------------------------------------------------ */

  async createTable(number: string, name: string, capacity: number): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post('/tables', { number, name: name || null, capacity });
      await this.loadTables();
    });
  }

  async saveUser(input: UserInput): Promise<Result> {
    return await this.guard(async () => {
      if (input.id) {
        await this.api.patch(`/users/${input.id}`, {
          fullName: input.fullName,
          username: input.username,
          phone: input.phone ?? '',
          role: input.role,
          pin: input.pin || undefined,
          password: input.password || undefined,
        });
      } else {
        await this.api.post('/users', {
          fullName: input.fullName,
          username: input.username,
          phone: input.phone || null,
          role: input.role,
          pin: input.pin || null,
          password: input.password || null,
        });
      }
      await this.loadUsers();
    });
  }

  async toggleUserActive(userId: string, active: boolean): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/users/${userId}/status`, { isActive: active });
      await this.loadUsers();
    });
  }

  async saveSettings(settings: Settings): Promise<Result> {
    return await this.guard(async () => {
      const saved = await this.api.put<SettingsDto>('/settings', {
        restaurant: settings.restaurant,
        branch: settings.branch,
        phone: settings.phone || null,
        address: settings.address || null,
        taxRate: settings.taxRate,
        pricesIncludeTax: settings.pricesIncludeTax,
        serviceCharge: settings.serviceCharge,
        tipPresets: settings.tipPresets,
        cash: settings.cash,
        qr: settings.qr,
        phonePay: settings.phonePay,
        webhookSecret: settings.webhookSecret || null,
      });
      this.settings.set({
        restaurant: saved.restaurant,
        branch: saved.branch,
        phone: saved.phone ?? '',
        address: saved.address ?? '',
        taxRate: saved.taxRate,
        pricesIncludeTax: saved.pricesIncludeTax,
        serviceCharge: saved.serviceCharge,
        tipPresets: saved.tipPresets ?? [],
        cash: saved.cash,
        qr: saved.qr,
        phonePay: saved.phonePay,
        webhookSecret: saved.webhookSecret ?? '',
      });
    });
  }

  reset(): void {
    this.settings.set(DEFAULT_SETTINGS);
    this.tables.set([]);
    this.menuCategories.set([]);
    this.orders.set([]);
    this.kitchenTickets.set([]);
    this.bills.set([]);
    this.payments.set([]);
    this.tips.set([]);
    this.issues.set([]);
    this.audit.set([]);
    this.users.set([]);
    this.reports.set({ summary: null, waiters: [], cancellations: null, turnaround: null });
    this.loaded.set(false);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private async reloadBilling(): Promise<void> {
    await Promise.all([this.loadPayments(), this.loadBills(), this.loadOrders(), this.loadTips()]);
  }

  private async guard<T>(work: () => Promise<T>): Promise<Result<T>> {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      return { ok: false, error: this.api.message(error) };
    }
  }

  private upsertBill(bill: Bill): void {
    // Closed bills are kept in the list so detail/receipt pages can load them;
    // computed openBills filters by status.
    this.bills.update((list) => {
      const exists = list.some((b) => b.id === bill.id);
      return exists ? list.map((b) => (b.id === bill.id ? bill : b)) : [bill, ...list];
    });
  }

  private mapUser(u: UserDto): StaffUser {
    return {
      id: u.id,
      name: u.fullName,
      username: u.username,
      phone: u.phone ?? undefined,
      role: roleFrom(u.role),
      active: u.isActive,
      createdAt: u.createdAt,
    };
  }

  private mapOrder(o: OrderDto): Order {
    return {
      id: o.id,
      number: o.orderNumber,
      table: o.tableNumber,
      waiterId: o.waiterId,
      waiterName: o.waiterName,
      parentOrderId: o.parentOrderId ?? undefined,
      status: o.orderStatus,
      paymentStatus: o.paymentStatus,
      subtotal: o.subtotal,
      tax: o.taxTotal,
      tip: o.tipAmount,
      total: o.grandTotal,
      pricesIncludeTax: o.pricesIncludeTax,
      notes: o.customerNotes ?? undefined,
      createdAt: o.createdAt,
      preparingAt: o.preparingAt ?? undefined,
      readyAt: o.readyAt ?? undefined,
      servedAt: o.servedAt ?? undefined,
      lines: o.items.map(
        (i): OrderLine => ({
          id: i.id,
          itemId: i.menuItemId,
          name: i.menuItemName,
          qty: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
          notes: i.customerNotes ?? undefined,
          status: i.itemStatus,
          lineTotal: Math.round(i.unitPrice * i.quantity * 100) / 100,
        }),
      ),
    };
  }

  private mapBill(b: BillDto): Bill {
    return {
      id: b.id,
      sessionId: b.diningSessionId,
      tableId: b.tableId,
      table: b.tableNumber,
      number: b.billNumber,
      subtotal: b.subtotal,
      tax: b.taxTotal,
      discount: b.discountAmount,
      tip: b.tipAmount,
      total: b.grandTotal,
      status: b.status,
      createdAt: b.createdAt,
      paidAt: b.paidAt ?? undefined,
      items: b.items.map(
        (i): BillItem => ({
          id: i.id,
          orderId: i.orderId,
          description: i.description,
          qty: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
          lineTotal: i.lineTotal,
        }),
      ),
    };
  }

  private mapPayment(p: PaymentDto): Payment {
    return {
      id: p.id,
      billId: p.billId ?? undefined,
      orderId: p.orderId,
      orderNumber: p.orderNumber,
      billNumber: p.billNumber ?? undefined,
      waiterId: p.waiterId ?? undefined,
      waiterName: p.waiterName ?? undefined,
      method: p.method,
      base: p.baseAmount,
      tip: p.tipAmount,
      total: p.totalAmount,
      status: p.status,
      tendered: p.amountTendered ?? undefined,
      change: p.changeGiven ?? undefined,
      phone: p.customerPhone ?? undefined,
      createdAt: p.createdAt,
      settledAt: p.settledAt ?? undefined,
      actor: p.actor,
      tipPaidOut: p.tipPaidOut,
      qrData: p.qrData ?? undefined,
    };
  }

  private mapMenuItem(i: MenuItemDto): MenuItem {
    return {
      id: i.id,
      categoryId: i.categoryId,
      category: i.categoryName,
      name: i.name,
      description: i.description ?? undefined,
      price: i.unitPrice,
      taxRate: i.taxRate,
      available: i.isAvailable,
      imageUrl: i.imageUrl ?? undefined,
    };
  }
}
