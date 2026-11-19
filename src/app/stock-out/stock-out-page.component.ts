import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  InventoryService,
  type EmployeeSearchResult,
  type InventoryItem,
  type StockBatch,
} from '../services/inventory.service';
import { EmployeePickerComponent } from '../shared/components/employee-picker/employee-picker.component';
import { forkJoin, interval } from 'rxjs';

type IssueLine = {
  id: number;
  qty: string;
  unit: 'PURCHASE' | 'BASE';
  batchId: number | null;
  recipient: EmployeeSearchResult | null;
  purpose: string;
};

type StockOutDraft = { lines: IssueLine[] };

@Component({
  selector: 'app-stock-out-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, EmployeePickerComponent],
  templateUrl: './stock-out-page.component.html',
  styleUrl: './stock-out-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockOutPageComponent {
  private readonly svc = inject(InventoryService);

  readonly items = signal<InventoryItem[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly saving = signal<number | null>(null);
  readonly successId = signal<number | null>(null);
  readonly errorMsg = signal('');
  readonly rowMap = signal<Record<number, StockOutDraft>>({});
  readonly batchMap = signal<Record<number, StockBatch[]>>({});
  private nextLineId = 1;

  constructor() {
    this.load();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  get availableCount(): number {
    return this.items().filter((item) => this.balance(item) > 0).length;
  }

  get outOfStockCount(): number {
    return this.items().filter((item) => this.balance(item) <= 0).length;
  }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.svc.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        const currentRows = this.rowMap();
        const itemIds = new Set(items.map((item) => item.id));
        const needsRows = items.some((item) => !currentRows[item.id])
          || Object.keys(currentRows).some((id) => !itemIds.has(Number(id)));
        if (needsRows) {
          this.rowMap.update((current) => {
            const next: Record<number, StockOutDraft> = {};
            for (const it of items) next[it.id] = current[it.id] ?? { lines: [this.newLine()] };
            return next;
          });
        }
        const previousBatches = this.batchMap();
        const batches: Record<number, StockBatch[]> = {};
        for (const item of items) batches[item.id] = previousBatches[item.id] ?? [];
        const sameBatches = Object.keys(previousBatches).length === items.length
          && items.every((item) => previousBatches[item.id] !== undefined);
        if (!sameBatches) this.batchMap.set(batches);
        for (const item of items) {
          this.svc.listItemBatches(item.id).subscribe({
            next: (itemBatches) => {
              this.batchMap.update((current) =>
                JSON.stringify(current[item.id] ?? []) === JSON.stringify(itemBatches)
                  ? current
                  : { ...current, [item.id]: itemBatches },
              );
              if (itemBatches.length > 0) {
                this.rowMap.update((current) => {
                  const row = current[item.id];
                  if (!row || !row.lines.some((line) => line.batchId === null)) return current;
                  return {
                    ...current,
                    [item.id]: {
                      lines: row.lines.map((line) =>
                        line.batchId === null ? { ...line, batchId: itemBatches[0].id } : line,
                      ),
                    },
                  };
                });
              }
            },
            error: () => this.batchMap.update((current) =>
              current[item.id]?.length ? { ...current, [item.id]: [] } : current,
            ),
          });
        }
        if (!silent) this.loading.set(false);
      },
      error: (e: unknown) => {
        if (!silent) this.errorMsg.set(this.errMsg(e));
        if (!silent) this.loading.set(false);
      },
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

  balance(item: InventoryItem): number { return +(item.balance?.quantity ?? 0); }

  completePurchaseUnits(item: InventoryItem): number {
    const factor = Number(item.conversionFactor || 1);
    return factor > 0 ? Math.floor((this.balance(item) + 1e-9) / factor) : 0;
  }

  hasPackConversion(item: InventoryItem): boolean {
    return Number(item.conversionFactor || 1) !== 1 || item.purchaseUom.toLowerCase() !== item.distributionUom.toLowerCase();
  }

  set(itemId: number, lineId: number, field: 'qty' | 'purpose', value: string): void {
    this.rowMap.update((map) => ({ ...map, [itemId]: { lines: map[itemId].lines.map((line) => line.id === lineId ? { ...line, [field]: value } : line) } }));
  }

  setRecipient(itemId: number, lineId: number, recipient: EmployeeSearchResult | null): void {
    this.rowMap.update((map) => ({ ...map, [itemId]: { lines: map[itemId].lines.map((line) => line.id === lineId ? { ...line, recipient } : line) } }));
  }

  setUnit(itemId: number, lineId: number, unit: 'PURCHASE' | 'BASE'): void {
    this.rowMap.update((map) => ({
      ...map,
      [itemId]: { lines: map[itemId].lines.map((line) => line.id === lineId ? { ...line, unit } : line) },
    }));
  }

  setBatch(itemId: number, lineId: number, batchId: string): void {
    this.rowMap.update((map) => ({
      ...map,
      [itemId]: { lines: map[itemId].lines.map((line) => line.id === lineId ? { ...line, batchId: batchId ? Number(batchId) : null } : line) },
    }));
  }

  oldStockBaseUnits(item: InventoryItem): number {
    const batches = this.batchMap()[item.id] ?? [];
    if (!batches.length) return this.balance(item);
    const oldFromBatches = batches
      .filter((b) => b.stockClassification === 'OLD')
      .reduce((sum, b) => sum + Number(b.remainingQuantity || 0), 0);
    const totalBatched = batches.reduce((sum, b) => sum + Number(b.remainingQuantity || 0), 0);
    const unbatched = Math.max(0, this.balance(item) - totalBatched);
    return oldFromBatches + unbatched;
  }

  newStockBaseUnits(item: InventoryItem): number {
    const batches = this.batchMap()[item.id] ?? [];
    return batches
      .filter((b) => b.stockClassification !== 'OLD')
      .reduce((sum, b) => sum + Number(b.remainingQuantity || 0), 0);
  }

  stockLabel(item: InventoryItem, baseQuantity: number): string {
    const factor = Number(item.conversionFactor) > 0 ? Number(item.conversionFactor) : 1;
    const baseUnit = item.distributionUom?.trim() || 'unit';
    const purchaseUnit = item.purchaseUom?.trim();
    const amount = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(baseQuantity);
    const baseLabel = `${amount} ${baseUnit}`;
    if (!purchaseUnit || purchaseUnit.toLowerCase() === baseUnit.toLowerCase()) {
      return baseLabel;
    }
    const packs = Math.round((baseQuantity / factor) * 1_000_000) / 1_000_000;
    const packsLabel = `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(packs)} ${purchaseUnit}`;
    return `${packsLabel} = ${baseLabel}`;
  }

  isSkippingOldStock(item: InventoryItem, line: IssueLine): boolean {
    if (!line.batchId) return false;
    const batches = this.batchMap()[item.id] ?? [];
    const selected = batches.find((b) => b.id === line.batchId);
    if (!selected) return false;
    return selected.stockClassification !== 'OLD' && batches.some((b) => b.stockClassification === 'OLD' && Number(b.remainingQuantity || 0) > 0);
  }

  isOldStockSelection(itemId: number, line: IssueLine): boolean {
    if (!line.batchId) return true;
    const selected = (this.batchMap()[itemId] ?? []).find((batch) => batch.id === line.batchId);
    return selected?.stockClassification === 'OLD';
  }

  batchLabel(batch: StockBatch, _index: number, _total: number): string {
    return batch.stockClassification === 'OLD' ? '📦 Old Stock' : '✨ New Stock';
  }

  addRecipient(itemId: number): void {
    const batches = this.batchMap()[itemId] ?? [];
    const firstBatchId = batches.length > 0 ? batches[0].id : null;
    this.rowMap.update((map) => ({ ...map, [itemId]: { lines: [...map[itemId].lines, this.newLine(firstBatchId)] } }));
  }

  removeRecipient(itemId: number, lineId: number): void {
    this.rowMap.update((map) => ({ ...map, [itemId]: { lines: map[itemId].lines.length === 1 ? map[itemId].lines : map[itemId].lines.filter((line) => line.id !== lineId) } }));
  }

  lineBaseQuantity(item: InventoryItem, line: IssueLine): number {
    const quantity = Number(line.qty) || 0;
    return line.unit === 'PURCHASE' ? quantity * Number(item.conversionFactor || 1) : quantity;
  }

  totalIssue(item: InventoryItem): number {
    return this.rowMap()[item.id].lines.reduce((total, line) => total + this.lineBaseQuantity(item, line), 0);
  }

  canIssue(item: InventoryItem): boolean {
    const activeLines = this.rowMap()[item.id].lines.filter((line) => Number(line.qty) > 0 || line.recipient !== null || line.purpose.trim());
    return activeLines.length > 0 &&
      activeLines.every((line) => Number(line.qty) > 0 && line.recipient !== null) &&
      activeLines.every((line) => (this.batchMap()[item.id]?.length ?? 0) === 0 || line.batchId !== null) &&
      this.totalIssue(item) <= this.balance(item);
  }

  issue(item: InventoryItem): void {
    const lines = this.rowMap()[item.id].lines.filter((line) => Number(line.qty) > 0 && line.recipient);
    if (!this.canIssue(item)) return;

    this.saving.set(item.id);
    this.successId.set(null);
    this.errorMsg.set('');

    forkJoin(lines.map((line) => this.svc.issue({
      itemId: item.id,
      ...(line.batchId ? { stockItemId: line.batchId } : {}),
      quantity: Number(line.qty),
      unit: line.unit,
      recipientEmpNo: line.recipient!.employeeNumber,
      ...(line.purpose.trim() ? { referenceNumber: line.purpose.trim() } : {}),
    }))).subscribe({
      next: () => {
        this.successId.set(item.id);
        this.rowMap.update(m => ({ ...m, [item.id]: { lines: [this.newLine()] } }));
        this.saving.set(null);
        setTimeout(() => { if (this.successId() === item.id) this.successId.set(null); }, 3000);
        this.load();
      },
      error: (e: unknown) => {
        this.errorMsg.set(this.errMsg(e));
        this.saving.set(null);
      },
    });
  }

  private newLine(defaultBatchId: number | null = null): IssueLine {
    return { id: this.nextLineId++, qty: '', unit: 'BASE', batchId: defaultBatchId, recipient: null, purpose: '' };
  }

  private errMsg(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg)) return msg.join(' ');
      return e.status === 0 ? 'Cannot connect to server.' : `Error ${e.status}`;
    }
    return e instanceof Error ? e.message : 'Unexpected error.';
  }
}
