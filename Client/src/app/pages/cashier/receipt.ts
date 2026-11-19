import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { clock, money } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-receipt',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="head-actions no-print" style="justify-content: space-between; margin-bottom: 16px">
        <a class="back-link" style="margin: 0" routerLink="/cashier/bills"><app-icon name="arrow-left" /> Back to bills</a>
        <div class="row" style="gap: 8px">
          <a class="btn btn-secondary btn-sm" [routerLink]="['/cashier/bills', id]">Open bill</a>
          <button class="btn btn-primary btn-sm" type="button" (click)="print()"><app-icon name="printer" /> Print</button>
        </div>
      </div>

      @if (order(); as o) {
        @if (payment(); as p) {
          <div class="receipt-sheet" style="max-width: 460px; margin: 0 auto">
            <div class="receipt-head">
              <span class="brand-mark"><app-icon name="logo" /></span>
              <h2>{{ settings().restaurant }}</h2>
              <p>{{ settings().address }}</p>
              <p>{{ settings().phone }} · {{ settings().branch }}</p>
            </div>

            <div class="receipt-meta">
              <span>
                <strong>Bill #{{ o.number }}</strong><br />
                Table {{ o.table }} · {{ o.waiterName }}
              </span>
              <span style="text-align: right">
                {{ clock(p.settledAt) }}<br />
                {{ p.createdAt.slice(0, 10) }}
              </span>
            </div>

            <div class="receipt-lines">
              @for (line of o.lines; track line.id) {
                @if (line.status !== 'CANCELLED') {
                  <div class="receipt-line">
                    <span>{{ line.qty }} × {{ line.name }}</span>
                    <span class="num">{{ money(line.unitPrice * line.qty) }}</span>
                  </div>
                }
              }
            </div>

            <div class="receipt-totals">
              <div class="bill-total-row"><span>Subtotal</span><span class="num">{{ money(bill().subtotal) }}</span></div>
              <div class="bill-total-row"><span>Service ({{ settings().serviceCharge }}%)</span><span class="num">{{ money(bill().service) }}</span></div>
              <div class="bill-total-row"><span>VAT ({{ settings().taxRate }}%)</span><span class="num">{{ money(bill().tax) }}</span></div>
              @if (p.tip > 0) {
                <div class="bill-total-row"><span>Tip</span><span class="num">{{ money(p.tip) }}</span></div>
              }
              <div class="bill-total-row grand"><span>Total</span><span class="num">{{ money(p.total) }} ETB</span></div>
            </div>

            <div class="receipt-meta" style="border-top: 1px dashed var(--line-2); border-bottom: 0; padding-bottom: 0">
              <span>
                Paid by {{ methodLabel(p.method) }}<br />
                @if (p.method === 'CASH') {
                  Tendered {{ money(p.tendered ?? 0) }} · Change {{ money(p.change ?? 0) }}
                } @else if (p.phone) {
                  {{ p.phone }}
                } @else {
                  Digital payment
                }
              </span>
              <span style="text-align: right">
                Cashier<br />
                {{ p.actor }}
              </span>
            </div>

            @if (p.status === 'REFUNDED') {
              <div class="pill pill-red" style="margin: 12px auto 0; display: table">Refunded</div>
            }

            <div class="receipt-foot">
              <p class="strong" style="color: var(--ink)">Thank you for dining with us.</p>
              <p style="margin-top: 2px">This receipt was issued by {{ settings().restaurant }}.</p>
              <p style="margin-top: 8px">Powered by RestoPro</p>
            </div>
          </div>
        } @else {
          <div class="card empty">
            <app-icon name="printer" />
            <strong>No receipt yet</strong>
            <p>Collect payment for this bill first, then the receipt becomes available.</p>
            <a class="btn btn-primary btn-sm mt-3" [routerLink]="['/cashier/bills', id]">Open bill</a>
          </div>
        }
      } @else {
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>Bill not found</strong>
          <p>The receipt could not be loaded.</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/cashier/bills">Back to bills</a>
        </div>
      }
    </div>
  `,
})
export class ReceiptPage {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly settings = this.store.settings;

  protected readonly order = computed(() => this.store.order(this.id));
  protected readonly payment = computed(() => {
    const payment = this.store.paymentFor(this.id);
    return payment && (payment.status === 'PAID' || payment.status === 'REFUNDED') ? payment : undefined;
  });
  protected readonly bill = computed(() => {
    const order = this.order();
    return order ? this.store.billFor(order) : { subtotal: 0, tax: 0, service: 0, total: 0 };
  });

  protected methodLabel(method: 'CASH' | 'QR' | 'PHONE'): string {
    return method === 'CASH' ? 'cash' : method === 'QR' ? 'QR code' : 'phone push';
  }

  protected print(): void {
    window.print();
  }
}
