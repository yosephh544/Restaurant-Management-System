import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { clock, KitchenTicket } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { IssueDialog } from '../../shared/issue-dialog';

@Component({
  selector: 'app-kitchen-ticket',
  imports: [RouterLink, Icon, IssueDialog, TranslatePipe],
  template: `
    @if (ticket(); as t) {
      <div class="page">
        <div class="detail-head">
          <div>
            <a class="back-link" [routerLink]="stationPath"><app-icon name="arrow-left" /> {{ 'Back to board' | t }}</a>
            <div class="row" style="gap: 10px; flex-wrap: wrap">
              <h1 class="page-title">#{{ t.number }}</h1>
              <span class="ticket-table">{{ 'Table' | t }} {{ t.table }}</span>
              <span [class]="'pill ' + (t.status === 'PENDING' ? 'pill-amber' : t.status === 'PREPARING' ? 'pill-orange' : 'pill-green')">
                {{ statusLabel(t) }}
              </span>
            </div>
            <p class="page-sub">
              {{ t.waiterName }} {{ '· opened' | t }} {{ clock(t.createdAt) }} · {{ elapsed() }} {{ 'min on the board' | t }} </p>
          </div>
          <div class="head-actions">
            @if (t.status === 'PENDING' || t.status === 'PREPARING') {
              <button class="btn btn-secondary" type="button" (click)="showIssue.set(true)">
                <app-icon name="alert" /> {{ 'Report issue' | t }} </button>
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="advance()">
                <app-icon name="check" /> {{ busy() ? ('Working…' | t) : t.status === 'PENDING' ? ('Accept ticket' | t) : ('Mark ready' | t) }}
              </button>
            }
          </div>
        </div>

        @if (t.status === 'READY') {
          <div class="pending-box" style="background: var(--green-soft); border-color: var(--green-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="check-circle" style="color: var(--green)" />
              <div>
                <strong style="color: var(--green)">{{ isBar ? ('Poured and at the bar' | t) : ('Plated and at the pass' | t) }}</strong>
                <p style="color: var(--green)">{{ 'The waiter has been notified on their board.' | t }}</p>
              </div>
            </div>
          </div>
        }

        <div class="split">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">{{ 'Ticket items' | t }}</div>
                <div class="card-sub">{{ t.items.length }} {{ 'lines · no prices shown in the' | t }} {{ isBar ? ('bar' | t) : ('kitchen' | t) }}</div>
              </div>
              <span class="ticket-time" [class.warn]="elapsed() >= 12" [class.late]="elapsed() >= 20">
                <app-icon name="clock" /> {{ elapsed() }} {{ 'min' | t }} </span>
            </div>
            <div style="padding: 8px 18px 18px">
              @for (item of t.items; track item.id) {
                <div class="between" style="padding: 11px 0; border-bottom: 1px dashed var(--line)">
                  <div class="row">
                    <span class="ticket-qty" style="width: 28px; height: 28px; font-size: 12px">{{ item.qty }}</span>
                    <div>
                      <strong [style.text-decoration]="item.status === 'CANCELLED' ? 'line-through' : 'none'" [style.opacity]="item.status === 'CANCELLED' ? 0.5 : 1">
                        {{ item.name }}
                      </strong>
                      @if (item.notes) {
                        <div class="tiny" style="color: var(--amber)">{{ item.notes }}</div>
                      }
                    </div>
                  </div>
                  <div class="row" style="gap: 10px">
                    <span class="tiny muted">{{ item.status === 'CANCELLED' ? ('Removed' | t) : item.status === 'PREPARED' ? ('Prepared' | t) : isBar ? ('To prepare' | t) : ('To cook' | t) }}</span>
                    @if (item.status === 'ACTIVE' && t.status !== 'PENDING') {
                      <button class="btn btn-sm btn-secondary" type="button"
                              [disabled]="itemBusy() === item.id"
                              (click)="readyItem(item)">
                        {{ itemBusy() === item.id ? ('Working…' | t) : ('Ready' | t) }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>

          <aside class="stack">
            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 10px">{{ 'Ticket details' | t }}</div>
              <div class="stack">
                <div class="between small"><span class="muted">{{ 'Sent' | t }}</span><span class="strong">{{ clock(t.createdAt) }}</span></div>
                <div class="between small"><span class="muted">{{ 'Elapsed' | t }}</span><span class="strong">{{ elapsed() }} {{ 'min' | t }}</span></div>
                <div class="between small"><span class="muted">{{ 'Payment' | t }}</span><span class="strong">{{ t.paymentStatus === 'PAID' ? ('Paid' | t) : ('Open' | t) }}</span></div>
              </div>
            </div>

            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 8px">{{ 'Floor contact' | t }}</div>
              <p class="small muted">{{ t.waiterName }} {{ 'is responsible for this table.' | t }}</p>
              <p class="tiny muted mt-2"> {{ 'Report an unavailable item here. It is removed from the bill and the waiter can reorder the ticket without any payment being affected.' | t }} </p>
            </div>
          </aside>
        </div>
      </div>

      @if (showIssue()) {
        <app-issue-dialog [ticket]="t" [station]="isBar ? 'BAR' : 'KITCHEN'" (closed)="showIssue.set(false)" />
      }
    } @else {
      <div class="page">
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>{{ 'Ticket not found' | t }}</strong>
          <p>{{ 'It may already be served or cancelled.' | t }}</p>
          <a class="btn btn-primary btn-sm mt-3" [routerLink]="stationPath">{{ 'Back to board' | t }}</a>
        </div>
      </div>
    }
  `,
})
export class KitchenTicketPage implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly isBar = this.route.snapshot.data['station'] === 'BAR';
  protected readonly stationPath = this.isBar ? '/bar' : '/kitchen';
  protected readonly clock = clock;
  protected readonly showIssue = signal(false);
  protected readonly busy = signal(false);
  protected readonly itemBusy = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  private readonly timer = window.setInterval(() => this.now.set(Date.now()), 20000);

  protected readonly ticket = computed(() => {
    const tickets = this.isBar ? this.store.barTickets() : this.store.kitchenTickets();
    return tickets.find((t) => t.id === this.id);
  });

  async ngOnInit(): Promise<void> {
    await (this.isBar ? this.store.loadBar() : this.store.loadKitchen());
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected elapsed(): number {
    const ticket = this.ticket();
    if (!ticket) return 0;
    return Math.max(0, Math.floor((this.now() - new Date(ticket.createdAt).getTime()) / 60000));
  }

  protected statusLabel(ticket: KitchenTicket): string {
    return translate(ticket.status === 'PENDING' ? 'New' : ticket.status === 'PREPARING' ? 'Preparing' : 'Ready');
  }

  protected async advance(): Promise<void> {
    const ticket = this.ticket();
    if (!ticket || this.busy()) return;
    this.busy.set(true);
    const next: 'PREPARING' | 'READY' = ticket.status === 'PENDING' ? 'PREPARING' : 'READY';
    const result = this.isBar
      ? await this.store.barStatus(ticket.id, next)
      : await this.store.kitchenStatus(ticket.id, next);
    this.busy.set(false);
    if (!result.ok) this.toast.show(result.error, 'error');
  }

  protected async readyItem(item: KitchenTicket['items'][number]): Promise<void> {
    const ticket = this.ticket();
    if (!ticket || this.itemBusy()) return;
    this.itemBusy.set(item.id);
    const result = await this.store.readyItem(ticket.id, item.id, this.isBar ? 'BAR' : 'KITCHEN');
    this.itemBusy.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
  }
}
