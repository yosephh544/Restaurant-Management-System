import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info' | 'warning' | 'alert';

export interface ToastAction {
  label: string;
  path: string;
}

export interface Toast {
  id: number;
  title?: string;
  message: string;
  tone: ToastTone;
  duration: number;
  createdAt: number;
  key?: string;
  action?: ToastAction;
}

export interface ToastOptions {
  message: string;
  title?: string;
  tone?: ToastTone;
  duration?: number;
  key?: string;
  action?: ToastAction;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 6000,
  error: 7000,
  warning: 10000,
  alert: 12000,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, tone: ToastTone = 'success'): void {
    this.notify({ message, tone });
  }

  notify(options: ToastOptions): Toast {
    const tone = options.tone ?? 'info';
    const toast: Toast = {
      id: this.nextId++,
      title: options.title,
      message: options.message,
      tone,
      duration: options.duration ?? DEFAULT_DURATION[tone],
      createdAt: Date.now(),
      key: options.key,
      action: options.action,
    };
    this.toasts.update((list) => {
      const withoutDuplicate = options.key ? list.filter((t) => t.key !== options.key) : list;
      return [...withoutDuplicate, toast].slice(-5);
    });
    if (toast.duration > 0) {
      window.setTimeout(() => this.dismiss(toast.id), toast.duration);
    }
    return toast;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  dismissKey(key: string): void {
    this.toasts.update((list) => list.filter((t) => t.key !== key));
  }

  clear(): void {
    this.toasts.set([]);
  }
}
