import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ageLabel, Order } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';
import { IssueDialog } from '../../shared/issue-dialog';

@Component({
  selector: 'app-kitchen-board',
  imports: [RouterLink, Icon, IssueDialog],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Kitchen display · {{ station }}</div>
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
          @for (order of queue(); track order.id) {
            <article [class]="'ticket ticket-' + order.status.toLowerCase()">
              <div class="ticket-head">
                <a class="ticket-num" [routerLink]="['/kitchen', order.id]">#{{ order.number }}</a>
                <span class="ticket-table">Table {{ order.table }}</span>
                <span [class]="'ticket-time ' + timerTone(order)">
                  <app-icon name="clock" /> {{ elapsed(order) }} min
                </span>
              </div>

              <div class="ticket-items">
                @for (line of order.lines; track line.id) {
                  <div class="ticket-item">
                    <span class="ticket-qty">{{ line.qty }}</span>
                    <div style="flex: 1">
                      <span [style.text-decoration]="line.status === 'CANCELLED' ? 'line-through' : 'none'" [style.opacity]="line.status === 'CANCELLED' ? 0.45 : 1">
                        {{ line.name }}
                      </span>
                      @if (line.notes) {
                        <div class="tiny" style="color: var(--amber)">{{ line.notes }}</div>
                      }
                    </div>
                  </div>
                }
              </div>

              @if (order.notes) {
                <div class="ticket-note"><app-icon name="alert" /> {{ order.notes }}</div>
              }

              <div class="ticket-actions">
                @if (order.status === 'PENDING') {
                  <button class="btn btn-primary btn-block" type="button" (click)="advance(order.id)">
                    <app-icon name="check" /> Accept
                  </button>
                } @else {
                  <button class="btn btn-primary btn-block" type="button" (click)="advance(order.id)">
                    <app-icon name="check" /> Mark ready
                  </button>
                }
                <button class="btn btn-secondary btn-block" type="button" (click)="issueOrder.set(order)">
                  <app-icon name="alert" /> Report issue
                </button>
              </div>

              <div class="ticket-foot">
                <span [class]="'pill ' + (order.status === 'PENDING' ? 'pill-amber' : 'pill-orange')">
                  {{ order.status === 'PENDING' ? 'New' : 'Preparing' }}
                </span>
                <span class="tiny muted">{{ order.waiterName }} · {{ order.lines.length }} lines</span>
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
            @for (order of ready(); track order.id) {
              <a class="list-row" [routerLink]="['/kitchen', order.id]">
                <span class="ticket-num" style="font-size: 16px">#{{ order.number }}</span>
                <div class="list-main">
                  <strong>Table {{ order.table }}</strong>
                  <span>{{ order.lines.length }} lines · ready {{ ageLabel(order.readyAt ?? order.createdAt) }} ago</span>
                </div>
                <span class="pill pill-green">Ready</span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        </div>
      }
    </div>

    @if (issueOrder(); as order) {
      <app-issue-dialog [order]="order" (closed)="issueOrder.set(null)" />
    }
  `,
})
export class KitchenBoardPage implements OnDestroy {
  private readonly store = inject(Store);

  protected readonly station = this.store.settings().branch + ' kitchen';
  protected readonly issueOrder = signal<Order | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly ageLabel = ageLabel;
  private readonly timer = window.setInterval(() => this.now.set(Date.now()), 20000);

  protected readonly queue = computed(() => this.store.kitchenQueue());
  protected readonly ready = computed(() => this.store.readyOrders());

  protected readonly counts = computed(() => ({
    new: this.queue().filter((o) => o.status === 'PENDING').length,
    preparing: this.queue().filter((o) => o.status === 'PREPARING').length,
    ready: this.ready().length,
  }));

  protected readonly oldest = computed(() => {
    const queue = this.queue();
    if (!queue.length) return 0;
    const oldest = queue[0];
    return Math.floor((this.now() - new Date(oldest.createdAt).getTime()) / 60000);
  });

  protected readonly clockLabel = computed(() =>
    new Date(this.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  );

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected elapsed(order: Order): number {
    return Math.max(0, Math.floor((this.now() - new Date(order.createdAt).getTime()) / 60000));
  }

  protected timerTone(order: Order): string {
    const minutes = this.elapsed(order);
    if (minutes >= 20) return 'late';
    if (minutes >= 12) return 'warn';
    return '';
  }

  protected advance(id: string): void {
    this.store.advance(id);
  }

  protected refresh(): void {
    this.now.set(Date.now());
  }
}
