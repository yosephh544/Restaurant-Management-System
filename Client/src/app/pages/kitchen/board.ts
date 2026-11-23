import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { locale, TranslatePipe, translate } from '../../core/i18n';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { isTakeaway, KitchenTicket } from '../../core/models';
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

      <div class="stat-strip">
        <div class="strip-stat">
          <span class="strip-icon"><app-icon name="bell" /></span>
          <span class="strip-body">
            <span class="strip-value">{{ counts().new }}</span>
            <span class="strip-label">{{ 'New tickets' | t }}</span>
          </span>
        </div>
        <div class="strip-stat">
          <span class="strip-icon orange"><app-icon [name]="isBar ? 'glass' : 'utensils'" /></span>
          <span class="strip-body">
            <span class="strip-value">{{ counts().preparing }}</span>
            <span class="strip-label">{{ 'Preparing' | t }}</span>
          </span>
        </div>
        <div class="strip-stat">
          <span class="strip-icon green"><app-icon name="check-circle" /></span>
          <span class="strip-body">
            <span class="strip-value">{{ counts().ready }}</span>
            <span class="strip-label">{{ isBar ? ('At the bar' | t) : ('At the pass' | t) }}</span>
          </span>
        </div>
        <div class="strip-stat">
          <span class="strip-icon red"><app-icon name="clock" /></span>
          <span class="strip-body">
            <span class="strip-value">{{ oldest() }} <small>{{ 'min' | t }}</small></span>
            <span class="strip-label">{{ 'Oldest ticket' | t }}</span>
          </span>
        </div>
      </div>

      @if (queue().length) {
        <div class="board">
          @for (ticket of queue(); track ticket.id) {
            <article [class]="'ticket ticket-' + ticket.status.toLowerCase()">
              <div class="ticket-head">
                @if (ticket.queuePosition > 0) {
                  <span class="queue-chip" [class.tone-amber]="ticket.queuePosition === 1">{{ 'Q' | t }}{{ ticket.queuePosition }}</span>
                }
                <a class="ticket-num" [routerLink]="[stationPath, ticket.id]">#{{ ticket.number }}</a>
                @if (isTakeaway(ticket)) {
                  <span class="ticket-table"><app-icon name="receipt" style="font-size: 11px" /> {{ 'Takeaway' | t }}</span>
                } @else {
                  <span class="ticket-table">{{ 'Table' | t }} {{ ticket.table }}</span>
                }
                <span [class]="'ticket-time ' + timerTone(ticket)">
                  <app-icon name="clock" /> {{ elapsed(ticket) }} {{ 'min' | t }} </span>
              </div>
              <div class="ticket-waiter">
                <app-icon name="user" /> <strong>{{ ticket.waiterName }}</strong>
              </div>

              <div class="ticket-items">
                @for (item of ticket.items; track item.id) {
                  @if (item.status === 'ACTIVE' && ticket.status !== 'PENDING') {
                    <button class="ticket-item item-btn" type="button"
                            [disabled]="itemBusy() === item.id"
                            (click)="readyItem(ticket, item)">
                      <span class="ticket-qty">{{ item.qty }}</span>
                      <span class="item-main">
                        <span>
                          {{ item.name }}
                          @if (item.isAddOn) {
                            <span class="pill pill-amber no-dot add-on-pill">{{ 'Added' | t }}</span>
                          }
                        </span>
                        @if (item.nameAm) {
                          <span class="tiny muted" lang="am">{{ item.nameAm }}</span>
                        }
                        @if (item.notes) {
                          <span class="tiny" style="color: var(--amber)">{{ item.notes }}</span>
                        }
                      </span>
                      <span class="item-go">
                        {{ itemBusy() === item.id ? ('Working…' | t) : ('Ready' | t) }}
                        @if (itemBusy() !== item.id) {
                          <app-icon name="check" />
                        }
                      </span>
                    </button>
                  } @else {
                    <div class="ticket-item">
                      <span class="ticket-qty">{{ item.qty }}</span>
                      <span class="item-main">
                        <span [style.text-decoration]="item.status === 'CANCELLED' ? 'line-through' : 'none'" [style.opacity]="item.status === 'CANCELLED' ? 0.45 : 1">
                          {{ item.name }}
                          @if (item.isAddOn && item.status === 'ACTIVE') {
                            <span class="pill pill-amber no-dot add-on-pill">{{ 'Added' | t }}</span>
                          }
                        </span>
                        @if (item.nameAm) {
                          <span class="tiny muted" lang="am">{{ item.nameAm }}</span>
                        }
                        @if (item.notes) {
                          <span class="tiny" style="color: var(--amber)">{{ item.notes }}</span>
                        }
                      </span>
                      @if (item.status === 'CANCELLED') {
                        <span class="tiny muted">{{ 'Removed' | t }}</span>
                      } @else if (item.status === 'PREPARED') {
                        <span class="pill pill-green no-dot">{{ 'Ready' | t }}</span>
                      }
                    </div>
                  }
                }
              </div>

              <div class="ticket-actions">
                @if (ticket.status === 'PENDING') {
                  <button class="btn btn-primary btn-block" type="button" [disabled]="busy() === ticket.id" (click)="advance(ticket)">
                    <app-icon name="check" />
                    {{ busy() === ticket.id ? ('Working…' | t) : ('Accept' | t) }}
                  </button>
                } @else if (ticket.status === 'PREPARING' && hasActive(ticket)) {
                  <button class="btn btn-primary btn-block" type="button" [disabled]="busy() === ticket.id" (click)="readyAll(ticket)">
                    <app-icon name="check-circle" />
                    {{ busy() === ticket.id ? ('Working…' | t) : ('Ready all' | t) }}
                  </button>
                }
                <button class="btn btn-secondary btn-block" type="button" (click)="issueTicket.set(ticket)">
                  <app-icon name="alert" /> {{ 'Report issue' | t }} </button>
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
                    @if (isTakeaway(ticket)) {
                      <app-icon name="receipt" style="font-size: 12px" /> {{ 'Takeaway' | t }}
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
      <app-issue-dialog [ticket]="ticket" [station]="isBar ? 'BAR' : 'KITCHEN'" (closed)="issueTicket.set(null)" />
    }
  `,
})
export class KitchenBoardPage implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isBar = this.route.snapshot.data['station'] === 'BAR';
  protected readonly stationPath = this.isBar ? '/bar' : '/kitchen';
  protected readonly isTakeaway = isTakeaway;

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
    (this.isBar ? this.store.barTickets() : this.store.kitchenTickets()).filter((t) => t.status === 'READY'),
  );

  protected readonly counts = computed(() => ({
    new: this.queue().filter((t) => t.status === 'PENDING').length,
    preparing: this.queue().filter((t) => t.status === 'PREPARING').length,
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
      ? await this.store.barStatus(ticket.id, 'PREPARING')
      : await this.store.kitchenStatus(ticket.id, 'PREPARING');
    this.busy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async readyItem(ticket: KitchenTicket, item: KitchenTicket['items'][number]): Promise<void> {
    if (this.itemBusy()) return;
    this.itemBusy.set(item.id);
    const result = await this.store.readyItem(ticket.id, item.id, this.isBar ? 'BAR' : 'KITCHEN');
    this.itemBusy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected hasActive(ticket: KitchenTicket): boolean {
    return ticket.items.some((item) => item.status === 'ACTIVE');
  }

  protected async readyAll(ticket: KitchenTicket): Promise<void> {
    if (this.busy()) return;
    if (!this.hasActive(ticket)) {
      this.toast.show(translate('Every item on this ticket is already ready.'), 'error');
      return;
    }
    this.busy.set(ticket.id);
    const result = this.isBar
      ? await this.store.barStatus(ticket.id, 'READY')
      : await this.store.kitchenStatus(ticket.id, 'READY');
    this.busy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async refresh(): Promise<void> {
    this.now.set(Date.now());
    await this.loadStation();
  }
}
