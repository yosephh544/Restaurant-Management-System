import { Component, inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { Toasts } from './shared/toasts';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Toasts],
  template: `<router-outlet />
    <app-toasts />`,
})
export class App {
  private readonly router = inject(Router);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        sessionStorage.removeItem('rms.chunk-reload');
        return;
      }
      if (!(event instanceof NavigationError)) return;
      if (!sessionStorage.getItem('rms.chunk-reload')) {
        sessionStorage.setItem('rms.chunk-reload', '1');
        window.location.reload();
      }
    });
  }
}
