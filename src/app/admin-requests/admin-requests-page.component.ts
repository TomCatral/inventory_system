import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { interval } from 'rxjs';
import { InventoryService, type StockRequest } from '../services/inventory.service';

@Component({
  selector: 'app-admin-requests-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-requests-page.component.html',
  styleUrl: './admin-requests-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRequestsPageComponent implements OnInit {
  private readonly svc = inject(InventoryService);

  readonly requests = signal<StockRequest[]>([]);
  readonly loading = signal(true);
  readonly acting = signal<number | null>(null);
  readonly approveTarget = signal<StockRequest | null>(null);
  readonly rejectTarget = signal<StockRequest | null>(null);
  readonly rejectReason = signal('');
  readonly filter = signal<string>('ALL');
  readonly errorMsg = signal('');

  displayed(): StockRequest[] {
    const f = this.filter();
    if (f === 'ALL') return this.requests();
    return this.requests().filter(r => r.status === f);
  }

  constructor() {
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    this.load();
  }

  setFilter(f: string): void { this.filter.set(f); }

  protected quantityLabel(item: StockRequest['item'], quantity: string | number): string {
    const base = Number(quantity) || 0;
    const baseUnit = item.distributionUom?.trim() || 'unit';
    const factor = Number(item.conversionFactor) || 1;
    const purchaseUnit = item.purchaseUom?.trim() || '';
    if (
      factor > 1 &&
      purchaseUnit &&
      purchaseUnit.toLowerCase() !== baseUnit.toLowerCase() &&
      base + 1e-9 >= factor
    ) {
      return `${this.formatAmount(base / factor)} ${purchaseUnit} = ${this.formatAmount(base)} ${baseUnit}`;
    }
    return `${this.formatAmount(base)} ${baseUnit}`;
  }

  private formatAmount(value: number): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(value);
  }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.svc.listAllRequests().subscribe({
      next: reqs => { this.requests.set(reqs); if (!silent) this.loading.set(false); },
      error: (e: unknown) => { if (!silent) this.errorMsg.set(this.errMsg(e)); if (!silent) this.loading.set(false); },
    });
  }

  askApprove(r: StockRequest): void {
    this.approveTarget.set(r);
    this.errorMsg.set('');
  }

  cancelApprove(): void {
    this.approveTarget.set(null);
  }

  confirmApprove(): void {
    const target = this.approveTarget();
    if (!target) return;
    this.acting.set(target.id);
    this.errorMsg.set('');
    this.svc.approveRequest(target.id).subscribe({
      next: () => { this.approveTarget.set(null); this.acting.set(null); this.load(true); },
      error: (e: unknown) => { this.errorMsg.set(this.errMsg(e)); this.acting.set(null); },
    });
  }

  askReject(r: StockRequest): void {
    this.rejectTarget.set(r);
    this.rejectReason.set('');
    this.errorMsg.set('');
  }

  cancelReject(): void {
    this.rejectTarget.set(null);
    this.rejectReason.set('');
  }

  setReason(value: string): void {
    this.rejectReason.set(value);
  }

  confirmReject(): void {
    const target = this.rejectTarget();
    if (!target || !this.rejectReason().trim()) return;
    this.acting.set(target.id);
    this.errorMsg.set('');
    this.svc.rejectRequest(target.id, this.rejectReason().trim()).subscribe({
      next: () => { this.rejectTarget.set(null); this.rejectReason.set(''); this.acting.set(null); this.load(true); },
      error: (e: unknown) => { this.errorMsg.set(this.errMsg(e)); this.acting.set(null); },
    });
  }

  private errMsg(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.message;
      return typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(' ') : `Error ${e.status}`;
    }
    return e instanceof Error ? e.message : 'Unexpected error.';
  }
}


