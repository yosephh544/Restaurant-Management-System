import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ageLabel, clock, Order } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';
import { IssueDialog } from '../../shared/issue-dialog';

@Component({
  selector: 'app-kitchen-ticket',
  imports: [RouterLink, Icon, IssueDialog],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="detail-head">
          <div>
            <a class="back-link" routerLink="/kitchen"><app-icon name="arrow-left" /> Back to board</a>
            <div class="row" style="gap: 10px; flex-wrap: wrap">
              <h1 class="page-title">#{{ o.number }}</h1>
              <span class="ticket-table">Table {{ o.table }}</span>
              <span [class]="'pill ' + (o.status === 'PENDING' ? 'pill-amber' : o.status === 'PREPARING' ? 'pill-orange' : o.status === 'READY' ? 'pill-green' : 'pill-grey')">
                {{ statusLabel() }}
              </span>
            </div>
            <p class="page-sub">
              {{ o.waiterName }} · opened {{ clock(o.createdAt) }} · {{ elapsed() }} min on the board
            </p>
          </div>
          <div class="head-actions">
            @if (o.status === 'PENDING' || o.status === 'PREPARING') {
              <button class="btn btn-secondary" type="button" (click)="showIssue.set(true)">
                <app-icon name="alert" /> Report issue
              </button>
              <button class="btn btn-primary" type="button" (click)="advance()">
                <app-icon name="check" /> {{ o.status === 'PENDING' ? 'Accept ticket' : 'Mark ready' }}
              </button>
            }
          </div>
        </div>

        @if (o.status === 'READY') {
          <div class="pending-box" style="background: var(--green-soft); border-color: var(--green-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="check-circle" style="color: var(--green)" />
              <div>
                <strong style="color: var(--green)">Plated and at the pass</strong>
                <p style="color: var(--green)">
                  Ready {{ ageLabel(o.readyAt ?? o.createdAt) }} ago. The waiter has been notified on their board.
                </p>
              </div>
            </div>
          </div>
        }

        @if (o.status === 'CANCELLED') {
          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="alert" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">Ticket cancelled</strong>
                <p style="color: var(--red)">{{ o.cancelReason || 'No reason recorded' }} · the waiter can reorder it.</p>
              </div>
            </div>
          </div>
        }

        <div class="split">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Ticket items</div>
                <div class="card-sub">{{ o.lines.length }} lines · no prices shown in the kitchen</div>
              </div>
              <span class="ticket-time" [class.warn]="elapsed() >= 12" [class.late]="elapsed() >= 20">
                <app-icon name="clock" /> {{ elapsed() }} min
              </span>
            </div>
            <div style="padding: 8px 18px 18px">
              @for (line of o.lines; track line.id) {
                <div class="between" style="padding: 11px 0; border-bottom: 1px dashed var(--line)">
                  <div class="row">
                    <span class="ticket-qty" style="width: 28px; height: 28px; font-size: 12px">{{ line.qty }}</span>
                    <div>
                      <strong [style.text-decoration]="line.status === 'CANCELLED' ? 'line-through' : 'none'" [style.opacity]="line.status === 'CANCELLED' ? 0.5 : 1">
                        {{ line.name }}
                      </strong>
                      @if (line.notes) {
                        <div class="tiny" style="color: var(--amber)">{{ line.notes }}</div>
                      }
                    </div>
                  </div>
                  <span class="tiny muted">{{ line.status === 'CANCELLED' ? 'Removed' : line.status === 'PREPARED' ? 'Prepared' : 'To cook' }}</span>
                </div>
              }

              @if (o.notes) {
                <div class="ticket-note" style="margin: 14px 0 0"><app-icon name="alert" /> {{ o.notes }}</div>
              }
            </div>
          </div>

          <aside class="stack">
            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 10px">Ticket timeline</div>
              <div class="stack">
                <div class="between small"><span class="muted">Sent</span><span class="strong">{{ clock(o.createdAt) }}</span></div>
                <div class="between small"><span class="muted">Accepted</span><span class="strong">{{ clock(o.preparingAt) }}</span></div>
                <div class="between small"><span class="muted">Ready</span><span class="strong">{{ clock(o.readyAt) }}</span></div>
                <div class="between small"><span class="muted">Served</span><span class="strong">{{ clock(o.servedAt) }}</span></div>
                @if (o.preparingAt && o.readyAt) {
                  <div class="between small" style="border-top: 1px solid var(--line); padding-top: 8px">
                    <span class="muted">Prep time</span>
                    <span class="strong">{{ prepMinutes() }} min</span>
                  </div>
                }
              </div>
            </div>

            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 8px">Floor contact</div>
              <p class="small muted">{{ o.waiterName }} is responsible for this table.</p>
              <p class="tiny muted mt-2">
                Report an unavailable item here. It is removed from the bill and the waiter can reorder
                the ticket without any payment being affected.
              </p>
            </div>
          </aside>
        </div>
      </div>

      @if (showIssue()) {
        <app-issue-dialog [order]="o" (closed)="showIssue.set(false)" />
      }
    } @else {
      <div class="page">
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>Ticket not found</strong>
          <p>It may already be served or cancelled.</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/kitchen">Back to board</a>
        </div>
      </div>
    }
  `,
})
export class KitchenTicketPage implements OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly clock = clock;
  protected readonly ageLabel = ageLabel;
  protected readonly showIssue = signal(false);
  protected readonly now = signal(Date.now());
  private readonly timer = window.setInterval(() => this.now.set(Date.now()), 20000);

  protected readonly order = computed(() => this.store.order(this.id) as Order | undefined);

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected elapsed(): number {
    const order = this.order();
    if (!order) return 0;
    return Math.max(0, Math.floor((this.now() - new Date(order.createdAt).getTime()) / 60000));
  }

  protected prepMinutes(): number {
    const order = this.order();
    if (!order?.preparingAt || !order.readyAt) return 0;
    return Math.max(
      0,
      Math.round((new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) / 60000),
    );
  }

  protected statusLabel(): string {
    const status = this.order()?.status;
    return status === 'PENDING' ? 'New' : status === 'PREPARING' ? 'Preparing' : status === 'READY' ? 'Ready' : 'Closed';
  }

  protected advance(): void {
    const order = this.order();
    if (!order) return;
    this.store.advance(order.id);
  }
}
