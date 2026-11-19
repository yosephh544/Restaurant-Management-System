import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    <div class="toast-wrap" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class.toast-success]="toast.tone === 'success'" [class.toast-error]="toast.tone === 'error'">
          <app-icon [name]="toast.tone === 'success' ? 'check-circle' : toast.tone === 'error' ? 'alert-circle' : 'bell'" />
          <span>{{ toast.message }}</span>
          <button type="button" class="toast-x" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">
            <app-icon name="x" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
