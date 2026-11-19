import {
  AuditEvent,
  Issue,
  MenuItem,
  Order,
  OrderLine,
  Payment,
  Settings,
  StaffUser,
  bill,
  ROLE_LABEL,
} from './models';

export interface SeedData {
  users: StaffUser[];
  menu: MenuItem[];
  orders: Order[];
  payments: Payment[];
  issues: Issue[];
  audit: AuditEvent[];
  settings: Settings;
  nextNumber: number;
}

export const DEMO_PASSWORD = 'demo1234';

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60000).toISOString();
const at = (daysBack: number, hour: number, minute = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const users: StaffUser[] = [
  {
    id: 'u1',
    name: 'Alex Bekele',
    username: 'alex',
    phone: '0920496730',
    role: 'OWNER',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    startedAt: at(400, 9),
  },
  {
    id: 'u2',
    name: 'Sara Ahmed',
    username: 'sara',
    phone: '0911223344',
    role: 'MANAGER',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    startedAt: at(320, 9),
  },
  {
    id: 'u3',
    name: 'Hana Girma',
    username: 'hana',
    phone: '0912345678',
    role: 'CASHIER',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    startedAt: at(240, 9),
  },
  {
    id: 'u4',
    name: 'Yoseph Tesfaye',
    username: 'yoseph',
    phone: '0913456789',
    role: 'WAITER',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    pin: '1234',
    startedAt: at(180, 9),
  },
  {
    id: 'u5',
    name: 'Selam Bekele',
    username: 'selam',
    phone: '0914567890',
    role: 'WAITER',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    pin: '1234',
    startedAt: at(150, 9),
  },
  {
    id: 'u6',
    name: 'Dawit Alemu',
    username: 'dawit',
    phone: '0915678901',
    role: 'KITCHEN',
    status: 'ACTIVE',
    password: DEMO_PASSWORD,
    pin: '1234',
    startedAt: at(120, 9),
  },
  {
    id: 'u7',
    name: 'Meron Kebede',
    username: 'meron',
    phone: '0916789012',
    role: 'CASHIER',
    status: 'INACTIVE',
    password: DEMO_PASSWORD,
    startedAt: at(90, 9),
  },
];

const menu: MenuItem[] = [
  {
    id: 'm1',
    name: 'Grilled Chicken',
    category: 'Mains',
    price: 420,
    taxRate: 15,
    emoji: '🍗',
    description: 'Charcoal-grilled quarter chicken with awaze',
    available: true,
  },
  {
    id: 'm2',
    name: 'Beef Tibs',
    category: 'Mains',
    price: 520,
    taxRate: 15,
    emoji: '🥩',
    description: 'Sautéed beef tibs with onion and rosemary',
    available: true,
  },
  {
    id: 'm3',
    name: 'Shiro',
    category: 'Mains',
    price: 240,
    taxRate: 15,
    emoji: '🍲',
    description: 'Slow-cooked chickpea stew with injera',
    available: true,
  },
  {
    id: 'm4',
    name: 'Pasta',
    category: 'Mains',
    price: 280,
    taxRate: 15,
    emoji: '🍝',
    description: 'Spaghetti with tomato and basil',
    available: true,
  },
  {
    id: 'm5',
    name: 'Steak',
    category: 'Mains',
    price: 640,
    taxRate: 15,
    emoji: '🥩',
    description: 'Grilled ribeye, medium, with chips',
    available: true,
  },
  {
    id: 'm6',
    name: 'Pizza',
    category: 'Mains',
    price: 380,
    taxRate: 15,
    emoji: '🍕',
    description: 'Wood-fired margherita',
    available: true,
  },
  {
    id: 'm7',
    name: 'Burger',
    category: 'Mains',
    price: 320,
    taxRate: 15,
    emoji: '🍔',
    description: 'Beef burger with smoked cheese',
    available: true,
  },
  {
    id: 'm8',
    name: 'Firfir',
    category: 'Breakfast',
    price: 260,
    taxRate: 15,
    emoji: '🍛',
    description: 'Injera tossed in spicy berbere sauce',
    available: true,
  },
  {
    id: 'm9',
    name: 'Chechebsa',
    category: 'Breakfast',
    price: 220,
    taxRate: 15,
    emoji: '🥞',
    description: 'Shredded flatbread with niter kibbeh',
    available: true,
  },
  {
    id: 'm10',
    name: 'Omelette',
    category: 'Breakfast',
    price: 180,
    taxRate: 15,
    emoji: '🍳',
    description: 'Three eggs, tomato, onion, chili',
    available: true,
  },
  {
    id: 'm11',
    name: 'Fresh Juice',
    category: 'Drinks',
    price: 110,
    taxRate: 15,
    emoji: '🥤',
    description: 'Pressed mango, avocado or mixed',
    available: true,
  },
  {
    id: 'm12',
    name: 'Coca Cola',
    category: 'Drinks',
    price: 60,
    taxRate: 15,
    emoji: '🥤',
    description: 'Chilled 330ml bottle',
    available: true,
  },
  {
    id: 'm13',
    name: 'Macchiato',
    category: 'Drinks',
    price: 70,
    taxRate: 15,
    emoji: '☕',
    description: 'Double espresso with steamed milk',
    available: true,
  },
  {
    id: 'm14',
    name: 'Sparkling Water',
    category: 'Drinks',
    price: 50,
    taxRate: 15,
    emoji: '💧',
    description: 'Chilled 500ml bottle',
    available: true,
  },
  {
    id: 'm15',
    name: 'Cheesecake',
    category: 'Desserts',
    price: 180,
    taxRate: 15,
    emoji: '🍰',
    description: 'Vanilla cheesecake, berry coulis',
    available: true,
  },
  {
    id: 'm16',
    name: 'Fruit Salad',
    category: 'Desserts',
    price: 150,
    taxRate: 15,
    emoji: '🍓',
    description: 'Seasonal fruit with lime and mint',
    available: false,
  },
];

let lineSeq = 0;
const line = (menuId: string, qty: number, notes = '', status: OrderLine['status'] = 'ACTIVE'): OrderLine => {
  const item = menu.find((m) => m.id === menuId);
  if (!item) throw new Error(`Unknown menu item ${menuId}`);
  lineSeq += 1;
  return {
    id: `l${lineSeq}`,
    itemId: item.id,
    name: item.name,
    emoji: item.emoji,
    qty,
    unitPrice: item.price,
    taxRate: item.taxRate,
    notes,
    status,
  };
};

const user = (id: string) => {
  const found = users.find((u) => u.id === id);
  if (!found) throw new Error(`Unknown user ${id}`);
  return found;
};

const orders: Order[] = [];
const payments: Payment[] = [];
const issues: Issue[] = [];
const audit: AuditEvent[] = [];

const waiterIds = ['u4', 'u5'];

function addOrder(input: {
  number: string;
  table: string;
  waiterId: string;
  status: Order['status'];
  lines: OrderLine[];
  notes?: string;
  createdAt: string;
  preparingAt?: string;
  readyAt?: string;
  servedAt?: string;
  cancelReason?: string;
  parentNumber?: string;
  paymentStatus?: Order['paymentStatus'];
}): Order {
  const waiter = user(input.waiterId);
  const order: Order = {
    id: `o${input.number}`,
    number: input.number,
    table: input.table,
    waiterId: waiter.id,
    waiterName: waiter.name,
    status: input.status,
    paymentStatus: input.paymentStatus ?? 'UNPAID',
    lines: input.lines,
    notes: input.notes ?? '',
    tip: 0,
    createdAt: input.createdAt,
    preparingAt: input.preparingAt,
    readyAt: input.readyAt,
    servedAt: input.servedAt,
    cancelReason: input.cancelReason,
    parentNumber: input.parentNumber,
  };
  orders.push(order);
  return order;
}

const cashier = user('u3');

function addPayment(
  order: Order,
  method: Payment['method'],
  tip: number,
  opts: { at?: string; tendered?: number; phone?: string } = {},
): Payment {
  const b = bill(order.lines, 5);
  const total = Math.round((b.total + tip) * 100) / 100;
  const created = opts.at ?? order.createdAt;
  const payment: Payment = {
    id: `p${order.number}-${method}`,
    orderId: order.id,
    orderNumber: order.number,
    waiterId: order.waiterId,
    waiterName: order.waiterName,
    method,
    base: b.total,
    tip,
    total,
    status: 'PAID',
    tendered: method === 'CASH' ? (opts.tendered ?? total + 50) : undefined,
    change: method === 'CASH' ? Math.round(((opts.tendered ?? total + 50) - total) * 100) / 100 : undefined,
    phone: opts.phone,
    createdAt: created,
    settledAt: created,
    tipPaidOut: false,
    actor: method === 'CASH' ? user(order.waiterId).name : cashier.name,
  };
  order.paymentStatus = 'PAID';
  order.tip = tip;
  payments.push(payment);
  return payment;
}

/* ---------- Past six days of settled service (reports + chart) ---------- */

const rotation = ['m1', 'm2', 'm3', 'm11', 'm4', 'm7', 'm5', 'm6', 'm8', 'm9'];
const methods: Payment['method'][] = ['CASH', 'QR', 'PHONE'];

let number = 1000;

for (let day = 6; day >= 1; day -= 1) {
  for (let slot = 0; slot < 5; slot += 1) {
    number += 1;
    const item = rotation[(day * 3 + slot) % rotation.length];
    const drink = slot % 2 === 0 ? 'm12' : 'm11';
    const lines = [line(item, 1 + ((day + slot) % 2)), line(drink, 1)];
    const created = at(day, 11 + slot * 2, (slot * 13) % 60);
    const status: Order['status'] = 'SERVED';
    const order = addOrder({
      number: String(number),
      table: String((slot % 6) + 1).padStart(2, '0'),
      waiterId: waiterIds[(day + slot) % 2],
      status,
      lines,
      createdAt: created,
      preparingAt: created,
      readyAt: created,
      servedAt: created,
    });
    const tip = slot === 2 ? 50 : slot === 4 ? 20 : 0;
    addPayment(order, methods[(day + slot) % 3], tip, {
      at: created,
      phone: (day + slot) % 3 === 2 ? '0911223344' : undefined,
    });
  }
}

/* ---------- Earlier today (settled) ---------- */

for (let slot = 0; slot < 4; slot += 1) {
  number += 1;
  const created = ago(240 - slot * 40);
  const order = addOrder({
    number: String(number),
    table: String(slot + 2).padStart(2, '0'),
    waiterId: waiterIds[slot % 2],
    status: 'SERVED',
    lines: [line(rotation[slot % rotation.length], 1), line('m13', 1)],
    createdAt: created,
    preparingAt: created,
    readyAt: created,
    servedAt: created,
  });
  addPayment(order, methods[slot % 3], slot === 1 ? 30 : 0, {
    at: created,
    phone: slot % 3 === 2 ? '0913456789' : undefined,
  });
}

/* ---------- Live floor right now ---------- */

addOrder({
  number: '1038',
  table: '11',
  waiterId: 'u4',
  status: 'SERVED',
  lines: [line('m7', 2), line('m11', 1)],
  createdAt: ago(95),
  preparingAt: ago(92),
  readyAt: ago(78),
  servedAt: ago(74),
  notes: '',
});
addPayment(orders[orders.length - 1], 'CASH', 0, { at: ago(70) });

addOrder({
  number: '1039',
  table: '04',
  waiterId: 'u5',
  status: 'CANCELLED',
  lines: [line('m2', 2, '', 'CANCELLED')],
  createdAt: ago(34),
  cancelReason: 'Out of stock',
});
issues.push({
  id: 'i1039',
  orderId: 'o1039',
  orderNumber: '1039',
  table: '04',
  item: 'Beef Tibs',
  reason: 'OUT_OF_STOCK',
  note: 'Kitchen ran out of beef tibs',
  createdAt: ago(28),
  status: 'OPEN',
});

addOrder({
  number: '1040',
  table: '02',
  waiterId: 'u4',
  status: 'SERVED',
  lines: [line('m1', 1), line('m11', 1)],
  createdAt: ago(58),
  preparingAt: ago(56),
  readyAt: ago(44),
  servedAt: ago(41),
});
addPayment(orders[orders.length - 1], 'QR', 0, { at: ago(38) });

addOrder({
  number: '1041',
  table: '08',
  waiterId: 'u4',
  status: 'READY',
  lines: [line('m1', 1), line('m11', 1, 'No sugar please')],
  createdAt: ago(14),
  preparingAt: ago(12),
  readyAt: ago(3),
  notes: 'No sugar please',
});

addOrder({
  number: '1042',
  table: '05',
  waiterId: 'u4',
  status: 'PREPARING',
  lines: [line('m2', 2), line('m12', 1)],
  createdAt: ago(9),
  preparingAt: ago(7),
});

addOrder({
  number: '1043',
  table: '12',
  waiterId: 'u5',
  status: 'PENDING',
  lines: [line('m3', 2), line('m11', 1)],
  createdAt: ago(6),
});

addOrder({
  number: '1044',
  table: '03',
  waiterId: 'u5',
  status: 'PENDING',
  lines: [line('m4', 1, '', 'CANCELLED'), line('m3', 1)],
  createdAt: ago(17),
  notes: 'Guest is waiting',
});
issues.push({
  id: 'i1044',
  orderId: 'o1044',
  orderNumber: '1044',
  table: '03',
  item: 'Pasta',
  reason: 'OUT_OF_STOCK',
  note: 'Supplier missed the delivery',
  createdAt: ago(15),
  status: 'OPEN',
});

addOrder({
  number: '1045',
  table: '07',
  waiterId: 'u5',
  status: 'PREPARING',
  lines: [line('m5', 1), line('m14', 1)],
  createdAt: ago(22),
  preparingAt: ago(20),
});
issues.push({
  id: 'i1045',
  orderId: 'o1045',
  orderNumber: '1045',
  table: '07',
  item: 'Steak',
  reason: 'DELAY',
  note: 'Needs check — temperature and resting time',
  createdAt: ago(12),
  status: 'OPEN',
});

addOrder({
  number: '1046',
  table: '09',
  waiterId: 'u4',
  status: 'PENDING',
  lines: [line('m6', 1, 'Extra topping')],
  createdAt: ago(4),
});
issues.push({
  id: 'i1046',
  orderId: 'o1046',
  orderNumber: '1046',
  table: '09',
  item: 'Pizza',
  reason: 'OTHER',
  note: 'Extra topping requested — confirm availability',
  createdAt: ago(3),
  status: 'OPEN',
});

addOrder({
  number: '1047',
  table: '06',
  waiterId: 'u5',
  status: 'READY',
  lines: [line('m7', 2), line('m11', 1)],
  createdAt: ago(11),
  preparingAt: ago(9),
  readyAt: ago(2),
});

addOrder({
  number: '1048',
  table: '01',
  waiterId: 'u4',
  status: 'READY',
  lines: [line('m6', 2)],
  createdAt: ago(25),
  preparingAt: ago(23),
  readyAt: ago(6),
});

addOrder({
  number: '1049',
  table: '10',
  waiterId: 'u4',
  status: 'CANCELLED',
  lines: [line('m1', 2, '', 'CANCELLED')],
  createdAt: ago(21),
  cancelReason: 'Equipment issue',
});

/* ---------- Audit trail ---------- */

const seedAudit: Omit<AuditEvent, 'id'>[] = [
  {
    at: ago(3),
    actor: 'Dawit Alemu',
    role: 'KITCHEN',
    action: 'Marked order ready',
    detail: 'Order #1047 · Table 06',
    kind: 'order',
  },
  {
    at: ago(12),
    actor: 'Hana Girma',
    role: 'CASHIER',
    action: 'Cash payment settled',
    detail: 'Order #1040 · 600.00 ETB',
    kind: 'payment',
  },
  {
    at: ago(15),
    actor: 'Dawit Alemu',
    role: 'KITCHEN',
    action: 'Item reported unavailable',
    detail: 'Order #1044 · Pasta · Out of stock',
    kind: 'cancel',
  },
  {
    at: ago(28),
    actor: 'Dawit Alemu',
    role: 'KITCHEN',
    action: 'Order cancelled',
    detail: 'Order #1039 · Beef Tibs out of stock',
    kind: 'cancel',
  },
  {
    at: ago(38),
    actor: 'Hana Girma',
    role: 'CASHIER',
    action: 'QR payment settled',
    detail: 'Order #1040 · 500.00 ETB',
    kind: 'payment',
  },
  {
    at: ago(70),
    actor: 'Hana Girma',
    role: 'CASHIER',
    action: 'Cash payment settled',
    detail: 'Order #1038 · 917.00 ETB',
    kind: 'payment',
  },
];

seedAudit.forEach((event, index) => {
  audit.push({ ...event, id: `a${index + 1}` });
});

const settings: Settings = {
  restaurant: 'RestoPro',
  branch: 'Main Branch',
  phone: '+251 911 223 344',
  address: 'Bole Road, Addis Ababa',
  taxRate: 15,
  serviceCharge: 5,
  tipPresets: [0, 10, 15, 20],
  cash: true,
  qr: true,
  phonePay: true,
  webhookSecret: 'whsec_restopro_demo',
};

export function createSeed(): SeedData {
  return {
    users: users.map((u) => ({ ...u })),
    menu: menu.map((m) => ({ ...m })),
    orders: orders.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l })) })),
    payments: payments.map((p) => ({ ...p })),
    issues: issues.map((i) => ({ ...i })),
    audit: audit.map((a) => ({ ...a })),
    settings: { ...settings, tipPresets: [...settings.tipPresets] },
    nextNumber: 1050,
  };
}

export const ROLE_ORDER: (keyof typeof ROLE_LABEL)[] = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'];
