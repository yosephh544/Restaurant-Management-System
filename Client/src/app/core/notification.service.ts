import { computed, inject, Injectable, signal } from '@angular/core';
import { translate } from './i18n';
import { KitchenTicket, Order, Role } from './models';
import { SessionService } from './session.service';
import { Store } from './store';
import { ToastAction, ToastService, ToastTone } from './toast.service';

export interface AppNotification {
  id: number;
  key?: string;
  title: string;
  message: string;
  tone: ToastTone;
  at: number;
  link?: ToastAction;
  read: boolean;
}

const POLL_INTERVAL_MS = 5000;
const ESCALATION_INTERVAL_MS = 30000;
const ACCEPT_DEADLINE_MINUTES = 2;
const PREP_DEADLINE_MINUTES = 15;
const PICKUP_DEADLINE_MINUTES = 3;
const MAX_RECENT = 30;
const SOUND_KEY = 'rms.notifications.sound';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly store = inject(Store);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly recent = signal<AppNotification[]>([]);
  readonly unread = computed(() => this.recent().filter((item) => !item.read).length);
  readonly soundEnabled = signal(this.loadSound());

  private started = false;
  private polling = false;
  private nextId = 1;
  private pollTimer: number | null = null;
  private escalateTimer: number | null = null;
  private audio: AudioContext | null = null;
  private readonly orderStates = new Map<string, string>();
  private readonly stationStates = new Map<string, string>();

  start(): void {
    if (this.started || !this.session.profile()) return;
    this.started = true;
    this.prime();
    this.pollTimer = window.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.escalateTimer = window.setInterval(() => this.escalate(), ESCALATION_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    this.polling = false;
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.escalateTimer !== null) {
      window.clearInterval(this.escalateTimer);
      this.escalateTimer = null;
    }
    this.orderStates.clear();
    this.stationStates.clear();
    this.recent.set([]);
    this.toast.clear();
  }

  markAllRead(): void {
    this.recent.update((list) => list.map((item) => (item.read ? item : { ...item, read: true })));
  }

  clear(): void {
    this.recent.set([]);
    this.toast.clear();
  }

  toggleSound(): void {
    const enabled = !this.soundEnabled();
    this.soundEnabled.set(enabled);
    try {
      localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
    } catch {
      // Sound preference is best-effort; the current session still honours it.
    }
  }

  private prime(): void {
    for (const order of this.store.orders()) {
      this.orderStates.set(order.id, order.status);
    }
    for (const ticket of this.store.kitchenTickets()) {
      this.stationStates.set(this.stationKey('KITCHEN', ticket.id), ticket.status);
    }
    for (const ticket of this.store.barTickets()) {
      this.stationStates.set(this.stationKey('BAR', ticket.id), ticket.status);
    }
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.session.profile()) return;
    this.polling = true;
    try {
      const role = this.role();
      if (role === 'WAITER' && this.session.hasPermission('orders.view')) {
        await this.store.loadOrders();
        this.detectWaiterChanges();
        return;
      }
      if (role === 'KITCHEN' && this.session.hasPermission('kitchen.view')) {
        await this.store.loadKitchen();
        this.detectStationChanges('KITCHEN');
        return;
      }
      if (role === 'BARTENDER' && this.session.hasPermission('bar.view')) {
        await this.store.loadBar();
        this.detectStationChanges('BAR');
      }
    } finally {
      this.polling = false;
    }
  }

  private detectWaiterChanges(): void {
    const waiterId = this.session.user()?.id ?? '';
    for (const order of this.store.orders()) {
      if (order.waiterId !== waiterId) continue;
      const previous = this.orderStates.get(order.id);
      this.orderStates.set(order.id, order.status);

      if (previous === undefined) {
        this.notifyWaiterStatus(order);
        continue;
      }
      if (previous === order.status) continue;

      if (previous === 'READY') {
        this.toast.dismissKey(`WAITER-ready-${order.id}`);
      }
      this.notifyWaiterStatus(order);
    }
  }

  private notifyWaiterStatus(order: Order): void {
    const link: ToastAction = { label: translate('Open order'), path: `/waiter/orders/${order.id}` };
    if (order.status === 'PREPARING') {
      this.push({
        title: translate('Order update'),
        message: translate('Order #{number} for table {table} is being prepared.', {
          number: order.number,
          table: order.table,
        }),
        tone: 'info',
        link,
      });
    } else if (order.status === 'READY') {
      this.push({
        title: translate('Order ready'),
        message: translate('Order #{number} for table {table} is ready — pick it up.', {
          number: order.number,
          table: order.table,
        }),
        tone: 'alert',
        link,
      });
    } else if (order.status === 'CANCELLEDBYKITCHEN') {
      this.push({
        title: translate('Order cancelled'),
        message: translate('Order #{number} for table {table} was cancelled by the kitchen.', {
          number: order.number,
          table: order.table,
        }),
        tone: 'error',
        link,
      });
    }
  }

  private detectStationChanges(station: 'KITCHEN' | 'BAR'): void {
    const tickets = station === 'KITCHEN' ? this.store.kitchenTickets() : this.store.barTickets();
    const prefix = `${station}:`;
    const seen = new Set<string>();

    for (const ticket of tickets) {
      const key = `${prefix}${ticket.id}`;
      seen.add(key);
      const previous = this.stationStates.get(key);
      this.stationStates.set(key, ticket.status);
      if (previous !== undefined) {
        if (previous === 'PENDING' && ticket.status !== 'PENDING') {
          this.toast.dismissKey(`${station}-accept-${ticket.id}`);
        }
        if (previous === 'PREPARING' && ticket.status !== 'PREPARING') {
          this.toast.dismissKey(`${station}-prep-${ticket.id}`);
        }
        continue;
      }

      this.push({
        title: station === 'KITCHEN' ? translate('New kitchen ticket') : translate('New bar ticket'),
        message: translate('Order #{number} · Table {table}. Accept it to start preparing.', {
          number: ticket.number,
          table: ticket.table,
        }),
        tone: 'alert',
        link: {
          label: translate('Open ticket'),
          path: station === 'KITCHEN' ? `/kitchen/${ticket.id}` : `/bar/${ticket.id}`,
        },
      });
    }

    for (const key of [...this.stationStates.keys()]) {
      if (!key.startsWith(prefix) || seen.has(key)) continue;
      const id = key.slice(prefix.length);
      this.stationStates.delete(key);
      this.toast.dismissKey(`${station}-accept-${id}`);
      this.toast.dismissKey(`${station}-prep-${id}`);
    }
  }

  private escalate(): void {
    if (!this.session.profile()) return;
    const role = this.role();
    const now = Date.now();

    if (role === 'WAITER') {
      this.escalateWaiterReadyOrders(now);
      return;
    }
    if (role === 'KITCHEN' || role === 'BARTENDER') {
      this.escalateStationTickets(role === 'KITCHEN' ? 'KITCHEN' : 'BAR', now);
    }
  }

  private escalateWaiterReadyOrders(now: number): void {
    const waiterId = this.session.user()?.id ?? '';
    for (const order of this.store.orders()) {
      if (order.waiterId !== waiterId || order.status !== 'READY' || !order.readyAt) continue;
      const readyAt = Date.parse(order.readyAt);
      if (!Number.isFinite(readyAt)) continue;
      const minutes = Math.floor((now - readyAt) / 60000);
      if (minutes < PICKUP_DEADLINE_MINUTES) continue;

      this.push({
        key: `WAITER-ready-${order.id}`,
        title: translate('Waiting at the pass'),
        message: translate('Order #{number} has been ready for {minutes} min. Serve it now.', {
          number: order.number,
          minutes,
        }),
        tone: 'alert',
        link: { label: translate('Open order'), path: `/waiter/orders/${order.id}` },
      });
    }
  }

  private escalateStationTickets(station: 'KITCHEN' | 'BAR', now: number): void {
    const tickets: KitchenTicket[] =
      station === 'KITCHEN' ? this.store.kitchenTickets() : this.store.barTickets();

    for (const ticket of tickets) {
      const createdAt = Date.parse(ticket.createdAt);
      if (!Number.isFinite(createdAt)) continue;
      const minutes = Math.floor((now - createdAt) / 60000);
      const path = station === 'KITCHEN' ? `/kitchen/${ticket.id}` : `/bar/${ticket.id}`;

      if (ticket.status === 'PENDING' && minutes >= ACCEPT_DEADLINE_MINUTES) {
        this.push({
          key: `${station}-accept-${ticket.id}`,
          title: translate('Ticket needs attention'),
          message: translate('Ticket #{number} at table {table} has waited {minutes} min to be accepted.', {
            number: ticket.number,
            table: ticket.table,
            minutes,
          }),
          tone: 'alert',
          link: { label: translate('Open ticket'), path },
        });
      } else if (ticket.status === 'PREPARING' && minutes >= PREP_DEADLINE_MINUTES) {
        this.push({
          key: `${station}-prep-${ticket.id}`,
          title: translate('Ticket overdue'),
          message: translate(
            'Ticket #{number} has been preparing for {minutes} min. Finish it or report an issue.',
            { number: ticket.number, minutes },
          ),
          tone: 'alert',
          link: { label: translate('Open ticket'), path },
        });
      }
    }
  }

  private push(input: {
    key?: string;
    title: string;
    message: string;
    tone: ToastTone;
    link?: ToastAction;
  }): void {
    const toast = this.toast.notify({
      key: input.key,
      title: input.title,
      message: input.message,
      tone: input.tone,
      action: input.link,
    });
    const notification: AppNotification = {
      id: this.nextId++,
      key: input.key,
      title: input.title,
      message: input.message,
      tone: input.tone,
      at: toast.createdAt,
      link: input.link,
      read: false,
    };
    this.recent.update((list) =>
      [notification, ...list.filter((item) => !input.key || item.key !== input.key)].slice(0, MAX_RECENT),
    );
    if (input.tone === 'alert' || input.tone === 'warning' || input.tone === 'error') {
      this.playAlert();
    }
  }

  private playAlert(): void {
    if (!this.soundEnabled()) return;
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.audio ??= new AudioCtor();
      const context = this.audio;
      if (context.state === 'suspended') context.resume().catch(() => undefined);
      const start = context.currentTime;
      [880, 1174].forEach((frequency, index) => {
        const offset = index * 0.18;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.18);
      });
    } catch {
      // Audio is a best-effort enhancement; blocked autoplay must not break alerts.
    }
  }

  private role(): Role | null {
    return this.session.user()?.role ?? null;
  }

  private stationKey(station: 'KITCHEN' | 'BAR', id: string): string {
    return `${station}:${id}`;
  }

  private loadSound(): boolean {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  }
}
