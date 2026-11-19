import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KitchenTicket } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { IssueDialog } from '../../shared/issue-dialog';

@Component({
  selector: 'app-kitchen-board',
  imports: [RouterLink, Icon, IssueDialog],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Kitchen display · {{ station() }}</div>
          <h1 class="page-title">Kitchen board</h1>
          <p class="page-sub">Tickets appear the moment a waiter sends them. Work oldest first.</p>
        </div>
        <div class="head-actions">
          <div class="branch-btn" style="cursor: default">
            <app-icon name="clock" />
            <span class="num">{{ clockLabel() }}</span>
          </div>
          <button class="icon-btn" type="button" (click)="refresh()" aria-label="Refresh board">
            <app-icon name="retract" />
          </button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon" style="background: #f1ede7; color: var(--muted)"><app-icon name="bell" /></div>
          <div class="stat-label">New tickets</div>
          <div class="stat-value">{{ counts().new }}</div>
          <div class="stat-foot">Waiting for accept</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--orange-soft); color: var(--orange)"><app-icon name="utensils" /></div>
          <div class="stat-label">Preparing</div>
          <div class="stat-value">{{ counts().preparing }}</div>
          <div class="stat-foot">On the line</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">At the pass</div>
          <div class="stat-value">{{ counts().ready }}</div>
          <div class="stat-foot">Waiting for waiter</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="clock" /></div>
          <div class="stat-label">Oldest ticket</div>
          <div class="stat-value">{{ oldest() }} <small>min</small></div>
          <div class="stat-foot">Target under 15 min</div>
        </div>
      </div>

      @if (queue().length) {
        <div class="board">
          @for (ticket of queue(); track ticket.id) {
            <article [class]="'ticket ticket-' + ticket.status.toLowerCase()">
              <div class="ticket-head">
                <a class="ticket-num" [routerLink]="['/kitchen', ticket.id]">#{{ ticket.number }}</a>
                <span class="ticket-table">Table {{ ticket.table }}</span>
                <span [class]="'ticket-time ' + timerTone(ticket)">
                  <app-icon name="clock" /> {{ elapsed(ticket) }} min
                </span>
              </div>

              <div class="ticket-items">
                @for (item of ticket.items; track item.id) {
                  <div class="ticket-item">
                    <span class="ticket-qty">{{ item.qty }}</span>
                    <div style="flex: 1">
                      <span [style.text-decoration]="item.status === 'CANCELLED' ? 'line-through' : 'none'" [style.opacity]="item.status === 'CANCELLED' ? 0.45 : 1">
                        {{ item.name }}
                      </span>
                      @if (item.notes) {
                        <div class="tiny" style="color: var(--amber)">{{ item.notes }}</div>
                      }
                    </div>
                  </div>
                }
              </div>

              <div class="ticket-actions">
                <button class="btn btn-primary btn-block" type="button" [disabled]="busy() === ticket.id" (click)="advance(ticket)">
                  <app-icon name="check" />
                  {{ busy() === ticket.id ? 'Working…' : ticket.status === 'PENDING' ? 'Accept' : 'Mark ready' }}
                </button>
                <button class="btn btn-secondary btn-block" type="button" (click)="issueTicket.set(ticket)">
                  <app-icon name="alert" /> Report issue
                </button>
              </div>

              <div class="ticket-foot">
                <span [class]="'pill ' + (ticket.status === 'PENDING' ? 'pill-amber' : 'pill-orange')">
                  {{ ticket.status === 'PENDING' ? 'New' : 'Preparing' }}
                </span>
                <span class="tiny muted">{{ ticket.waiterName }} · {{ ticket.items.length }} lines</span>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="card empty" style="padding: 54px 20px">
          <app-icon name="check-circle" style="color: var(--green)" />
          <strong>Line is clear</strong>
          <p>No new or preparing tickets. New orders will appear here automatically.</p>
        </div>
      }

      @if (ready().length) {
        <div class="card mt-4">
          <div class="card-head">
            <div>
              <div class="card-title">At the pass</div>
              <div class="card-sub">Plated and waiting for the waiter to pick up</div>
            </div>
            <span class="pill pill-green no-dot">{{ ready().length }} waiting</span>
          </div>
          <div class="list">
            @for (ticket of ready(); track ticket.id) {
              <a class="list-row" [routerLink]="['/kitchen', ticket.id]">
                <span class="ticket-num" style="font-size: 16px">#{{ ticket.number }}</span>
                <div class="list-main">
                  <strong>Table {{ ticket.table }}</strong>
                  <span>{{ ticket.items.length }} lines · {{ elapsed(ticket) }} min on the board</span>
                </div>
                <span class="pill pill-green">Ready</span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        </div>
      }
    </div>

    @if (issueTicket(); as ticket) {
      <app-issue-dialog [ticket]="ticket" (closed)="issueTicket.set(null)" />
    }
  `,
})
export class KitchenBoardPage implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly station = computed(() => {
    const branch = this.store.settings().branch;
    return branch ? `${branch} kitchen` : 'kitchen';
  });
  protected readonly issueTicket = signal<KitchenTicket | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  private readonly timer = window.setInterval(() => {
    this.now.set(Date.now());
    void this.store.loadKitchen();
  }, 20000);

  protected readonly queue = computed(() => this.store.kitchenQueue());
  protected readonly ready = computed(() => this.store.kitchenTickets().filter((t) => t.status === 'READY'));

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
    new Date(this.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  );

  async ngOnInit(): Promise<void> {
    await this.store.loadKitchen();
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
    const result = await this.store.kitchenStatus(ticket.id, ticket.status === 'PENDING' ? 'PREPARING' : 'READY');
    this.busy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async refresh(): Promise<void> {
    this.now.set(Date.now());
    await this.store.loadKitchen();
  }
}
