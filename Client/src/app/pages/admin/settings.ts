import { Component, effect, inject, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { Settings, Table } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Owner administration' | t }}</div>
          <h1 class="page-title">{{ 'Restaurant settings' | t }}</h1>
          <p class="page-sub">{{ 'Profile, billing rules, tables and payment methods used across the workspace.' | t }}</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
            <app-icon name="check" /> {{ busy() ? ('Saving…' | t) : ('Save changes' | t) }}
          </button>
        </div>
      </div>

      <div class="split">
        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">{{ 'Restaurant profile' | t }}</div>
                <div class="card-sub">{{ 'Shown on receipts and in the top bar' | t }}</div>
              </div>
            </div>
            <div class="card-pad">
              <div class="grid grid-2" style="gap: 12px">
                <div class="field">
                  <label class="label" for="restaurant">{{ 'Restaurant name' | t }}</label>
                  <input id="restaurant" class="input" [(ngModel)]="form.restaurant" />
                </div>
                <div class="field">
                  <label class="label" for="branch">{{ 'Branch' | t }}</label>
                  <input id="branch" class="input" [(ngModel)]="form.branch" />
                </div>
                <div class="field">
                  <label class="label" for="phone">{{ 'Phone' | t }}</label>
                  <input id="phone" class="input" [(ngModel)]="form.phone" />
                </div>
                <div class="field">
                  <label class="label" for="address">{{ 'Address' | t }}</label>
                  <input id="address" class="input" [(ngModel)]="form.address" />
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">{{ 'Billing rules' | t }}</div>
                <div class="card-sub">{{ 'Applied to new bills. Existing bills keep their snapshots.' | t }}</div>
              </div>
            </div>
            <div class="card-pad">
              <div class="grid grid-2" style="gap: 12px">
                <div class="field">
                  <label class="label" for="tax">{{ 'VAT rate (%)' | t }}</label>
                  <input id="tax" class="input" type="number" min="0" max="100" step="1" [(ngModel)]="form.taxRate" />
                </div>
                <div class="field">
                  <label class="label" for="tips">{{ 'Tip presets (%)' | t }}</label>
                  <input id="tips" class="input" [(ngModel)]="tipText" />
                  <span class="hint">{{ 'Comma-separated. Shown as quick buttons on the payment sheet.' | t }}</span>
                </div>
              </div>

              <div class="between" style="margin-top: 14px">
                <span>
                  <strong class="small">{{ 'Prices include tax' | t }}</strong>
                  <span class="hint" style="display: block">{{ 'Menu prices are gross amounts and tax is calculated inside the displayed price.' | t }}</span>
                </span>
                <button class="switch" type="button" [class.on]="form.pricesIncludeTax" (click)="form.pricesIncludeTax = !form.pricesIncludeTax"><span></span></button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">{{ 'Tables' | t }}</div>
                <div class="card-sub">{{ 'Waiters pick a table before creating an order' | t }}</div>
              </div>
              <span class="pill pill-grey no-dot">{{ store.tables().length }} {{ 'tables' | t }}</span>
            </div>

            @if (store.tables().length) {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>{{ 'Table' | t }}</th>
                      <th>{{ 'Name' | t }}</th>
                      <th class="t-right">{{ 'Seats' | t }}</th>
                      <th>{{ 'Status' | t }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (table of store.tables(); track table.id) {
                      <tr>
                        <td class="strong">{{ 'Table' | t }} {{ table.number }}</td>
                        <td class="muted">{{ table.name || '—' }}</td>
                        <td class="t-right num">{{ table.capacity }}</td>
                        <td>
                          <span [class]="'pill ' + (table.status === 'AVAILABLE' ? 'pill-green' : 'pill-amber')">
                            {{ table.status === 'AVAILABLE' ? ('Available' | t) : ('Occupied' | t) }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="empty">
                <app-icon name="table" />
                <strong>{{ 'No tables yet' | t }}</strong>
                <p>{{ 'Add the first table so waiters can start taking orders.' | t }}</p>
              </div>
            }

            <div class="card-pad" style="border-top: 1px solid var(--line)">
              <div class="grid grid-3" style="gap: 10px; align-items: end">
                <div class="field">
                  <label class="label" for="table-number">{{ 'Number' | t }}</label>
                  <input id="table-number" class="input" [(ngModel)]="tableNumber" [attr.placeholder]="'e.g. 1' | t" />
                </div>
                <div class="field">
                  <label class="label" for="table-name">{{ 'Name (optional)' | t }}</label>
                  <input id="table-name" class="input" [(ngModel)]="tableName" [placeholder]="'e.g. Terrace' | t" />
                </div>
                <div class="field">
                  <label class="label" for="table-capacity">{{ 'Seats' | t }}</label>
                  <div class="row" style="gap: 8px">
                    <input id="table-capacity" class="input" type="number" min="1" step="1" [(ngModel)]="tableCapacity" />
                    <button class="btn btn-secondary" type="button" [disabled]="tableBusy()" (click)="addTable()">
                      <app-icon name="plus" /> {{ 'Add' | t }} </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="stack">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">{{ 'Payment methods' | t }}</div>
                <div class="card-sub">{{ 'Turn off a method to hide it from the payment sheet' | t }}</div>
              </div>
            </div>
            <div class="card-pad stack">
              <div class="between">
                <span class="row">
                  <app-icon name="cash" style="color: var(--green)" />
                  <span>
                    <strong class="small">{{ 'Cash' | t }}</strong>
                    <span class="tiny muted" style="display: block">{{ 'Tendered and change recorded' | t }}</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.cash" (click)="form.cash = !form.cash"><span></span></button>
              </div>
              <div class="between">
                <span class="row">
                  <app-icon name="qr" style="color: var(--blue)" />
                  <span>
                    <strong class="small">{{ 'QR code' | t }}</strong>
                    <span class="tiny muted" style="display: block">{{ 'Guest scans and confirms' | t }}</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.qr" (click)="form.qr = !form.qr"><span></span></button>
              </div>
              <div class="between">
                <span class="row">
                  <app-icon name="phone" style="color: var(--amber)" />
                  <span>
                    <strong class="small">{{ 'Phone push' | t }}</strong>
                    <span class="tiny muted" style="display: block">{{ 'Prompt sent to the guest phone' | t }}</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.phonePay" (click)="form.phonePay = !form.phonePay"><span></span></button>
              </div>

              <div class="divider"></div>

              <div class="field">
                <label class="label" for="secret">{{ 'Gateway webhook secret' | t }}</label>
                <input id="secret" class="input" [(ngModel)]="form.webhookSecret" autocomplete="off" />
                <span class="hint">{{ 'Used to verify payment callbacks. Keep it private.' | t }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class SettingsPage {
  protected readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly tableBusy = signal(false);
  protected form: Settings = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
  protected tipText = this.store.settings().tipPresets.join(', ');
  protected tableNumber = '';
  protected tableName = '';
  protected tableCapacity: number | null = 4;

  private synced = false;

  constructor() {
    // The shell loads settings asynchronously; copy them once they arrive
    // instead of leaving the form on defaults.
    effect(() => {
      if (this.synced || !this.store.loaded()) return;
      this.synced = true;
      this.syncForm();
    });
  }

  private syncForm(): void {
    this.form = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
    this.tipText = this.store.settings().tipPresets.join(', ');
  }

  protected async save(): Promise<void> {
    const presets = this.tipText
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
    this.busy.set(true);
    const result = await this.store.saveSettings({
      ...this.form,
      restaurant: this.form.restaurant.trim(),
      branch: this.form.branch.trim(),
      taxRate: Math.min(100, Math.max(0, Number(this.form.taxRate) || 0)),
      tipPresets: presets,
    });
    this.busy.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.form = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
    this.tipText = this.store.settings().tipPresets.join(', ');
    this.toast.show(translate('Settings saved'));
  }

  protected async addTable(): Promise<void> {
    const number = this.tableNumber.trim();
    if (!number) {
      this.toast.show(translate('Enter a table number'), 'error');
      return;
    }
    if (this.store.tables().some((t: Table) => t.number.toLowerCase() === number.toLowerCase())) {
      this.toast.show(translate('That table number already exists'), 'error');
      return;
    }
    this.tableBusy.set(true);
    const result = await this.store.createTable(number, this.tableName.trim(), Number(this.tableCapacity) || 1);
    this.tableBusy.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.tableNumber = '';
    this.tableName = '';
    this.toast.show(translate('Table {number} added', { number }));
  }
}
