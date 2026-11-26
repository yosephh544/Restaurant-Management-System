import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, translate } from '../core/i18n';
import { FormsModule } from '@angular/forms';
import { ISSUE_LABEL, IssueReason, ItemStatus, KitchenTicket, PaymentStatus, Station } from '../core/models';
import { Store } from '../core/store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-issue-dialog',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h3>{{ 'Report an issue' | t }}</h3>
            <p>{{ 'Order #' | t }}{{ ticket().number }} {{ '· Table' | t }} {{ ticket().table }}</p>
          </div>
          <button class="modal-close" type="button" (click)="closed.emit()" [attr.aria-label]="'Close' | t">
            <app-icon name="x" />
          </button>
        </div>

        <div class="modal-body">
          <div class="field">
            <span class="label">{{ 'What is affected?' | t }}</span>
            <div class="seg" style="align-self: flex-start">
              <button type="button" [class.active]="scope() === 'ITEM'" (click)="scope.set('ITEM')">{{ 'One item' | t }}</button>
              <button type="button" [class.active]="scope() === 'ORDER'" (click)="scope.set('ORDER')">{{ 'Whole ticket' | t }}</button>
            </div>
          </div>

          @if (scope() === 'ITEM') {
            <div class="field mt-3">
              <label class="label" for="issue-item">{{ 'Item' | t }}</label>
              <select id="issue-item" class="select" [ngModel]="itemId()" (ngModelChange)="itemOverride.set($event)">
                @for (item of openItems(); track item.id) {
                  <option [value]="item.id">{{ item.name }} ×{{ item.qty }}</option>
                }
              </select>
            </div>
          }

          <div class="field mt-3">
            <label class="label" for="issue-reason">{{ 'Reason' | t }}</label>
            <select id="issue-reason" class="select" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
              @for (option of reasons; track option.value) {
                <option [value]="option.value">{{ option.label | t }}</option>
              }
            </select>
          </div>

          <div class="field mt-3">
            <label class="label" for="issue-note">{{ 'Note for the floor (optional)' | t }}</label>
            <textarea id="issue-note" class="textarea" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
          </div>

          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line)">
            <div class="row" style="align-items: flex-start">
              <app-icon name="alert" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">{{ 'This removes the item from the bill' | t }}</strong>
                <p style="color: var(--red)"> {{ "The cancellation is recorded against this order and appears in the manager's issue list. The waiter can reorder the affected items." | t }} </p>
              </div>
            </div>
          </div>

          @if (ticket().paymentStatus === PaymentStatus.Paid) {
            <div class="pending-box mt-3" style="background: var(--amber-soft); border-color: var(--amber-line)">
              <div class="row" style="align-items: flex-start">
                <app-icon name="cash" style="color: var(--amber)" />
                <div>
                  <strong style="color: var(--amber)">{{ 'This ticket is already paid' | t }}</strong>
                  <p style="color: var(--amber)"> {{ 'Cancelling flags the payment as refund due. The cashier or manager must return the money from the Payments page.' | t }} </p>
                </div>
              </div>
            </div>
          }

          @if (error()) {
            <div class="auth-error mt-3">{{ error() }}</div>
          }
        </div>

        <div class="modal-foot">
          <button class="btn btn-ghost" type="button" (click)="closed.emit()">{{ 'Cancel' | t }}</button>
          <button class="btn btn-danger" type="button" [disabled]="busy()" (click)="submit()">
            <app-icon name="alert" />
            {{ busy() ? ('Reporting…' | t) : scope() === 'ORDER' ? ('Cancel the ticket' | t) : ('Mark item unavailable' | t) }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class IssueDialog {
  protected readonly PaymentStatus = PaymentStatus;

  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  readonly ticket = input.required<KitchenTicket>();
  readonly station = input<Station>(Station.Kitchen);
  readonly closed = output<void>();

  protected readonly reasons: { value: IssueReason; label: string }[] = [
    { value: IssueReason.OutOfStock, label: ISSUE_LABEL[IssueReason.OutOfStock] },
    { value: IssueReason.EquipmentIssue, label: ISSUE_LABEL[IssueReason.EquipmentIssue] },
    { value: IssueReason.PrepDelay, label: ISSUE_LABEL[IssueReason.PrepDelay] },
    { value: IssueReason.Other, label: ISSUE_LABEL[IssueReason.Other] },
  ];

  protected readonly scope = signal<'ITEM' | 'ORDER'>('ITEM');
  protected readonly reason = signal<IssueReason>(IssueReason.OutOfStock);
  protected readonly note = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly openItems = computed(() => this.ticket().items.filter((i) => i.status !== ItemStatus.Cancelled));
  protected readonly itemOverride = signal<string | null>(null);
  protected readonly itemId = computed(
    () => this.itemOverride() ?? this.openItems()[0]?.id ?? this.ticket().items[0]?.id ?? '',
  );

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    const ticket = this.ticket();
    const orderItemId = this.scope() === 'ITEM' ? this.itemId() : undefined;
    if (this.scope() === 'ITEM' && !orderItemId) {
      this.error.set(translate('Choose the affected item.'));
      return;
    }

    this.busy.set(true);
    const result = this.station() === Station.Bar
      ? await this.store.cancelBar(ticket.id, this.reason(), this.note().trim(), orderItemId)
      : await this.store.cancelKitchen(ticket.id, this.reason(), this.note().trim(), orderItemId);
    this.busy.set(false);

    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.toast.show(translate(this.scope() === 'ORDER' ? 'Ticket cancelled — the waiter can reorder' : 'Item marked unavailable'));
    this.closed.emit();
  }
}
