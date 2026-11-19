import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { interval } from 'rxjs';
import { InventoryService, type InventoryItem, type StockRequest } from '../services/inventory.service';

@Component({
  selector: 'app-stock-request-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './stock-request-page.component.html',
  styleUrl: './stock-request-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockRequestPageComponent {
  private readonly svc = inject(InventoryService);

  readonly items = signal<InventoryItem[]>([]);
  readonly myRequests = signal<StockRequest[]>([]);
  readonly loadingItems = signal(true);
  readonly loadingRequests = signal(true);
  readonly search = signal('');
  readonly saving = signal<number | null>(null);
  readonly doneId = signal<number | null>(null);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');
  readonly rowMap = signal<Record<number, { qty: string; unit: 'BASE' | 'PURCHASE'; note: string }>>({});

  constructor() {
    this.loadItems();
    this.loadRequests();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.loadRequests(true));
  }

  private loadItems(): void {
    this.loadingItems.set(true);
    this.svc.listItems({ status: 'ACTIVE' }).subscribe({
      next: items => {
        this.items.set(items);
        const map: Record<number, { qty: string; unit: 'BASE' | 'PURCHASE'; note: string }> = {};
        for (const it of items) map[it.id] = { qty: '', unit: 'BASE', note: '' };
        this.rowMap.set(map);
        this.loadingItems.set(false);
      },
      error: (e: unknown) => { this.errorMsg.set(this.errMsg(e)); this.loadingItems.set(false); },
    });
  }

  private loadRequests(silent = false): void {
    if (!silent) this.loadingRequests.set(true);
    this.svc.listMyRequests().subscribe({
      next: reqs => { this.myRequests.set(reqs); if (!silent) this.loadingRequests.set(false); },
      error: () => { if (!silent) this.loadingRequests.set(false); },
    });
  }

  get filtered(): InventoryItem[] {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.items();
    return this.items().filter(i =>
      i.itemName.toLowerCase().includes(q) ||
      (i.brand ?? '').toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  }

  set(id: number, field: 'qty' | 'unit' | 'note', value: string): void {
    this.rowMap.update(m => ({
      ...m,
      [id]: { ...m[id], [field]: field === 'unit' ? value as 'BASE' | 'PURCHASE' : value },
    }));
  }

  protected hasPurchaseUnit(item: InventoryItem): boolean {
    return (
      Number(item.conversionFactor) > 1 &&
      !!item.purchaseUom?.trim() &&
      item.purchaseUom.trim().toLowerCase() !== item.distributionUom?.trim().toLowerCase()
    );
  }

  protected unitLabel(item: InventoryItem, unit: 'BASE' | 'PURCHASE'): string {
    return unit === 'PURCHASE'
      ? item.purchaseUom
      : item.distributionUom;
  }

  protected quantityLabel(item: InventoryItem | StockRequest['item'], quantity: string | number): string {
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

  request(item: InventoryItem): void {
    const row = this.rowMap()[item.id];
    const qty = parseFloat(row.qty);
    if (!qty || qty <= 0) return;
    const factor = row.unit === 'PURCHASE' && this.hasPurchaseUnit(item)
      ? Number(item.conversionFactor) || 1
      : 1;
    const baseQuantity = Number((qty * factor).toFixed(6));
    this.saving.set(item.id);
    this.errorMsg.set('');
    this.successMsg.set('');

    this.svc.createStockRequest({ itemId: item.id, quantity: baseQuantity, note: row.note || undefined }).subscribe({
      next: () => {
        this.doneId.set(item.id);
        this.rowMap.update(m => ({ ...m, [item.id]: { qty: '', unit: 'BASE', note: '' } }));
        this.successMsg.set(`Request submitted for ${item.itemName}. Admin will be notified.`);
        this.saving.set(null);
        this.loadRequests(true);
        setTimeout(() => { if (this.doneId() === item.id) this.doneId.set(null); }, 3000);
      },
      error: (e: unknown) => { this.errorMsg.set(this.errMsg(e)); this.saving.set(null); },
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


