import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { locale, TranslatePipe, translate } from '../../core/i18n';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { hasNoTable, isTakeaway, ItemStatus, KitchenTicket, OrderStatus, orderTypeLabel, Station } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { IssueDialog } from '../../shared/issue-dialog';

@Component({
  selector: 'app-kitchen-board',
  imports: [RouterLink, Icon, IssueDialog, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ isBar ? ('Bar display' | t) : ('Kitchen display' | t) }} · {{ station() }}</div>
          <h1 class="page-title">{{ isBar ? ('Bar board' | t) : ('Kitchen board' | t) }}</h1>
          <p class="page-sub">{{ isBar ? ('Drink tickets appear the moment an order is sent. Keep the bar moving.' | t) : ('Tickets appear the moment a waiter sends them. Work oldest first.' | t) }}</p>
        </div>
        <div class="head-actions">
          <div class="branch-btn" style="cursor: default">
            <app-icon name="clock" />
            <span class="num">{{ clockLabel() }}</span>
          </div>
          <button class="icon-btn" type="button" (click)="refresh()" [attr.aria-label]="'Refresh board' | t">
            <app-icon name="retract" />
          </button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon" style="background: #f1ede7; color: var(--muted)"><app-icon name="bell" /></div>
          <div class="stat-label">{{ 'New tickets' | t }}</div>
          <div class="stat-value">{{ counts().new }}</div>
          <div class="stat-foot">{{ 'Waiting for accept' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--orange-soft); color: var(--orange)"><app-icon [name]="isBar ? 'glass' : 'utensils'" /></div>
          <div class="stat-label">{{ 'Preparing' | t }}</div>
          <div class="stat-value">{{ counts().preparing }}</div>
          <div class="stat-foot">{{ isBar ? ('On the bar' | t) : ('On the line' | t) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ isBar ? ('At the bar' | t) : ('At the pass' | t) }}</div>
          <div class="stat-value">{{ counts().ready }}</div>
          <div class="stat-foot">{{ 'Waiting for waiter' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="clock" /></div>
          <div class="stat-label">{{ 'Oldest ticket' | t }}</div>
          <div class="stat-value">{{ oldest() }} <small>{{ 'min' | t }}</small></div>
          <div class="stat-foot">{{ 'Target under 15 min' | t }}</div>
        </div>
      </div>

      @if (queue().length) {
        <div class="board">
          @for (ticket of queue(); track ticket.id) {
            <article [class]="'ticket ticket-' + ticket.status.toLowerCase()">
              <div class="ticket-head">
                @if (ticket.queuePosition > 0) {
                  <span class="queue-chip">{{ 'Q' | t }}{{ ticket.queuePosition }}</span>
                }
                <a class="ticket-num" [routerLink]="[stationPath, ticket.id]">#{{ ticket.number }}</a>
                @if (hasNoTable(ticket)) {
                  <span class="ticket-table"><app-icon [name]="isTakeaway(ticket) ? 'receipt' : 'bag'" style="font-size: 11px" /> {{ orderTypeLabel(ticket) | t }}</span>
                } @else {
                  <span class="ticket-table">{{ 'Table' | t }} {{ ticket.table }}</span>
                }
                <span [class]="'ticket-time ' + timerTone(ticket)">
                  <app-icon name="clock" /> {{ elapsed(ticket) }} {{ 'min' | t }} </span>
              </div>
              <div class="ticket-waiter">
                <app-icon name="user" /> <strong>{{ ticket.waiterName }}</strong>
                @if (ticket.queuePosition === 1) {
                  <span class="pill pill-amber no-dot">{{ 'Next up' | t }}</span>
                }
              </div>

              <div class="ticket-items">
                @for (item of ticket.items; track item.id) {
                  <div class="ticket-item">
                    <span class="ticket-qty">{{ item.qty }}</span>
                    <div style="flex: 1">
                      <span [style.text-decoration]="item.status === ItemStatus.Cancelled ? 'line-through' : 'none'" [style.opacity]="item.status === ItemStatus.Cancelled ? 0.45 : 1">
                        {{ item.name }}
                      </span>
                      @if (item.nameAm) {
                        <div class="tiny muted" lang="am">{{ item.nameAm }}</div>
                      }
                      @if (item.notes) {
                        <div class="tiny" style="color: var(--amber)">{{ item.notes }}</div>
                      }
                    </div>
                    @if (item.status === ItemStatus.Cancelled) {
                      <span class="tiny muted">{{ 'Removed' | t }}</span>
                    } @else if (item.status === ItemStatus.Prepared) {
                      <span class="pill pill-green no-dot">{{ 'Ready' | t }}</span>
                    } @else if (ticket.status !== OrderStatus.Pending) {
                      <button class="btn btn-sm btn-primary" type="button"
                              [disabled]="itemBusy() === item.id"
                              (click)="readyItem(ticket, item)">
                        {{ itemBusy() === item.id ? ('Working…' | t) : ('Ready' | t) }}
                      </button>
                    }
                  </div>
                }
              </div>

              <div class="ticket-actions">
                @if (ticket.status === OrderStatus.Pending) {
                  <button class="btn btn-primary btn-block" type="button" [disabled]="busy() === ticket.id" (click)="advance(ticket)">
                    <app-icon name="check" />
                    {{ busy() === ticket.id ? ('Working…' | t) : ('Accept' | t) }}
                  </button>
                } @else if (ticket.status === OrderStatus.Preparing && hasActive(ticket)) {
                  <button class="btn btn-primary btn-block" type="button" [disabled]="busy() === ticket.id" (click)="readyAll(ticket)">
                    <app-icon name="check-circle" />
                    {{ busy() === ticket.id ? ('Working…' | t) : ('Ready all' | t) }}
                  </button>
                }
                <button class="btn btn-secondary btn-block" type="button" (click)="issueTicket.set(ticket)">
                  <app-icon name="alert" /> {{ 'Report issue' | t }} </button>
              </div>

              <div class="ticket-foot">
                <span [class]="'pill ' + (ticket.status === OrderStatus.Pending ? 'pill-amber' : 'pill-orange')">
                  {{ ticket.status === OrderStatus.Pending ? ('New' | t) : ('Preparing' | t) }}
                </span>
                <span class="tiny muted">{{ ticket.items.length }} {{ 'lines' | t }}</span>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="card empty" style="padding: 54px 20px">
          <app-icon name="check-circle" style="color: var(--green)" />
          <strong>{{ 'Line is clear' | t }}</strong>
          <p>{{ 'No new or preparing' | t }} {{ isBar ? ('drink' | t) : '' }} {{ 'tickets. New orders will appear here automatically.' | t }}</p>
        </div>
      }

      @if (ready().length) {
        <div class="card mt-4">
          <div class="card-head">
            <div>
              <div class="card-title">{{ isBar ? ('At the bar' | t) : ('At the pass' | t) }}</div>
              <div class="card-sub">{{ isBar ? ('Poured and waiting for the waiter to pick up' | t) : ('Plated and waiting for the waiter to pick up' | t) }}</div>
            </div>
            <span class="pill pill-green no-dot">{{ ready().length }} {{ 'waiting' | t }}</span>
          </div>
          <div class="list">
            @for (ticket of ready(); track ticket.id) {
              <a class="list-row" [routerLink]="[stationPath, ticket.id]">
                <span class="ticket-num" style="font-size: 16px">#{{ ticket.number }}</span>
                <div class="list-main">
                  <strong>
                    @if (hasNoTable(ticket)) {
                      <app-icon [name]="isTakeaway(ticket) ? 'receipt' : 'bag'" style="font-size: 12px" /> {{ orderTypeLabel(ticket) | t }}
                    } @else {
                      {{ 'Table' | t }} {{ ticket.table }}
                    }
                    · {{ ticket.waiterName }}
                  </strong>
                  <span>{{ ticket.items.length }} {{ 'lines ·' | t }} {{ elapsed(ticket) }} {{ 'min on the board' | t }}</span>
                </div>
                <span class="pill pill-green">{{ 'Ready' | t }}</span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        </div>
      }
    </div>

    @if (issueTicket(); as ticket) {
      <app-issue-dialog [ticket]="ticket" [station]="isBar ? Station.Bar : Station.Kitchen" (closed)="issueTicket.set(null)" />
    }
  `,
})
export class KitchenBoardPage implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly ItemStatus = ItemStatus;
  protected readonly OrderStatus = OrderStatus;
  protected readonly Station = Station;

  protected readonly isBar = this.route.snapshot.data['station'] === Station.Bar;
  protected readonly stationPath = this.isBar ? '/bar' : '/kitchen';
  protected readonly isTakeaway = isTakeaway;
  protected readonly hasNoTable = hasNoTable;
  protected readonly orderTypeLabel = orderTypeLabel;

  protected readonly station = computed(() => {
    const branch = this.store.settings().branch;
    const suffix = translate(this.isBar ? 'bar' : 'kitchen');
    return branch ? `${branch} ${suffix}` : suffix;
  });
  protected readonly issueTicket = signal<KitchenTicket | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly itemBusy = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  private readonly timer = window.setInterval(() => {
    this.now.set(Date.now());
    void this.loadStation();
  }, 20000);

  protected readonly queue = computed(() =>
    this.isBar ? this.store.barQueue() : this.store.kitchenQueue(),
  );
  protected readonly ready = computed(() =>
    (this.isBar ? this.store.barTickets() : this.store.kitchenTickets()).filter((t) => t.status === OrderStatus.Ready),
  );

  protected readonly counts = computed(() => ({
    new: this.queue().filter((t) => t.status === OrderStatus.Pending).length,
    preparing: this.queue().filter((t) => t.status === OrderStatus.Preparing).length,
    ready: this.ready().length,
  }));

  protected readonly oldest = computed(() => {
    const queue = this.queue();
    if (!queue.length) return 0;
    return Math.max(0, Math.floor((this.now() - new Date(queue[0].createdAt).getTime()) / 60000));
  });

  protected readonly clockLabel = computed(() =>
    new Date(this.now()).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }),
  );

  async ngOnInit(): Promise<void> {
    await this.loadStation();
  }

  private loadStation(): Promise<void> {
    return this.isBar ? this.store.loadBar() : this.store.loadKitchen();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected elapsed(ticket: KitchenTicket): number {
    return Math.max(0, Math.floor((this.now() - new Date(ticket.createdAt).getTime()) / 60000));
  }

  protected timerTone(ticket: KitchenTicket): string {
    const minutes = this.elapsed(ticket);
    if (minutes >= 20) return 'late';
    if (minutes >= 12) return 'warn';
    return '';
  }

  protected async advance(ticket: KitchenTicket): Promise<void> {
    if (this.busy()) return;
    this.busy.set(ticket.id);
    const result = this.isBar
      ? await this.store.barStatus(ticket.id, OrderStatus.Preparing)
      : await this.store.kitchenStatus(ticket.id, OrderStatus.Preparing);
    this.busy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async readyItem(ticket: KitchenTicket, item: KitchenTicket['items'][number]): Promise<void> {
    if (this.itemBusy()) return;
    this.itemBusy.set(item.id);
    const result = await this.store.readyItem(ticket.id, item.id, this.isBar ? Station.Bar : Station.Kitchen);
    this.itemBusy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected hasActive(ticket: KitchenTicket): boolean {
    return ticket.items.some((item) => item.status === ItemStatus.Active);
  }

  protected async readyAll(ticket: KitchenTicket): Promise<void> {
    if (this.busy()) return;
    if (!this.hasActive(ticket)) {
      this.toast.show(translate('Every item on this ticket is already ready.'), 'error');
      return;
    }
    this.busy.set(ticket.id);
    const result = this.isBar
      ? await this.store.barStatus(ticket.id, OrderStatus.Ready)
      : await this.store.kitchenStatus(ticket.id, OrderStatus.Ready);
    this.busy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async refresh(): Promise<void> {
    this.now.set(Date.now());
    await this.loadStation();
  }
}
