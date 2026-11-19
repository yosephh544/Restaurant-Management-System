import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Settings, Table } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Owner administration</div>
          <h1 class="page-title">Restaurant settings</h1>
          <p class="page-sub">Profile, billing rules, tables and payment methods used across the workspace.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
            <app-icon name="check" /> {{ busy() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <div class="split">
        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Restaurant profile</div>
                <div class="card-sub">Shown on receipts and in the top bar</div>
              </div>
            </div>
            <div class="card-pad">
              <div class="grid grid-2" style="gap: 12px">
                <div class="field">
                  <label class="label" for="restaurant">Restaurant name</label>
                  <input id="restaurant" class="input" [(ngModel)]="form.restaurant" />
                </div>
                <div class="field">
                  <label class="label" for="branch">Branch</label>
                  <input id="branch" class="input" [(ngModel)]="form.branch" />
                </div>
                <div class="field">
                  <label class="label" for="phone">Phone</label>
                  <input id="phone" class="input" [(ngModel)]="form.phone" />
                </div>
                <div class="field">
                  <label class="label" for="address">Address</label>
                  <input id="address" class="input" [(ngModel)]="form.address" />
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Billing rules</div>
                <div class="card-sub">Applied to new bills. Existing bills keep their snapshots.</div>
              </div>
            </div>
            <div class="card-pad">
              <div class="grid grid-2" style="gap: 12px">
                <div class="field">
                  <label class="label" for="tax">VAT rate (%)</label>
                  <input id="tax" class="input" type="number" min="0" max="100" step="1" [(ngModel)]="form.taxRate" />
                </div>
                <div class="field">
                  <label class="label" for="tips">Tip presets (%)</label>
                  <input id="tips" class="input" [(ngModel)]="tipText" />
                  <span class="hint">Comma-separated. Shown as quick buttons on the payment sheet.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Tables</div>
                <div class="card-sub">Waiters pick a table before creating an order</div>
              </div>
              <span class="pill pill-grey no-dot">{{ store.tables().length }} tables</span>
            </div>

            @if (store.tables().length) {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Name</th>
                      <th class="t-right">Seats</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (table of store.tables(); track table.id) {
                      <tr>
                        <td class="strong">Table {{ table.number }}</td>
                        <td class="muted">{{ table.name || '—' }}</td>
                        <td class="t-right num">{{ table.capacity }}</td>
                        <td>
                          <span [class]="'pill ' + (table.status === 'AVAILABLE' ? 'pill-green' : 'pill-amber')">
                            {{ table.status === 'AVAILABLE' ? 'Available' : 'Occupied' }}
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
                <strong>No tables yet</strong>
                <p>Add the first table so waiters can start taking orders.</p>
              </div>
            }

            <div class="card-pad" style="border-top: 1px solid var(--line)">
              <div class="grid grid-3" style="gap: 10px; align-items: end">
                <div class="field">
                  <label class="label" for="table-number">Number</label>
                  <input id="table-number" class="input" [(ngModel)]="tableNumber" placeholder="e.g. 1" />
                </div>
                <div class="field">
                  <label class="label" for="table-name">Name (optional)</label>
                  <input id="table-name" class="input" [(ngModel)]="tableName" placeholder="e.g. Terrace" />
                </div>
                <div class="field">
                  <label class="label" for="table-capacity">Seats</label>
                  <div class="row" style="gap: 8px">
                    <input id="table-capacity" class="input" type="number" min="1" step="1" [(ngModel)]="tableCapacity" />
                    <button class="btn btn-secondary" type="button" [disabled]="tableBusy()" (click)="addTable()">
                      <app-icon name="plus" /> Add
                    </button>
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
                <div class="card-title">Payment methods</div>
                <div class="card-sub">Turn off a method to hide it from the payment sheet</div>
              </div>
            </div>
            <div class="card-pad stack">
              <div class="between">
                <span class="row">
                  <app-icon name="cash" style="color: var(--green)" />
                  <span>
                    <strong class="small">Cash</strong>
                    <span class="tiny muted" style="display: block">Tendered and change recorded</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.cash" (click)="form.cash = !form.cash"><span></span></button>
              </div>
              <div class="between">
                <span class="row">
                  <app-icon name="qr" style="color: var(--blue)" />
                  <span>
                    <strong class="small">QR code</strong>
                    <span class="tiny muted" style="display: block">Guest scans and confirms</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.qr" (click)="form.qr = !form.qr"><span></span></button>
              </div>
              <div class="between">
                <span class="row">
                  <app-icon name="phone" style="color: var(--amber)" />
                  <span>
                    <strong class="small">Phone push</strong>
                    <span class="tiny muted" style="display: block">Prompt sent to the guest phone</span>
                  </span>
                </span>
                <button class="switch" type="button" [class.on]="form.phonePay" (click)="form.phonePay = !form.phonePay"><span></span></button>
              </div>

              <div class="divider"></div>

              <div class="field">
                <label class="label" for="secret">Gateway webhook secret</label>
                <input id="secret" class="input" [(ngModel)]="form.webhookSecret" autocomplete="off" />
                <span class="hint">Used to verify payment callbacks. Keep it private.</span>
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
    this.toast.show('Settings saved');
  }

  protected async addTable(): Promise<void> {
    const number = this.tableNumber.trim();
    if (!number) {
      this.toast.show('Enter a table number', 'error');
      return;
    }
    if (this.store.tables().some((t: Table) => t.number.toLowerCase() === number.toLowerCase())) {
      this.toast.show('That table number already exists', 'error');
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
    this.toast.show(`Table ${number} added`);
  }
}
