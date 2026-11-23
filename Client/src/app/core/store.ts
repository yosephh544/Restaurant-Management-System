import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { translate } from './i18n';
import {
  AuditEvent,
  Bill,
  BillItem,
  billIsOpen,
  BillStatus,
  CancellationReport,
  DEFAULT_SETTINGS,
  Issue,
  IssueReason,
  ItemStatus,
  KitchenTicket,
  KitchenTurnaround,
  MenuCategory,
  MenuCategoryType,
  MenuItem,
  MenuItemAlcoholType,
  MenuItemFastingType,
  MyShift,
  Order,
  OrderLine,
  OrderReport,
  OrderStatus,
  OrderType,
  PayMethod,
  PayState,
  Payment,
  PaymentStatus,
  PaymentStatusInfo,
  Reports,
  roleFrom,
  SalesSummary,
  Settings,
  ShiftDay,
  ShiftDefinition,
  StaffUser,
  StationReport,
  Table,
  TipEntry,
  VerificationState,
  WaiterPerformance,
  WaiterReport,
} from './models';
import { SessionService } from './session.service';

export type Result<T = void> = { ok: true; data: T } | { ok: false, error: string };

export interface DraftLine {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface BillRequest {
  tableId?: string;
  orderId?: string;
  discountAmount?: number;
}

export interface PaymentRequest {
  billId: string;
  method: PayMethod;
  customerPhone?: string;
  amountTendered?: number;
  receiptUrl?: string;
  transactionNumber?: string;
  amountPaid?: number;
  payerName?: string;
}

export interface MenuItemInput {
  id?: string;
  categoryId: string;
  name: string;
  nameAm?: string;
  description?: string;
  price: number;
  taxRate: number;
  available: boolean;
  fastingType?: MenuItemFastingType;
  alcoholType?: MenuItemAlcoholType;
  displayOrder?: number;
  featured?: boolean;
  preparationTimeMinutes?: number;
  sku?: string;
}

export interface MenuCategoryInput {
  name: string;
  description?: string;
  parentCategoryId?: string | null;
  type: MenuCategoryType;
  displayOrder?: number;
}

export interface UserInput {
  id?: string;
  fullName: string;
  username: string;
  phone?: string;
  role: string;
  pin?: string;
  password?: string;
  shiftIds?: string[];
}

export interface ShiftInput {
  id?: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  isActive: boolean;
}

interface UserDefaultShiftDto {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
}

interface UserDto {
  id: string;
  fullName: string;
  username: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  defaultShifts?: UserDefaultShiftDto[] | null;
}

interface ShiftDto {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  isActive: boolean;
  crossesMidnight: boolean;
}

interface ShiftDayDto {
  date: string;
  shifts: ShiftDay['shifts'];
  exceptions: ShiftDay['exceptions'];
}

interface MyShiftDto extends MyShift {}

interface OrderItemDto {
  id: string;
  menuItemId: string;
  menuItemName: string;
  menuItemNameAm?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  customerNotes?: string | null;
  itemStatus: ItemStatus;
  servedAt?: string | null;
}

interface OrderDto {
  id: string;
  orderNumber: string;
  tableNumber: string;
  orderType: OrderType;
  takeawayFee: number;
  queuePosition: number;
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
  tableId?: string | null;
  tableNumber: string;
  orderType: OrderType;
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
  orderStatus?: OrderStatus | null;
  orderPaymentStatus?: PaymentStatus | null;
  amountTendered?: number | null;
  changeGiven?: number | null;
  customerPhone?: string | null;
  createdAt: string;
  settledAt?: string | null;
  actor: string;
  tipPaidOut: boolean;
  qrData?: string | null;
  receiptUrl?: string | null;
  receiptReference?: string | null;
  amountPaid?: number | null;
  verificationStatus?: VerificationState | null;
  verifiedAmount?: number | null;
  verifiedPayerName?: string | null;
  verifiedBank?: string | null;
  verifiedAt?: string | null;
  verifiedVia?: string | null;
  verificationNote?: string | null;
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
  nameAm?: string | null;
  description?: string | null;
  unitPrice: number;
  taxRate: number;
  isAvailable: boolean;
  imageUrl?: string | null;
  fastingType: MenuItemFastingType;
  alcoholType: MenuItemAlcoholType;
  displayOrder: number;
  isFeatured: boolean;
  preparationTimeMinutes?: number | null;
  sku?: string | null;
}

interface MenuCategoryDto {
  id: string;
  parentCategoryId?: string | null;
  parentCategoryName?: string | null;
  name: string;
  description?: string | null;
  type: MenuCategoryType;
  allowsAlcoholClassification: boolean;
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
  menuItemNameAm?: string | null;
  quantity: number;
  customerNotes?: string | null;
  itemStatus: ItemStatus;
}

interface KitchenTicketDto {
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  orderType: OrderType;
  queuePosition: number;
  waiterName: string;
  station: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  stationStatus: OrderStatus;
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
  takeawayFee: number;
  tipPresets: number[];
  cash: boolean;
  qr: boolean;
  phonePay: boolean;
  webhookSecret?: string | null;
  telebirr?: string | null;
  cbe?: string | null;
  accountName?: string | null;
  paymentQr?: string | null;
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
  readonly barTickets = signal<KitchenTicket[]>([]);
  readonly bills = signal<Bill[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly tips = signal<TipEntry[]>([]);
  readonly issues = signal<Issue[]>([]);
  readonly audit = signal<AuditEvent[]>([]);
  readonly users = signal<StaffUser[]>([]);
  readonly shifts = signal<ShiftDefinition[]>([]);
  readonly shiftSchedule = signal<ShiftDay[]>([]);
  readonly myShift = signal<MyShift | null>(null);
  readonly reports = signal<Reports>({
    summary: null,
    waiters: [],
    cancellations: null,
    turnaround: null,
    orders: null,
    kitchenStation: null,
    barStation: null,
  });
  readonly myReport = signal<WaiterReport | null>(null);
  readonly stationReport = signal<StationReport | null>(null);
  readonly loaded = signal(false);
  readonly refreshing = signal(false);
  private scheduleRange: { from: string; to: string } | null = null;

  readonly menu = computed<MenuItem[]>(() => this.menuCategories().flatMap((c) => c.items));

  readonly kitchenQueue = computed(() =>
    this.kitchenTickets().filter((t) => t.status === 'PENDING' || t.status === 'PREPARING'),
  );

  readonly barQueue = computed(() =>
    this.barTickets().filter((t) => t.status === 'PENDING' || t.status === 'PREPARING'),
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
      collected: summary?.collectedAmount ?? 0,
      tips: summary?.tipsCollected ?? 0,
      tax: summary?.taxCollected ?? 0,
      cancelled: summary?.cancelledOrders ?? 0,
      outstanding: summary?.outstandingAmount ?? this.openBills().reduce((sum, b) => sum + b.total, 0),
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
    const jobs: Promise<unknown>[] = [this.loadSettings(), this.loadMyShift()];
    if (this.can('tables.view')) jobs.push(this.loadTables());
    if (this.can('menu.view')) jobs.push(this.loadMenu());
    if (this.can('orders.view')) jobs.push(this.loadOrders(), this.loadIssues());
    if (this.can('kitchen.view')) jobs.push(this.loadKitchen());
    if (this.can('bar.view')) jobs.push(this.loadBar());
    if (this.can('payments.view')) jobs.push(this.loadBills(), this.loadPayments());
    if (this.can('tips.view')) jobs.push(this.loadTips());
    if (this.can('reports.view')) jobs.push(this.loadAudit());
    if (this.can('users.view')) jobs.push(this.loadUsers());
    if (this.can('shifts.view')) jobs.push(this.loadShifts());
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
        takeawayFee: dto.takeawayFee ?? 0,
        tipPresets: dto.tipPresets ?? [],
        cash: dto.cash,
        qr: dto.qr,
        phonePay: dto.phonePay,
        webhookSecret: dto.webhookSecret ?? '',
        telebirr: dto.telebirr ?? '',
        cbe: dto.cbe ?? '',
        accountName: dto.accountName ?? '',
        paymentQr: dto.paymentQr ?? '',
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
          parentCategoryId: c.parentCategoryId ?? undefined,
          parentCategoryName: c.parentCategoryName ?? undefined,
          name: c.name,
          description: c.description ?? undefined,
          type: c.type,
          allowsAlcoholClassification: c.allowsAlcoholClassification,
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
      this.kitchenTickets.set(this.mapStationTickets(data));
    });
  }

