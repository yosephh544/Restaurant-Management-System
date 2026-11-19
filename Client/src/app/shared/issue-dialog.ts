import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ISSUE_LABEL, IssueReason, KitchenTicket } from '../core/models';
import { Store } from '../core/store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-issue-dialog',
  imports: [FormsModule, Icon],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h3>Report an issue</h3>
            <p>Order #{{ ticket().number }} · Table {{ ticket().table }}</p>
          </div>
          <button class="modal-close" type="button" (click)="closed.emit()" aria-label="Close">
            <app-icon name="x" />
          </button>
        </div>

        <div class="modal-body">
          <div class="field">
            <span class="label">What is affected?</span>
            <div class="seg" style="align-self: flex-start">
              <button type="button" [class.active]="scope() === 'ITEM'" (click)="scope.set('ITEM')">One item</button>
              <button type="button" [class.active]="scope() === 'ORDER'" (click)="scope.set('ORDER')">Whole ticket</button>
            </div>
          </div>

          @if (scope() === 'ITEM') {
            <div class="field mt-3">
              <label class="label" for="issue-item">Item</label>
              <select id="issue-item" class="select" [ngModel]="itemId()" (ngModelChange)="itemOverride.set($event)">
                @for (item of openItems(); track item.id) {
                  <option [value]="item.id">{{ item.name }} ×{{ item.qty }}</option>
                }
              </select>
            </div>
          }

          <div class="field mt-3">
            <label class="label" for="issue-reason">Reason</label>
            <select id="issue-reason" class="select" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
              @for (option of reasons; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>

          <div class="field mt-3">
            <label class="label" for="issue-note">Note for the floor (optional)</label>
            <textarea id="issue-note" class="textarea" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
          </div>

          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line)">
            <div class="row" style="align-items: flex-start">
              <app-icon name="alert" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">This removes the item from the bill</strong>
                <p style="color: var(--red)">
                  The cancellation is recorded against this order and appears in the manager's issue
                  list. The waiter can reorder the affected items.
                </p>
              </div>
            </div>
          </div>

          @if (error()) {
            <div class="auth-error mt-3">{{ error() }}</div>
          }
        </div>

        <div class="modal-foot">
          <button class="btn btn-ghost" type="button" (click)="closed.emit()">Cancel</button>
          <button class="btn btn-danger" type="button" [disabled]="busy()" (click)="submit()">
            <app-icon name="alert" />
            {{ busy() ? 'Reporting…' : scope() === 'ORDER' ? 'Cancel the ticket' : 'Mark item unavailable' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class IssueDialog {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  readonly ticket = input.required<KitchenTicket>();
  readonly closed = output<void>();

  protected readonly reasons: { value: IssueReason; label: string }[] = [
    { value: 'OUT_OF_STOCK', label: ISSUE_LABEL.OUT_OF_STOCK },
    { value: 'EQUIPMENT_ISSUE', label: ISSUE_LABEL.EQUIPMENT_ISSUE },
    { value: 'PREP_DELAY', label: ISSUE_LABEL.PREP_DELAY },
    { value: 'OTHER', label: ISSUE_LABEL.OTHER },
  ];

  protected readonly scope = signal<'ITEM' | 'ORDER'>('ITEM');
  protected readonly reason = signal<IssueReason>('OUT_OF_STOCK');
  protected readonly note = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly openItems = computed(() => this.ticket().items.filter((i) => i.status !== 'CANCELLED'));
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
      this.error.set('Choose the affected item.');
      return;
    }

    this.busy.set(true);
    const result = await this.store.cancelKitchen(ticket.id, this.reason(), this.note().trim(), orderItemId);
    this.busy.set(false);

    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.toast.show(this.scope() === 'ORDER' ? 'Ticket cancelled — the waiter can reorder' : 'Item marked unavailable');
    this.closed.emit();
  }
}
