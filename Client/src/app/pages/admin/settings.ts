import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { money, Settings } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon, ConfirmDialog],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Owner administration</div>
          <h1 class="page-title">Restaurant settings</h1>
          <p class="page-sub">Profile, billing rules and payment methods used across the workspace.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" type="button" (click)="save()"><app-icon name="check" /> Save changes</button>
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
                  <label class="label" for="service">Service charge (%)</label>
                  <input id="service" class="input" type="number" min="0" max="100" step="1" [(ngModel)]="form.serviceCharge" />
                </div>
                <div class="field">
                  <label class="label" for="currency">Currency</label>
                  <input id="currency" class="input" value="ETB — Ethiopian Birr" disabled />
                </div>
                <div class="field">
                  <label class="label" for="tips">Tip presets (%)</label>
                  <input id="tips" class="input" [(ngModel)]="tipText" placeholder="0, 10, 15, 20" />
                  <span class="hint">Comma-separated. Shown as quick buttons on the payment sheet.</span>
                </div>
              </div>

              <div class="divider"></div>

              <div class="eyebrow" style="margin-bottom: 8px">Example bill</div>
              <div class="between small"><span class="muted">Food subtotal</span><span class="num">{{ money(1000) }}</span></div>
              <div class="between small mt-2"><span class="muted">Service ({{ form.serviceCharge }}%)</span><span class="num">{{ money(example().service) }}</span></div>
              <div class="between small mt-2"><span class="muted">VAT ({{ form.taxRate }}%)</span><span class="num">{{ money(example().tax) }}</span></div>
              <div class="between mt-2" style="border-top: 1px solid var(--line); padding-top: 8px">
                <strong>Guest pays</strong>
                <strong class="num">{{ money(example().total) }} ETB</strong>
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
                <input id="secret" class="input" [(ngModel)]="form.webhookSecret" />
                <span class="hint">Used to verify payment callbacks. Keep it private.</span>
              </div>
              <div class="pending-box" style="margin-top: 2px">
                <div class="row" style="align-items: flex-start">
                  <app-icon name="lock" />
                  <div>
                    <strong>Demo gateway</strong>
                    <p>QR and phone payments are simulated locally. No real charge is made.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-title">Danger zone</div>
            <p class="small muted mt-2">
              Reset all demo orders, payments, issues and staff back to the seeded dataset. This cannot
              be undone.
            </p>
            <button class="btn btn-danger btn-block mt-3" type="button" (click)="showReset.set(true)">
              <app-icon name="retract" /> Reset demo data
            </button>
          </div>
        </aside>
      </div>
    </div>

    @if (showReset()) {
      <app-confirm
        title="Reset demo data?"
        message="Every order, payment, issue and staff change made in this session will be replaced by the seeded dataset."
        confirmLabel="Reset everything"
        [danger]="true"
        (confirmed)="reset()"
        (closed)="showReset.set(false)"
      />
    }
  `,
})
export class SettingsPage {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly showReset = signal(false);
  protected form: Settings = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
  protected tipText = this.store.settings().tipPresets.join(', ');

  protected example(): { service: number; tax: number; total: number } {
    const service = Math.round((1000 * (Number(this.form.serviceCharge) || 0)) / 100);
    const tax = Math.round((1000 * (Number(this.form.taxRate) || 0)) / 100);
    return { service, tax, total: 1000 + service + tax };
  }

  protected save(): void {
    const presets = this.tipText
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
    this.store.saveSettings({
      ...this.form,
      restaurant: this.form.restaurant.trim() || 'RestoPro',
      branch: this.form.branch.trim() || 'Main Branch',
      taxRate: Math.min(100, Math.max(0, Number(this.form.taxRate) || 0)),
      serviceCharge: Math.min(100, Math.max(0, Number(this.form.serviceCharge) || 0)),
      tipPresets: presets.length ? presets : [0, 10, 15, 20],
    });
    this.toast.show('Settings saved');
  }

  protected reset(): void {
    this.store.resetDemo();
    this.form = { ...this.store.settings(), tipPresets: [...this.store.settings().tipPresets] };
    this.tipText = this.store.settings().tipPresets.join(', ');
    this.showReset.set(false);
    this.toast.show('Demo data reset');
  }
}