  async loadBar(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.getAll<KitchenTicketDto>('/bar/queue');
      this.barTickets.set(this.mapStationTickets(data));
    });
  }

  private mapStationTickets(data: KitchenTicketDto[]): KitchenTicket[] {
    return data
      .map((t) => ({
        id: t.orderId,
        number: t.orderNumber,
        table: t.tableNumber,
        orderType: t.orderType ?? 'DINE_IN',
        queuePosition: t.queuePosition ?? 0,
        waiterName: t.waiterName,
        status: t.stationStatus,
        paymentStatus: t.paymentStatus,
        createdAt: t.createdAt,
        elapsedMinutes: t.elapsedMinutes,
        items: t.items.map((i) => ({
          id: i.id,
          menuItemId: i.menuItemId,
          name: i.menuItemName,
          nameAm: i.menuItemNameAm ?? undefined,
          qty: i.quantity,
          notes: i.customerNotes ?? undefined,
          status: i.itemStatus,
        })),
      }))
      .sort((a, b) =>
        a.queuePosition && b.queuePosition
          ? a.queuePosition - b.queuePosition
          : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  }

  async loadBills(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.get<BillDto[]>('/bills/active');
      const active = data.map((b) => this.mapBill(b));
      // Keep closed bills already loaded by detail/receipt pages so a settle does not
      // turn an open bill page into "Bill not found".
      this.bills.update((existing) => {
        const closed = existing.filter((b) => !billIsOpen(b) && !active.some((a) => a.id === b.id));
        return [...active, ...closed];
      });
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

  async loadShifts(): Promise<void> {
    await this.guard(async () => {
      const data = await this.api.get<ShiftDto[]>('/shifts');
      this.shifts.set(
        data.map((s) => ({
          id: s.id,
          name: s.name,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
          isActive: s.isActive,
          crossesMidnight: s.crossesMidnight,
        })),
      );
    });
  }

  async loadShiftSchedule(from: string, to: string): Promise<void> {
    this.scheduleRange = { from, to };
    await this.guard(async () => {
      const data = await this.api.get<ShiftDayDto[]>('/shifts/schedule', { from, to });
      this.shiftSchedule.set(data);
    });
  }

  async loadMyShift(): Promise<void> {
    await this.guard(async () => {
      this.myShift.set(await this.api.get<MyShiftDto>('/shifts/me'));
    });
  }

  async saveShift(input: ShiftInput): Promise<Result> {
    return await this.guard(async () => {
      const body = {
        name: input.name,
        startMinutes: input.startMinutes,
        endMinutes: input.endMinutes,
        isActive: input.isActive,
      };
      if (input.id) await this.api.put(`/shifts/${input.id}`, body);
      else await this.api.post('/shifts', body);
      await this.loadShifts();
      await this.reloadShiftSchedule();
    });
  }

  async deleteShift(shiftId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.delete(`/shifts/${shiftId}`);
      await this.loadShifts();
      await this.reloadShiftSchedule();
    });
  }

  async markShiftOff(date: string, userId: string, shiftId: string, note = ''): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch('/shifts/off', { date, userId, shiftId, note: note || null });
      await this.reloadShiftSchedule();
    });
  }

  async coverShift(
    date: string,
    absentUserId: string,
    coverUserId: string,
    shiftId?: string,
    note = '',
  ): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch('/shifts/cover', {
        date,
        absentUserId,
        coverUserId,
        shiftId: shiftId ?? null,
        note: note || null,
      });
      await this.reloadShiftSchedule();
    });
  }

  async assignShift(date: string, userId: string, shiftId: string, note = ''): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch('/shifts/assign', { date, userId, shiftId, note: note || null });
      await this.reloadShiftSchedule();
    });
  }

  async swapShifts(dates: string[], userAId: string, userBId: string, note = ''): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch('/shifts/swap', { dates, userAId, userBId, note: note || null });
      await this.reloadShiftSchedule();
    });
  }

  async resetShiftDay(date: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch('/shifts/reset', { date });
      await this.reloadShiftSchedule();
    });
  }

  async deleteShiftException(exceptionId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.delete(`/shifts/exceptions/${exceptionId}`);
      await this.reloadShiftSchedule();
    });
  }

  async loadReports(from: Date, to: Date): Promise<void> {
    const params = this.reportParams(from, to);
    const [summary, waiters, cancellations, turnaround, orders, kitchenStation, barStation] =
      await Promise.allSettled([
        this.api.get<SalesSummary>('/reports/sales-summary', params),
        this.api.get<{ waiters: WaiterPerformance[] }>('/reports/waiterperformance', params),
        this.api.get<CancellationReport>('/reports/cancellations', params),
        this.api.get<KitchenTurnaround>('/reports/kitchenturnaround', params),
        this.api.get<OrderReport>('/reports/orders', params),
        this.api.get<StationReport>('/reports/kitchen', params),
        this.api.get<StationReport>('/reports/bar', params),
      ]);
    this.reports.set({
      summary: summary.status === 'fulfilled' ? summary.value : null,
      waiters: waiters.status === 'fulfilled' ? waiters.value.waiters : [],
      cancellations: cancellations.status === 'fulfilled' ? cancellations.value : null,
      turnaround: turnaround.status === 'fulfilled' ? turnaround.value : null,
      orders: orders.status === 'fulfilled' ? orders.value : null,
      kitchenStation: kitchenStation.status === 'fulfilled' ? kitchenStation.value : null,
      barStation: barStation.status === 'fulfilled' ? barStation.value : null,
    });
  }

  async loadMyWaiterReport(from: Date, to: Date): Promise<Result> {
    return this.guard(async () => {
      this.myReport.set(await this.api.get<WaiterReport>('/reports/my-waiter', this.reportParams(from, to)));
    });
  }

  async loadStationReport(station: 'KITCHEN' | 'BAR', from: Date, to: Date): Promise<Result> {
    return this.guard(async () => {
      const path = station === 'BAR' ? '/reports/bar' : '/reports/kitchen';
      this.stationReport.set(await this.api.get<StationReport>(path, this.reportParams(from, to)));
    });
  }

  private reportParams(from: Date, to: Date): Record<string, unknown> {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    };
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

  billForOrder(orderId: string): Bill | undefined {
    return this.openBills().find((b) => b.items.some((i) => i.orderId === orderId));
  }

  async loadActiveBillForOrder(orderId: string): Promise<Bill | null> {
    const result = await this.guard(async () => {
      const dto = await this.api.get<BillDto | null>(`/bills/active/order/${orderId}`);
      if (!dto) return null;
      const bill = this.mapBill(dto);
      this.upsertBill(bill);
      return bill;
    });
    return result.ok ? result.data : null;
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
    return list
      .filter((o) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY')
      .sort((a, b) => (a.queuePosition || 1e9) - (b.queuePosition || 1e9));
  }

  tipsFor(waiterId: string): TipEntry[] {
    return this.tips().filter((t) => t.waiterId === waiterId && t.payoutStatus === 'UNSETTLED');
  }

  /* ------------------------------------------------------------------ */
  /* Orders                                                              */
  /* ------------------------------------------------------------------ */

  async createOrder(
    tableNumber: string | null,
    items: DraftLine[],
    notes = '',
    orderType: OrderType = 'DINE_IN',
  ): Promise<Result<Order>> {
    return await this.guard(async () => {
      const created = await this.api.post<OrderDto>('/orders', {
        tableNumber: orderType === 'TAKEAWAY' ? null : tableNumber,
        orderType,
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
    if (!original) return { ok: false, error: translate('Order not found') };
    return await this.guard(async () => {
      const created = await this.api.post<OrderDto>(`/orders/${orderId}/reorder`, {
        parentOrderId: orderId,
        tableNumber: original.table,
        orderType: original.orderType,
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
  /* Stations (kitchen + bar)                                            */
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

  async barStatus(orderId: string, status: 'PREPARING' | 'READY'): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/bar/orders/${orderId}/status`, { status });
      await Promise.all([this.loadBar(), this.loadOrders()]);
    });
  }

  async readyItem(orderId: string, itemId: string, station: 'KITCHEN' | 'BAR'): Promise<Result> {
    return await this.guard(async () => {
      const base = station === 'BAR' ? '/bar' : '/kitchen';
      await this.api.patch(`${base}/orders/${orderId}/items/${itemId}/status`, { status: 'READY' });
      await Promise.all([station === 'BAR' ? this.loadBar() : this.loadKitchen(), this.loadOrders()]);
    });
  }

  async serveItem(orderId: string, itemId: string): Promise<Result> {
    return await this.guard(async () => {
      await this.api.patch(`/orders/${orderId}/items/${itemId}/served`);
      await this.loadOrders();
    });
  }

  async cancelBar(
    orderId: string,
    reason: IssueReason,
    note: string,
    orderItemId?: string,
  ): Promise<Result> {
    return await this.guard(async () => {
      await this.api.post(`/bar/orders/${orderId}/cancel`, {
        reasonCode: reason,
        reasonNote: note || null,
        orderItemId: orderItemId ?? null,
      });
      await Promise.all([this.loadBar(), this.loadOrders(), this.loadIssues()]);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bills                                                               */
  /* ------------------------------------------------------------------ */

  async generateBill(request: BillRequest): Promise<Result<Bill>> {
    return await this.guard(async () => {
      const bill = this.mapBill(
        await this.api.post<BillDto>('/bills/generate', {
          tableId: request.tableId ?? null,
          orderId: request.orderId ?? null,
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
        customerPhone: request.customerPhone || null,
        amountTendered: request.amountTendered ?? null,
      });
      const payment = this.mapPayment(dto);
      this.payments.update((list) => [payment, ...list]);
      await this.reloadBilling();
      return payment;
    });
  }

  async recordPayment(request: PaymentRequest): Promise<Result<Payment>> {
    return await this.guard(async () => {
      const dto = await this.api.post<PaymentDto>('/payments/record', {
        billId: request.billId,
        method: request.method,
        receiptUrl: request.receiptUrl || null,
        transactionNumber: request.transactionNumber || null,
        amountPaid: request.amountPaid ?? null,
        payerName: request.payerName || null,
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
        nameAm: input.nameAm?.trim() || null,
        description: input.description || null,
        unitPrice: input.price,
        taxRate: input.taxRate,
        isAvailable: input.available,
        fastingType: input.fastingType ?? MenuItemFastingType.NotApplicable,
        alcoholType: input.alcoholType ?? MenuItemAlcoholType.NotApplicable,
        displayOrder: input.displayOrder ?? 0,
        isFeatured: input.featured ?? false,
        preparationTimeMinutes: input.preparationTimeMinutes ?? null,
        sku: input.sku?.trim() || null,
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

  async createCategory(input: MenuCategoryInput): Promise<Result> {
    return await this.guard(async () => {
      const nextOrder = input.displayOrder ??
        this.menuCategories().reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
      await this.api.post('/menu/categories', {
        name: input.name,
        description: input.description || null,
        parentCategoryId: input.parentCategoryId ?? null,
        type: input.type,
        displayOrder: nextOrder,
      });
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
          shiftIds: input.shiftIds,
        });
      } else {
        await this.api.post('/users', {
          fullName: input.fullName,
          username: input.username,
          phone: input.phone || null,
          role: input.role,
          pin: input.pin || null,
          password: input.password || null,
          shiftIds: input.shiftIds ?? [],
        });
      }
      await Promise.all([this.loadUsers(), this.reloadShiftSchedule()]);
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
        takeawayFee: settings.takeawayFee,
        tipPresets: settings.tipPresets,
        cash: settings.cash,
        qr: settings.qr,
        phonePay: settings.phonePay,
        webhookSecret: settings.webhookSecret || null,
        telebirr: settings.telebirr || null,
        cbe: settings.cbe || null,
        accountName: settings.accountName || null,
        paymentQr: settings.paymentQr || null,
      });
      this.settings.set({
        restaurant: saved.restaurant,
        branch: saved.branch,
        phone: saved.phone ?? '',
        address: saved.address ?? '',
        taxRate: saved.taxRate,
        pricesIncludeTax: saved.pricesIncludeTax,
        serviceCharge: saved.serviceCharge,
        takeawayFee: saved.takeawayFee ?? 0,
        tipPresets: saved.tipPresets ?? [],
        cash: saved.cash,
        qr: saved.qr,
        phonePay: saved.phonePay,
        webhookSecret: saved.webhookSecret ?? '',
        telebirr: saved.telebirr ?? '',
        cbe: saved.cbe ?? '',
        accountName: saved.accountName ?? '',
        paymentQr: saved.paymentQr ?? '',
      });
    });
  }

  reset(): void {
    this.settings.set(DEFAULT_SETTINGS);
    this.tables.set([]);
    this.menuCategories.set([]);
    this.orders.set([]);
    this.kitchenTickets.set([]);
    this.barTickets.set([]);
    this.bills.set([]);
    this.payments.set([]);
    this.tips.set([]);
    this.issues.set([]);
    this.audit.set([]);
    this.users.set([]);
    this.shifts.set([]);
    this.shiftSchedule.set([]);
    this.myShift.set(null);
    this.scheduleRange = null;
    this.reports.set({
      summary: null,
      waiters: [],
      cancellations: null,
      turnaround: null,
      orders: null,
      kitchenStation: null,
      barStation: null,
    });
    this.myReport.set(null);
    this.stationReport.set(null);
    this.loaded.set(false);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private async reloadBilling(): Promise<void> {
    await Promise.all([this.loadPayments(), this.loadBills(), this.loadOrders(), this.loadTips()]);
  }

  private async reloadShiftSchedule(): Promise<void> {
    const range = this.scheduleRange;
    if (range) await this.loadShiftSchedule(range.from, range.to);
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
      defaultShifts: (u.defaultShifts ?? []).map((shift) => ({
        id: shift.id,
        name: shift.name,
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        crossesMidnight: shift.crossesMidnight,
      })),
    };
  }

  private mapOrder(o: OrderDto): Order {
    return {
      id: o.id,
      number: o.orderNumber,
      table: o.tableNumber,
      orderType: o.orderType ?? 'DINE_IN',
      takeawayFee: o.takeawayFee ?? 0,
      queuePosition: o.queuePosition ?? 0,
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
          nameAm: i.menuItemNameAm ?? undefined,
          qty: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
          notes: i.customerNotes ?? undefined,
          status: i.itemStatus,
          servedAt: i.servedAt ?? undefined,
          lineTotal: Math.round(i.unitPrice * i.quantity * 100) / 100,
        }),
      ),
    };
  }

  private mapBill(b: BillDto): Bill {
    return {
      id: b.id,
      sessionId: b.diningSessionId,
      tableId: b.tableId ?? undefined,
      table: b.tableNumber,
      orderType: b.orderType ?? 'DINE_IN',
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
      receiptUrl: p.receiptUrl ?? undefined,
      receiptReference: p.receiptReference ?? undefined,
      amountPaid: p.amountPaid ?? undefined,
      orderStatus: p.orderStatus ?? undefined,
      orderPaymentStatus: p.orderPaymentStatus ?? undefined,
      verification: p.verificationStatus ?? 'NOT_REQUIRED',
      verifiedAmount: p.verifiedAmount ?? undefined,
      verifiedPayer: p.verifiedPayerName ?? undefined,
      verifiedBank: p.verifiedBank ?? undefined,
      verifiedAt: p.verifiedAt ?? undefined,
      verifiedVia: p.verifiedVia ?? undefined,
      verificationNote: p.verificationNote ?? undefined,
    };
  }

  private mapMenuItem(i: MenuItemDto): MenuItem {
    return {
      id: i.id,
      categoryId: i.categoryId,
      category: i.categoryName,
      name: i.name,
      nameAm: i.nameAm ?? undefined,
      description: i.description ?? undefined,
      price: i.unitPrice,
      taxRate: i.taxRate,
      available: i.isAvailable,
      imageUrl: i.imageUrl ?? undefined,
      fastingType: i.fastingType,
      alcoholType: i.alcoholType,
      displayOrder: i.displayOrder,
      featured: i.isFeatured,
      preparationTimeMinutes: i.preparationTimeMinutes ?? undefined,
      sku: i.sku ?? undefined,
    };
  }
}
