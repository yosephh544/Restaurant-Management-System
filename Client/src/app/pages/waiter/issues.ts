import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ageLabel, Issue, issueLabel, money, Order } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-waiter-issues',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Waiter workspace</div>
          <h1 class="page-title">Kitchen &amp; bar issues</h1>
          <p class="page-sub">Tickets the kitchen could not finish, and items they flagged.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/waiter/orders"><app-icon name="receipt" /> My orders</a>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">Need reorder</div>
          <div class="stat-value">{{ needReorder().length }}</div>
          <div class="stat-foot">Cancelled with no replacement</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="bell" /></div>
          <div class="stat-label">Open kitchen notes</div>
          <div class="stat-value">{{ openUpdates().length }}</div>
          <div class="stat-foot">On your tickets</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="retract" /></div>
          <div class="stat-label">Recovered</div>
          <div class="stat-value">{{ recovered() }}</div>
          <div class="stat-foot">Cancelled tickets you reordered</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Tickets to recover</div>
                <div class="card-sub">No payment exists for these tickets, so nothing is refunded</div>
              </div>
            </div>

            @if (needReorder().length) {
              <div class="list">
                @for (order of needReorder(); track order.id) {
                  <div class="list-row" style="align-items: flex-start">
                    <span class="tl-dot cancel" style="margin-top: 2px"><app-icon name="alert" /></span>
                    <div class="list-main">
                      <strong>Order #{{ order.number }} · Table {{ order.table }}</strong>
                      <span>{{ cancelReason(order) }} · {{ ageLabel(order.createdAt) }} ago</span>
                      <div class="tiny muted" style="margin-top: 3px">{{ items(order) }}</div>
                      <div class="row mt-2" style="gap: 6px">
                        <button class="btn btn-primary btn-sm" type="button" (click)="reorder(order)">
                          <app-icon name="retract" /> Reorder
                        </button>
                        <a class="btn btn-secondary btn-sm" [routerLink]="['/waiter/orders', order.id]">View ticket</a>
                      </div>
                    </div>
                    <span class="ticket-num" style="font-size: 15px; color: var(--muted)">{{ money(order.total) }}</span>
                  </div>
                }
              </div>
            } @else {
              <div class="empty">
                <app-icon name="check-circle" />
                <strong>All clear</strong>
                <p>No cancelled tickets are waiting for a replacement.</p>
              </div>
            }
          </div>

          <div class="card">
            <div class="card-head">
              <div class="card-title">Recently resolved</div>
              <span class="tiny muted">{{ resolved().length }} updates</span>
            </div>
            @if (resolved().length) {
              <div class="list">
                @for (issue of resolved(); track issue.id) {
                  <div class="list-row">
                    <span class="tl-dot"><app-icon name="check" /></span>
                    <div class="list-main">
                      <strong>Order #{{ issue.orderNumber }} · {{ issue.item }}</strong>
                      <span>{{ reasonLabel(issue.reason) }} · resolved by {{ issue.resolvedBy || 'manager' }}</span>
                    </div>
                    <span class="tiny muted">{{ ageLabel(issue.createdAt) }} ago</span>
                  </div>
                }
              </div>
            } @else {
              <div class="empty" style="padding: 26px">
                <p>Resolved kitchen notes will show up here.</p>
              </div>
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Open kitchen notes</div>
              <div class="card-sub">Flags recorded against your orders</div>
            </div>
            <span [class]="'pill ' + (openUpdates().length ? 'pill-amber' : 'pill-green')">
              {{ openUpdates().length ? openUpdates().length + ' open' : 'None' }}
            </span>
          </div>

          @if (openUpdates().length) {
            <div class="list">
              @for (issue of openUpdates(); track issue.id) {
                <div class="list-row" style="align-items: flex-start">
                  <span class="tl-dot" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="alert" /></span>
                  <div class="list-main">
                    <strong>{{ issue.item }} · Order #{{ issue.orderNumber }}</strong>
                    <span>Table {{ issue.table }} · {{ reasonLabel(issue.reason) }}</span>
                    @if (issue.note) {
                      <div class="ticket-note" style="margin: 6px 0 0">{{ issue.note }}</div>
                    }
                  </div>
                  <a class="link-btn" [routerLink]="['/waiter/orders', issue.orderId]">Open <app-icon name="chevron-right" /></a>
                </div>
              }
            </div>
          } @else {
            <div class="empty">
              <app-icon name="check-circle" />
              <strong>Nothing flagged</strong>
              <p>The kitchen has no open notes on your tickets.</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class WaiterIssuesPage implements OnInit {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  private readonly waiterId = this.auth.user()?.id ?? '';

  protected readonly needReorder = computed(() =>
    this.store
      .orders()
      .filter(
        (o) =>
          o.waiterId === this.waiterId &&
          o.status === 'CANCELLEDBYKITCHEN' &&
          !this.store.orders().some((child) => child.parentOrderId === o.id),
      ),
  );

  protected readonly openUpdates = computed(() =>
    this.store.issues().filter((i) => !i.resolved && this.store.order(i.orderId)?.waiterId === this.waiterId),
  );

  protected readonly resolved = computed(() =>
    this.store
      .issues()
      .filter((i) => i.resolved && this.store.order(i.orderId)?.waiterId === this.waiterId)
      .slice(0, 6),
  );

  protected readonly recovered = computed(
    () =>
      this.store
        .orders()
        .filter(
          (o) =>
            o.waiterId === this.waiterId &&
            o.status === 'CANCELLEDBYKITCHEN' &&
            this.store.orders().some((child) => child.parentOrderId === o.id),
        ).length,
  );

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadOrders(), this.store.loadIssues()]);
  }

  protected items(order: Order): string {
    return order.lines.map((l) => `${l.name} ×${l.qty}`).join(', ');
  }

  protected cancelReason(order: Order): string {
    const issue = this.store.issues().find((i) => i.orderId === order.id);
    return issue ? this.reasonLabel(issue.reason) : 'Cancelled by kitchen';
  }

  protected reasonLabel(reason: Issue['reason']): string {
    return issueLabel(reason);
  }

  protected async reorder(order: Order): Promise<void> {
    const live = order.lines.filter((l) => l.status !== 'CANCELLED');
    const source = live.length ? live : order.lines;
    if (!source.length) {
      this.toast.show('This ticket has no items to reorder', 'error');
      return;
    }
    const result = await this.store.reorder(
      order.id,
      source.map((l) => ({ menuItemId: l.itemId, quantity: l.qty, notes: l.notes })),
    );
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(`Replacement #${result.data.number} sent to kitchen`);
    await this.router.navigate(['/waiter/orders', result.data.id]);
  }
}
