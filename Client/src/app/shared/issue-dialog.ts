import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ISSUE_LABEL, IssueReason, Order } from '../core/models';
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
            <p>Order #{{ order().number }} · Table {{ order().table }}</p>
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
                @for (line of openLines(); track line.id) {
                  <option [value]="line.id">{{ line.name }} ×{{ line.qty }}</option>
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
            <textarea
              id="issue-note"
              class="textarea"
              placeholder="e.g. supplier missed the delivery, fryer is down…"
              [ngModel]="note()"
              (ngModelChange)="note.set($event)"
            ></textarea>
          </div>

          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line)">
            <div class="row" style="align-items: flex-start">
              <app-icon name="alert" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">This removes the item from the bill</strong>
                <p style="color: var(--red)">
                  Before READY there is no payment, so no refund is needed. The waiter will see the
                  cancellation and can reorder the ticket.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <button class="btn btn-ghost" type="button" (click)="closed.emit()">Cancel</button>
          <button class="btn btn-danger" type="button" (click)="submit()">
            <app-icon name="alert" />
            {{ scope() === 'ORDER' ? 'Cancel the ticket' : 'Mark item unavailable' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class IssueDialog {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  readonly order = input.required<Order>();
  readonly closed = output<void>();

  protected readonly reasons: { value: IssueReason; label: string }[] = [
    { value: 'OUT_OF_STOCK', label: ISSUE_LABEL.OUT_OF_STOCK },
    { value: 'EQUIPMENT', label: ISSUE_LABEL.EQUIPMENT },
    { value: 'DELAY', label: ISSUE_LABEL.DELAY },
    { value: 'OTHER', label: ISSUE_LABEL.OTHER },
  ];

  protected readonly scope = signal<'ITEM' | 'ORDER'>('ITEM');
  protected readonly reason = signal<IssueReason>('OUT_OF_STOCK');
  protected readonly note = signal('');
  protected readonly openLines = computed(() => this.order().lines.filter((l) => l.status !== 'CANCELLED'));
  protected readonly itemOverride = signal<string | null>(null);
  protected readonly itemId = computed(
    () =>
      this.itemOverride() ??
      this.order().lines.find((l) => l.status !== 'CANCELLED')?.id ??
      this.order().lines[0]?.id ??
      '',
  );

  protected submit(): void {
    const order = this.order();
    const note = this.note().trim();
    if (this.scope() === 'ORDER') {
      this.store.cancelOrder(order.id, this.reason(), note);
      this.toast.show('Ticket cancelled — the waiter can reorder');
    } else {
      const lineId = this.itemId();
      if (!lineId) return;
      this.store.cancelLine(order.id, lineId, this.reason(), note);
      this.toast.show('Item marked unavailable');
    }
    this.closed.emit();
  }
}
