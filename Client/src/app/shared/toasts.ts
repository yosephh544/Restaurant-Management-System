import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n';
import { ToastService, ToastTone } from '../core/toast.service';
import { Icon, IconName } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon, RouterLink, TranslatePipe],
  template: `
    <div class="toast-wrap" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          [class]="'toast toast-' + toast.tone"
          [attr.role]="toast.tone === 'alert' || toast.tone === 'error' ? 'alert' : 'status'"
          [attr.aria-live]="toast.tone === 'alert' || toast.tone === 'error' ? 'assertive' : 'polite'"
        >
          <span class="toast-icon"><app-icon [name]="iconFor(toast.tone)" /></span>
          <span class="toast-copy">
            @if (toast.title) {
              <strong class="toast-title">{{ toast.title }}</strong>
            }
            <span class="toast-message">{{ toast.message }}</span>
            @if (toast.action) {
              <a class="toast-action" [routerLink]="toast.action.path" (click)="toasts.dismiss(toast.id)">
                {{ toast.action.label }}
              </a>
            }
          </span>
          <button type="button" class="toast-x" (click)="toasts.dismiss(toast.id)" [attr.aria-label]="'Dismiss' | t">
            <app-icon name="x" />
          </button>
          @if (toast.duration > 0) {
            <span class="toast-progress" [style.animationDuration.ms]="toast.duration"></span>
          }
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);

  protected iconFor(tone: ToastTone): IconName {
    switch (tone) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      case 'warning':
      case 'alert':
        return 'alert';
      default:
        return 'bell';
    }
  }
}
