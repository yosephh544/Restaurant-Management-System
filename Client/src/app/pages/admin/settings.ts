import { Component, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import {
  BankReachabilityItem,
  BankReachabilityResponse,
  Role,
  Settings,
  Table,
  TableStatus,
} from '../../core/models';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon, TranslatePipe, ConfirmDialog],
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
                  <label class="label" for="takeaway-fee">{{ 'Takeaway packaging fee (ETB)' | t }}</label>
                  <input id="takeaway-fee" class="input" type="number" min="0" step="0.01" [(ngModel)]="form.takeawayFee" />
                  <span class="hint">{{ 'Added once to every takeaway bill. Dine-in bills are not affected.' | t }}</span>
                </div>
              </div>

              <div class="between" style="margin-top: 14px">
                <span>
                  <strong class="small">{{ 'Prices include tax' | t }}</strong>
                  <span class="hint" style="display: block">{{ 'Menu prices already include tax. No tax is added to orders or bills.' | t }}</span>
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (table of store.tables(); track table.id) {
                      <tr>
                        <td class="strong">{{ 'Table' | t }} {{ table.number }}</td>
                        <td class="muted">{{ table.name || '—' }}</td>
                        <td class="t-right num">{{ table.capacity }}</td>
                        <td>
                          <span [class]="'pill ' + (table.status === TableStatus.Available ? 'pill-green' : 'pill-amber')">
                            {{ table.status === TableStatus.Available ? ('Available' | t) : ('Occupied' | t) }}
                          </span>
                        </td>
                        <td>
                          <div class="row" style="justify-content: flex-end; gap: 4px">
                            <button class="btn btn-sm btn-ghost" type="button" (click)="editTable(table)">
                              <app-icon name="edit" /> {{ 'Edit' | t }} </button>
                            <button class="btn btn-sm btn-danger" type="button" (click)="askDeleteTable(table)">
                              <app-icon name="trash" />
                            </button>
                          </div>
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
              @if (editingTableId()) {
                <p class="tiny muted" style="margin-bottom: 8px">{{ 'Editing table {number}' | t: { number: editingTableNumber() } }}</p>
              }
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
                    <button class="btn btn-secondary" type="button" [disabled]="tableBusy()" (click)="saveTable()">
                      <app-icon [name]="editingTableId() ? 'check' : 'plus'" />
                      {{ (editingTableId() ? 'Save' : 'Add') | t }}
                    </button>
                    @if (editingTableId()) {
                      <button class="btn btn-ghost" type="button" (click)="cancelTableEdit()">{{ 'Cancel' | t }}</button>
                    }
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
                <div class="card-title">{{ 'Digital payment accounts' | t }}</div>
                <div class="card-sub">{{ 'Customers transfer the bill here, then the waiter scans their receipt' | t }}</div>
              </div>
            </div>
            <div class="card-pad stack">
              <div class="between">
                <span>
                  <strong class="small">{{ 'Cash payments' | t }}</strong>
                  <span class="tiny muted" style="display: block">{{ 'Tendered and change recorded' | t }}</span>
                </span>
                <button class="switch" type="button" [class.on]="form.cash" (click)="form.cash = !form.cash"><span></span></button>
              </div>

              <div class="divider"></div>

              <div class="field">
                <label class="label" for="telebirr">{{ 'Telebirr number' | t }}</label>
                <input id="telebirr" class="input" [(ngModel)]="form.telebirr" inputmode="tel" placeholder="09xx xxx xxx" />
              </div>
              <div class="field">
                <label class="label" for="cbe">{{ 'CBE account number' | t }}</label>
                <input id="cbe" class="input" [(ngModel)]="form.cbe" inputmode="numeric" placeholder="1000xxxxxxxxx" />
              </div>
              <div class="field">
                <label class="label" for="account-name">{{ 'Account holder name' | t }}</label>
                <input id="account-name" class="input" [(ngModel)]="form.accountName" />
              </div>
              <div class="field">
                <label class="label" for="payment-qr">{{ 'Payment QR image link (optional)' | t }}</label>
                <input id="payment-qr" class="input" [(ngModel)]="form.paymentQr" placeholder="https://…" />
                <span class="hint">{{ 'Shown on the payment sheet so customers can scan the restaurant QR.' | t }}</span>
              </div>

              <p class="tiny muted">{{ 'Receipts are verified with the bank when the waiter records a payment.' | t }}</p>
            </div>
          </div>

          @if (isSuperAdmin()) {
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">{{ 'Bank connectivity' | t }}</div>
                  <div class="card-sub">{{ 'Probes the Telebirr and CBE receipt hosts from this server.' | t }}</div>
                </div>
                <span class="pill pill-grey no-dot">
                  <app-icon name="shield" /> {{ 'Super admin' | t }}
                </span>
              </div>
              <div class="card-pad stack">
                <button class="btn btn-secondary" type="button" [disabled]="bankCheckBusy()" (click)="checkBanks()">
                  <app-icon name="retract" />
                  {{ bankCheckBusy() ? ('Checking…' | t) : ('Check bank status' | t) }}
                </button>

                @if (bankCheckError()) {
                  <p class="tiny" style="color: #b42318">{{ bankCheckError() }}</p>
                }

                @if (bankCheck(); as result) {
                  <p class="tiny muted">
                    {{ 'Checked {time}' | t: { time: checkedAtLabel(result.checkedAt) } }}
                  </p>
                  @for (bank of result.banks; track bank.bank) {
                    <div class="divider"></div>
                    <div class="between">
                      <strong class="small">{{ bank.bank }}</strong>
                      <span [class]="'pill ' + (bank.reachable ? 'pill-green' : 'pill-red')">
                        {{ bank.reachable ? ('Reachable' | t) : ('Unreachable' | t) }}
                      </span>
                    </div>
                    <p class="tiny muted" style="margin: 4px 0 0">{{ bankSummary(bank) }}</p>
                    @if (bank.error) {
                      <p class="tiny" style="color: #b42318; margin: 4px 0 0">{{ bank.error }}</p>
                    }
                  }
                }
              </div>
            </div>
          }
        </aside>
      </div>

      @if (confirmOpen()) {
        <app-confirm
          [title]="'Delete table' | t"
          [message]="confirmMessage()"
          [danger]="true"
          [confirmLabel]="'Delete' | t"
          (confirmed)="runConfirm()"
          (closed)="confirmOpen.set(false)"
        />
      }
    </div>
  `,
})
export class SettingsPage {
  protected readonly TableStatus = TableStatus;

  protected readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  protected readonly busy = signal(false);
  protected readonly tableBusy = signal(false);
  protected readonly bankCheckBusy = signal(false);
  protected readonly bankCheck = signal<BankReachabilityResponse | null>(null);
  protected readonly bankCheckError = signal('');
  protected readonly isSuperAdmin = computed(() => this.auth.user()?.role === Role.SuperAdmin);
  protected readonly editingTableId = signal<string | null>(null);
  protected readonly editingTableNumber = signal('');
  protected readonly confirmOpen = signal(false);
  protected readonly confirmMessage = signal('');
  protected form: Settings = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
  protected tableNumber = '';
  protected tableName = '';
  protected tableCapacity: number | null = 4;

  private confirmAction: (() => Promise<void>) | null = null;
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
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    const result = await this.store.saveSettings({
      ...this.form,
      restaurant: this.form.restaurant.trim(),
      branch: this.form.branch.trim(),
      taxRate: Math.min(100, Math.max(0, Number(this.form.taxRate) || 0)),
      takeawayFee: Math.max(0, Math.round((Number(this.form.takeawayFee) || 0) * 100) / 100),
      telebirr: this.form.telebirr.trim(),
      cbe: this.form.cbe.trim(),
      accountName: this.form.accountName.trim(),
      paymentQr: this.form.paymentQr.trim(),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.form = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
    this.toast.show(translate('Settings saved'));
  }

  protected async checkBanks(): Promise<void> {
    if (this.bankCheckBusy()) return;
    this.bankCheckBusy.set(true);
    this.bankCheckError.set('');
    try {
      this.bankCheck.set(await this.api.get<BankReachabilityResponse>('/diagnostics/banks'));
    } catch (error) {
      this.bankCheckError.set(this.api.message(error));
    } finally {
      this.bankCheckBusy.set(false);
    }
  }

  protected bankSummary(bank: BankReachabilityItem): string {
    const parts = [
      `HTTP ${bank.httpStatus ?? '—'}`,
      bank.tlsProtocol ?? translate('no TLS'),
      `${bank.elapsedMs} ms`,
    ];
    if (bank.rateLimitLimit) {
      parts.push(
        translate('rate limit {remaining} / {limit}', {
          remaining: bank.rateLimitRemaining ?? '?',
          limit: bank.rateLimitLimit,
        }),
      );
    }
    return parts.join(' · ');
  }

  protected checkedAtLabel(value: string): string {
    return new Date(value).toLocaleString();
  }

  protected editTable(table: Table): void {
    this.editingTableId.set(table.id);
    this.editingTableNumber.set(table.number);
    this.tableNumber = table.number;
    this.tableName = table.name ?? '';
    this.tableCapacity = table.capacity;
  }

  protected cancelTableEdit(): void {
    this.editingTableId.set(null);
    this.editingTableNumber.set('');
    this.tableNumber = '';
    this.tableName = '';
    this.tableCapacity = 4;
  }

  protected async saveTable(): Promise<void> {
    const number = this.tableNumber.trim();
    if (!number) {
      this.toast.show(translate('Enter a table number'), 'error');
      return;
    }
    const editingId = this.editingTableId();
    const duplicate = this.store
      .tables()
      .some((t: Table) => t.id !== editingId && t.number.toLowerCase() === number.toLowerCase());
    if (duplicate) {
      this.toast.show(translate('That table number already exists'), 'error');
      return;
    }

    this.tableBusy.set(true);
    const result = editingId
      ? await this.store.updateTable(editingId, number, this.tableName.trim(), Number(this.tableCapacity) || 1)
      : await this.store.createTable(number, this.tableName.trim(), Number(this.tableCapacity) || 1);
    this.tableBusy.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.cancelTableEdit();
    this.toast.show(translate(editingId ? 'Table {number} updated' : 'Table {number} added', { number }));
  }

  protected askDeleteTable(table: Table): void {
    this.confirmMessage.set(
      translate('Delete table {number}? It must have no open session.', { number: table.number }),
    );
    this.confirmAction = async () => {
      const result = await this.store.deleteTable(table.id);
      if (result.ok && this.editingTableId() === table.id) this.cancelTableEdit();
      this.toast.show(
        result.ok
          ? translate('Table {number} deleted', { number: table.number })
          : result.error,
        result.ok ? 'success' : 'error',
      );
    };
    this.confirmOpen.set(true);
  }

  protected runConfirm(): void {
    const action = this.confirmAction;
    this.confirmOpen.set(false);
    this.confirmAction = null;
    if (action) void action();
  }
}
