import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-confirm',
  imports: [Icon],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal" style="max-width: 430px" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div class="row" style="align-items: flex-start">
            <span
              class="stat-icon"
              style="margin: 0"
              [style.background]="danger() ? 'var(--red-soft)' : 'var(--amber-soft)'"
              [style.color]="danger() ? 'var(--red)' : 'var(--amber)'"
            >
              <app-icon [name]="danger() ? 'alert' : 'bell'" />
            </span>
            <div>
              <h3>{{ title() }}</h3>
              <p>{{ message() }}</p>
            </div>
          </div>
        </div>
        <div class="modal-body" style="padding-top: 10px">
          <ng-content />
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" type="button" (click)="closed.emit()">Cancel</button>
          <button [class]="'btn ' + (danger() ? 'btn-danger' : 'btn-primary')" type="button" (click)="confirmed.emit()">
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly closed = output<void>();
}
