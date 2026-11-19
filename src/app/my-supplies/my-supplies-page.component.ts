import { DatePipe, LowerCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, interval, of } from 'rxjs';

import {
  InventoryService,
  type EmployeeSearchResult,
  type StockBatch,
  type SupplyAssignment,
} from '../services/inventory.service';
import { EmployeePickerComponent } from '../shared/components/employee-picker/employee-picker.component';

type SupplyAction = 'return' | 'transfer' | null;
type SupplyDraft = {
  quantity: string;
  unit: 'BASE' | 'PURCHASE';
  recipient: EmployeeSearchResult | null;
  note: string;
  action: SupplyAction;
};

interface UnitAmount {
  readonly unit: string;
  readonly quantity: number;
  readonly baseQuantity: number;
  readonly baseUnit: string;
}

interface SupplyGroup {
  readonly itemId: number;
  readonly item: SupplyAssignment['item'];
  readonly assignments: SupplyAssignment[];
  readonly issuedLabel: string;
  readonly remainingLabel: string;
}

@Component({
  selector: 'app-my-supplies-page',
  standalone: true,
  imports: [DatePipe, LowerCasePipe, EmployeePickerComponent],
  templateUrl: './my-supplies-page.component.html',
  styleUrl: './my-supplies-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySuppliesPageComponent {
  private readonly inventory = inject(InventoryService);

  protected readonly supplies = signal<SupplyAssignment[]>([]);
  protected readonly drafts = signal<Record<number, SupplyDraft>>({});
  protected readonly loading = signal(true);
  protected readonly actingId = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly expandedItemId = signal<number | null>(null);
  protected readonly batchMap = signal<Record<number, StockBatch[]>>({});
  protected readonly loadingBatches = signal(false);
  protected readonly supplyGroups = computed<SupplyGroup[]>(() => {
    const grouped = new Map<number, SupplyAssignment[]>();
    for (const supply of this.supplies()) {
      const list = grouped.get(supply.itemId) ?? [];
      list.push(supply);
      grouped.set(supply.itemId, list);
    }
    return [...grouped.entries()].map(([itemId, assignments]) => {
      const ordered = [...assignments].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const representative = ordered[0];
      const issuedBase = ordered.reduce((total, supply) => total + (Number(supply.quantity) || 0), 0);
      const remainingBase = ordered.reduce((total, supply) => total + (Number(supply.remainingQuantity) || 0), 0);
      return {
        itemId,
        item: representative.item,
        assignments: ordered,
        issuedLabel: this.issueLabel(representative, String(issuedBase)),
        remainingLabel: this.issueLabel(representative, String(remainingBase)),
      };
    });
  });

  constructor() {
    this.load();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  protected load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.inventory.listMySupplies().subscribe({
      next: (supplies) => {
        this.supplies.set(supplies);
        if (silent) {
          const currentDrafts = this.drafts();
          const supplyIds = new Set(supplies.map((supply) => supply.id));
          const needsDrafts = supplies.some((supply) => !currentDrafts[supply.id])
            || Object.keys(currentDrafts).some((id) => !supplyIds.has(Number(id)));
          if (needsDrafts) {
            this.drafts.update((current) => {
              const next: Record<number, SupplyDraft> = {};
              for (const supply of supplies) {
                next[supply.id] = current[supply.id] ?? { quantity: '', unit: 'BASE', recipient: null, note: '', action: null };
              }
              return next;
            });
          }
        } else {
          this.drafts.set(Object.fromEntries(supplies.map((s) => [s.id, {
            quantity: '', unit: 'BASE', recipient: null, note: '', action: null,
          }])));
        }
        this.loadBatches(supplies, silent);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.error.set(this.errorMessage(error));
        if (!silent) this.loading.set(false);
      },
    });
  }

  private loadBatches(supplies: SupplyAssignment[], preserve = false): void {
    const itemIds = [...new Set(supplies.map((supply) => supply.itemId))];
    if (!preserve) {
      this.batchMap.set({});
      this.expandedItemId.set(null);
    }
    if (!itemIds.length) return;
    if (!preserve) this.loadingBatches.set(true);
    forkJoin(itemIds.map((itemId) =>
      this.inventory.listMyItemBatches(itemId).pipe(catchError(() => of([] as StockBatch[]))),
    )).subscribe({
      next: (results) => {
        const next: Record<number, StockBatch[]> = {};
        itemIds.forEach((itemId, index) => { next[itemId] = results[index]; });
        const current = this.batchMap();
        const unchanged = Object.keys(current).length === itemIds.length
          && itemIds.every((itemId) => JSON.stringify(current[itemId] ?? []) === JSON.stringify(next[itemId] ?? []));
        if (!unchanged) this.batchMap.set(next);
        if (!preserve) this.loadingBatches.set(false);
      },
      error: () => {
        if (!preserve) this.loadingBatches.set(false);
      },
    });
  }

  protected setAction(id: number, action: SupplyAction): void {
    this.drafts.update((drafts) => ({ ...drafts, [id]: { ...drafts[id], action } }));
    this.error.set('');
    this.message.set('');
  }

  protected setDraft(id: number, field: 'quantity' | 'unit' | 'note', value: string): void {
    this.drafts.update((drafts) => ({
      ...drafts,
      [id]: { ...drafts[id], [field]: field === 'unit' ? value as 'BASE' | 'PURCHASE' : value },
    }));
  }

  protected hasPurchaseUnit(item: SupplyAssignment['item']): boolean {
    return (
      Number(item.conversionFactor) > 1 &&
      !!item.purchaseUom?.trim() &&
      item.purchaseUom.trim().toLowerCase() !== item.distributionUom?.trim().toLowerCase()
    );
  }

  protected unitLabel(item: SupplyAssignment['item'], unit: 'BASE' | 'PURCHASE'): string {
    return unit === 'PURCHASE' ? item.purchaseUom : item.distributionUom;
  }

  protected baseQuantity(supply: SupplyAssignment, quantity: string, unit: 'BASE' | 'PURCHASE'): number {
    const base = Number(quantity) || 0;
    if (unit !== 'PURCHASE' || !this.hasPurchaseUnit(supply.item)) return base;
    return Number((base * (Number(supply.item.conversionFactor) || 1)).toFixed(6));
  }

  protected setTransferRecipient(id: number, recipient: EmployeeSearchResult | null): void {
    this.drafts.update((drafts) => ({ ...drafts, [id]: { ...drafts[id], recipient } }));
  }

  protected submit(supply: SupplyAssignment): void {
    const draft = this.drafts()[supply.id];
    const quantity = this.baseQuantity(supply, draft.quantity, draft.unit);
    if (!draft.action || !quantity || quantity <= 0 || quantity > Number(supply.remainingQuantity)) return;
    if (draft.action === 'transfer' && !draft.recipient) return;

    this.actingId.set(supply.id);
    this.error.set('');
    const request = draft.action === 'return'
      ? this.inventory.returnAssignedSupply(supply.id, quantity, draft.note.trim() || undefined)
      : this.inventory.transferAssignedSupply(
          supply.id,
          quantity,
          draft.recipient!.employeeNumber,
          draft.note.trim() || undefined,
        );
    request.subscribe({
      next: () => {
        this.message.set(draft.action === 'return' ? 'Supply returned to inventory.' : 'Supply transferred to the selected staff member.');
        this.actingId.set(null);
        this.load(true);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error));
        this.actingId.set(null);
      },
    });
  }

  protected toggleBreakdown(itemId: number, event?: Event): void {
    if (event && (event.target as HTMLElement).closest('button, input, select, a, label')) return;
    this.expandedItemId.update((current) => (current === itemId ? null : itemId));
  }

  protected issueLabel(supply: SupplyAssignment, quantity: string): string {
    return this.formatUnitAmount(this.unitAmount(supply, quantity));
  }

  protected batchLabel(
    item: SupplyAssignment['item'],
    quantity: number | string | null | undefined,
    unit?: string | null,
  ): string {
    const baseQuantity = Number(quantity) || 0;
    const baseUnit = item.distributionUom?.trim() || 'unit';
    const purchaseUnit = item.purchaseUom?.trim();
    const displayUnit = unit?.trim() || purchaseUnit;
    const factor = Number(item.conversionFactor) > 0 ? Number(item.conversionFactor) : 1;
    if (!displayUnit || displayUnit.toLowerCase() === baseUnit.toLowerCase()) {
      return `${this.formatAmount(baseQuantity)} ${baseUnit}`;
    }
    return `${this.formatAmount(baseQuantity / factor)} ${displayUnit} = ${this.formatAmount(baseQuantity)} ${baseUnit}`;
  }

  protected formatUnitAmount(amount: UnitAmount): string {
    const base = `${this.formatAmount(amount.baseQuantity)} ${amount.baseUnit || 'unit'}`;
    if (!amount.unit || amount.unit.toLowerCase() === (amount.baseUnit || 'unit').toLowerCase()) {
      return base;
    }
    return `${this.formatAmount(amount.quantity)} ${amount.unit} = ${base}`;
  }

  private unitAmount(supply: SupplyAssignment, quantity: string): UnitAmount {
    const baseQuantity = Number(quantity) || 0;
    const baseUnit = supply.item.distributionUom?.trim() || 'unit';
    const storedUnit = supply.enteredUom?.trim();
    const storedFactor = Number(supply.conversionFactor ?? 0) || 0;
    if (
      storedUnit &&
      storedFactor > 0 &&
      storedUnit.toLowerCase() !== baseUnit.toLowerCase()
    ) {
      return { unit: storedUnit, quantity: baseQuantity / storedFactor, baseQuantity, baseUnit };
    }

    const factor = Number(supply.item.conversionFactor) || 1;
    const purchaseUnit = supply.item.purchaseUom?.trim() || '';
    const usesPurchaseUnit =
      factor > 0 &&
      purchaseUnit &&
      purchaseUnit.toLowerCase() !== baseUnit.toLowerCase();
    if (usesPurchaseUnit) {
      return { unit: purchaseUnit, quantity: baseQuantity / factor, baseQuantity, baseUnit };
    }
    return { unit: baseUnit, quantity: baseQuantity, baseQuantity, baseUnit };
  }

  private formatAmount(value: number): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(value);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(' ');
      return error.status === 0 ? 'Cannot connect to the inventory service.' : `Request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unexpected error.';
  }
}
