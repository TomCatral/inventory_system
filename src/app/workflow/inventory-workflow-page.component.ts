import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import {
  InventoryService,
  type InventoryItem,
  type StockBatch,
} from '../services/inventory.service';

interface MovementDraft {
  readonly quantity: string;
  readonly reason: string;
  readonly unit: string;
  readonly stockItemId: number | null;
}

@Component({
  selector: 'app-inventory-workflow-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './inventory-workflow-page.component.html',
  styleUrl: './inventory-workflow-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryWorkflowPageComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly savingItemId = signal<number | null>(null);
  protected readonly successItemId = signal<number | null>(null);
  protected readonly search = signal('');
  protected readonly movementDrafts = signal<Record<number, MovementDraft>>({});
  protected readonly returnBatches = signal<Record<number, StockBatch[]>>({});
  protected readonly returnReasonTypes = signal<Record<number, string>>({});
  protected readonly expandedItemId = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');

  protected readonly returnStats = computed(() => {
    const items = this.items();
    const batchesMap = this.returnBatches();
    let totalBatches = 0;
    for (const key of Object.keys(batchesMap)) {
      totalBatches += batchesMap[Number(key)]?.length || 0;
    }
    return {
      total: items.length,
      withStock: items.filter((item) => this.balance(item) > 0).length,
      totalBatches,
    };
  });

  ngOnInit(): void {
    this.loadItems();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.loadItems(true));
  }

  protected get filteredItems(): InventoryItem[] {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.items();
    return this.items().filter((item) =>
      item.itemName.toLowerCase().includes(query) ||
      (item.brand ?? '').toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query),
    );
  }

  protected toggleItemDetails(itemId: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.expandedItemId.update((current) => (current === itemId ? null : itemId));
  }

  protected oldStockQty(item: InventoryItem): number {
    const batches = this.returnBatches()[item.id] ?? [];
    return batches
      .filter((b) => b.stockClassification === 'OLD')
      .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);
  }

  protected newStockQty(item: InventoryItem): number {
    const batches = this.returnBatches()[item.id] ?? [];
    return batches
      .filter((b) => b.stockClassification !== 'OLD')
      .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);
  }

  protected stockLabel(item: InventoryItem, baseQuantity: number): string {
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

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
      ? event.target.value
      : '';
  }

  protected setDraft(itemId: number, field: 'quantity' | 'reason' | 'unit', value: string): void {
    this.movementDrafts.update((drafts) => ({
      ...drafts,
      [itemId]: {
        ...drafts[itemId],
        [field]: value,
      },
    }));
  }

  protected returnReasonType(itemId: number, draft: MovementDraft): string {
    const selectedType = this.returnReasonTypes()[itemId];
    if (selectedType) return selectedType;
    if (draft.reason === 'Damaged' || draft.reason === 'Expired') return draft.reason;
    return draft.reason ? 'Other' : '';
  }

  protected setReturnReasonType(itemId: number, value: string): void {
    this.returnReasonTypes.update((types) => ({ ...types, [itemId]: value }));
    this.setDraft(itemId, 'reason', value === 'Other' ? '' : value);
  }

  protected setReturnBatch(itemId: number, value: string | number | null): void {
    this.movementDrafts.update((drafts) => ({
      ...drafts,
      [itemId]: { ...drafts[itemId], stockItemId: value ? Number(value) : null },
    }));
  }

  protected conversionFactor(item: InventoryItem, draft: MovementDraft): number {
    const factor = Number(item.conversionFactor);
    const unit = (draft.unit || '').trim().toLowerCase();
    const usesPurchaseUnit =
      unit.length > 0 &&
      unit === item.purchaseUom.trim().toLowerCase() &&
      unit !== item.distributionUom.trim().toLowerCase();
    return usesPurchaseUnit && Number.isFinite(factor) && factor > 0 ? factor : 1;
  }

  protected balance(item: InventoryItem): number {
    return Number(item.balance?.quantity ?? 0);
  }

  protected submitMovement(item: InventoryItem): void {
    const draft = this.movementDrafts()[item.id];
    const quantity = Number(draft?.quantity);
    const reason = draft?.reason.trim();
    if (!Number.isFinite(quantity) || quantity <= 0 || !reason || this.savingItemId() !== null) return;
    this.savingItemId.set(item.id);
    this.successItemId.set(null);
    this.error.set('');
    this.message.set('');
    this.inventory.returnItems({
      itemId: item.id,
      quantity,
      reason,
      unit: draft.unit || item.distributionUom,
      ...(draft.stockItemId ? { stockItemId: draft.stockItemId } : {}),
    }).subscribe({
      next: (result) => {
        this.message.set(`${result.movementType} recorded: ${result.quantity} ${result.unit}. New balance: ${result.balance} ${result.balanceUom ?? item.distributionUom}.`);
        this.successItemId.set(item.id);
        this.movementDrafts.update((drafts) => ({
          ...drafts,
          [item.id]: {
            ...drafts[item.id],
            quantity: '',
            reason: '',
            unit: item.distributionUom,
            stockItemId: null,
          },
        }));
        this.returnReasonTypes.update((types) => {
          const updated = { ...types };
          delete updated[item.id];
          return updated;
        });
        this.loadItems();
        this.savingItemId.set(null);
        setTimeout(() => {
          if (this.successItemId() === item.id) this.successItemId.set(null);
        }, 3000);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.savingItemId.set(null);
      },
    });
  }

  private loadItems(silent = false): void {
    if (!silent) this.loading.set(true);
    this.inventory.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        const currentDrafts = this.movementDrafts();
        const itemIds = new Set(items.map((item) => item.id));
        const needsDrafts = items.some((item) => !currentDrafts[item.id])
          || Object.keys(currentDrafts).some((id) => !itemIds.has(Number(id)));
        if (needsDrafts) {
          this.movementDrafts.update((current) => {
            const drafts: Record<number, MovementDraft> = {};
            for (const item of items) {
              drafts[item.id] = current[item.id] ?? {
                quantity: '',
                reason: '',
                unit: item.distributionUom,
                stockItemId: null,
              };
            }
            return drafts;
          });
        }
        for (const item of items) {
          this.inventory.listItemBatches(item.id).subscribe({
            next: (batches) => {
              this.returnBatches.update((current) =>
                JSON.stringify(current[item.id] ?? []) === JSON.stringify(batches)
                  ? current
                  : { ...current, [item.id]: batches },
              );
              if (batches.length && !this.movementDrafts()[item.id]?.stockItemId) {
                this.setReturnBatch(item.id, String(batches[0].id));
              }
            },
            error: () => this.returnBatches.update((current) =>
              current[item.id]?.length ? { ...current, [item.id]: [] } : current,
            ),
          });
        }
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.error.set(this.getError(error));
        if (!silent) this.loading.set(false);
      },
    });
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return Array.isArray(message) ? message.join(' ') :
        typeof message === 'string' ? message :
          error.status === 0 ? 'Could not connect to the inventory service.' :
            `Inventory request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}
