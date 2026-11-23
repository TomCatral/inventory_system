import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, interval } from 'rxjs';
import { InventoryService, type GoodsReceiptRecord, type InventoryItem, type StockBatch, type StockItem } from '../services/inventory.service';
import { ItemSetupPageComponent } from '../items/item-setup-page.component';
import { AuthService } from '../Auth/auth.service';

type DeliveryDetails = {
  supplier: string;
  deliveredBy: string;
  deliveryReference: string;
  deliveryDate: string;
  stockClassification: 'OLD' | 'NEW';
  remarks: string;
};

type ReceiptRow = {
  expected: string;
  qty: string;
  hasExpiry: boolean;
  expiry: string;
  delivery: DeliveryDetails | null;
};

type PostingLine = {
  itemId: number;
  quantity: number;
  expectedQuantity: number;
  expirationDate?: string;
};

type ReceiptGroup = { delivery: DeliveryDetails; items: PostingLine[] };

@Component({
  selector: 'app-stock-in-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe, RouterLink, ItemSetupPageComponent],
  templateUrl: './stock-in-page.component.html',
  styleUrl: './stock-in-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockInPageComponent {
  private readonly svc = inject(InventoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly draftStorageKey = 'inventory-stock-in-draft-lines-v1';

  readonly stockOnHandOnly = this.route.snapshot.data['stockOnHandOnly'] === true;

  readonly items = signal<InventoryItem[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly stockSearch = signal('');
  readonly selectedCategory = signal('');
  readonly selectedItemId = signal<number | null>(null);
  readonly showItemDropdown = signal(false);
  readonly errorMsg = signal('');
  readonly showCatalog = signal(false);
  readonly showStockEntryEditor = signal(false);
  readonly catalogItemToEdit = signal<InventoryItem | null>(null);
  readonly openItemMenuId = signal<number | null>(null);
  readonly openSupplierMenuId = signal<number | null>(null);
  readonly deletingStockItemId = signal<number | null>(null);
  readonly editingStockItemId = signal<number | null>(null);
  readonly expandedSupplierRowId = signal<number | null>(null);
  readonly postingReceipt = signal(false);
  readonly receiptMessage = signal('');
  readonly postedReceipts = signal<GoodsReceiptRecord[]>([]);
  readonly batchMap = signal<Record<number, StockBatch[]>>({});
  readonly delivery = signal<DeliveryDetails>({
    supplier: '',
    deliveredBy: '',
    deliveryReference: '',
    deliveryDate: this.todayValue(),
    stockClassification: 'NEW',
    remarks: '',
  });

  // per-row qty + expiry state
  readonly qtyMap = signal<Record<number, ReceiptRow>>({});

  // fields for the item currently being added
  readonly draftExpected = signal('');
  readonly draftQty = signal('');
  readonly draftHasExpiry = signal(false);
  readonly draftExpiry = signal('');

  constructor() {
    this.load();
    this.loadReceipts();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.load(true);
        this.loadReceipts();
      });
  }

  printStockOnHand(): void {
    const originalTitle = document.title;
    document.title = 'Stock on Hand';
    document.body.classList.add('printing-stock-on-hand');
    window.addEventListener('afterprint', () => {
      document.title = originalTitle;
      document.body.classList.remove('printing-stock-on-hand');
    }, { once: true });
    window.print();
  }

  catalogChanged(): void {
    this.load();
  }

  private loadReceipts(): void {
    this.svc.listGoodsReceipts().subscribe({
      next: (receipts) => {
        this.postedReceipts.set(receipts);
      },
      error: () => this.postedReceipts.set([]),
    });
  }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.svc.listItems({ status: 'ACTIVE' }).subscribe({
      next: items => {
        this.items.set(items);
        const previousBatches = this.batchMap();
        const batches: Record<number, StockBatch[]> = {};
        for (const item of items) batches[item.id] = previousBatches[item.id] ?? [];
        const sameBatches = Object.keys(previousBatches).length === items.length
          && items.every((item) => previousBatches[item.id] !== undefined);
        if (!sameBatches) this.batchMap.set(batches);
        for (const item of items) {
          this.svc.listItemBatches(item.id).subscribe({
            next: (itemBatches) => this.batchMap.update((current) =>
              JSON.stringify(current[item.id] ?? []) === JSON.stringify(itemBatches)
                ? current
                : { ...current, [item.id]: itemBatches },
            ),
            error: () => this.batchMap.update((current) =>
              current[item.id]?.length ? { ...current, [item.id]: [] } : current,
            ),
          });
        }
        const storedRows = this.readStoredDraftRows();
        const currentRows = this.qtyMap();
        const itemIds = new Set(items.map((item) => item.id));
        const needsRows = items.some((item) => !(item.id in currentRows))
          || Object.keys(currentRows).some((id) => !itemIds.has(Number(id)));
        if (needsRows) {
          this.qtyMap.update((rows) => {
            const next: Record<number, ReceiptRow> = {};
            for (const item of items) {
              next[item.id] = rows[item.id] ?? storedRows[item.id] ?? this.blankRow();
            }
            return next;
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

  get receiptLines(): InventoryItem[] {
    // Keep the complete active catalog visible even when a receipt row has
    // no delivery details or received quantity yet.
    const query = this.stockSearch().trim().toLowerCase();
    if (!query) return this.items();
    return this.items().filter((item) =>
      item.itemName.toLowerCase().includes(query) ||
      (item.itemCode || '').toLowerCase().includes(query) ||
      (item.brand || '').toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query),
    );
  }

  get catalogCategories(): string[] {
    return [...new Set(this.items().map((item) => item.category))];
  }

  get availableCatalogItems(): InventoryItem[] {
    const query = this.search().trim().toLowerCase();
    return this.items().filter((item) =>
      (!this.selectedCategory() || item.category === this.selectedCategory()) &&
      (!query ||
        item.itemName.toLowerCase().includes(query) ||
        (item.itemCode || '').toLowerCase().includes(query) ||
        (item.brand || '').toLowerCase().includes(query))
    );
  }

  oldStockBaseUnits(item: InventoryItem): number {
    const batches = this.batchMap()[item.id] ?? [];
    const oldFromBatches = batches
      .filter((batch) => batch.stockClassification === 'OLD')
      .reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
    const totalBatched = batches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
    return oldFromBatches + Math.max(0, this.balance(item) - totalBatched);
  }

  newStockBaseUnits(item: InventoryItem): number {
    return (this.batchMap()[item.id] ?? [])
      .filter((batch) => batch.stockClassification !== 'OLD')
      .reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
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

  toggleSupplierDetails(itemId: number, event?: Event): void {
    const target = event?.target;
    if (target instanceof Element && target.closest('button, select, input, a')) return;
    this.expandedSupplierRowId.update((current) => current === itemId ? null : itemId);
  }

  latestReceiptItem(itemId: number) {
    for (const r of this.postedReceipts()) {
      const match = r.items?.find((line) => line.itemId === itemId);
      if (match) {
        return { receipt: r, line: match };
      }
    }
    return null;
  }

  latestDelivery(itemId: number): DeliveryDetails | null {
    const row = this.qtyMap()[itemId];
    if (row?.delivery) return row.delivery;
    const found = this.latestReceiptItem(itemId);
    return found ? this.deliveryFromReceipt(found.receipt) : null;
  }

  private latestReceiptItemForSupplier(itemId: number, supplier: string) {
    const target = supplier.trim().toLowerCase();
    for (const receipt of this.postedReceipts()) {
      const match = receipt.items?.find((line) =>
        line.itemId === itemId &&
        (line.supplier || receipt.supplier || '').trim().toLowerCase() === target,
      );
      if (match) return { receipt, line: match };
    }
    return null;
  }

  supplierBalances(itemId: number): Array<{ supplier: string; balance: number; stockItemId: number }> {
    const latestBySupplier = new Map<string, { line: StockItem; supplier: string }>();
    for (const receipt of this.postedReceipts()) {
      for (const line of receipt.items ?? []) {
        if (line.itemId !== itemId) continue;
        const supplier = (line.supplier || receipt.supplier || '').trim();
        const key = supplier.toLowerCase();
        if (!supplier || latestBySupplier.has(key)) continue;
        latestBySupplier.set(key, { line, supplier });
      }
    }
    return [...latestBySupplier.values()]
      .map(({ line, supplier }) => {
        const expected = Number(line.expectedQuantity ?? line.quantity ?? 0);
        const received = Number(line.quantity ?? 0);
        return {
          supplier,
          balance: Math.round(Math.max(0, expected - received) * 1000) / 1000,
          stockItemId: line.id,
        };
      })
      .filter((row) => row.balance > 0);
  }

  receiveSupplierBalance(
    item: InventoryItem,
    balance: { supplier: string; balance: number; stockItemId: number },
  ): void {
    const found = this.latestReceiptItemForSupplier(item.id, balance.supplier);
    if (!found) return;
    const expected = Number(found.line.expectedQuantity ?? found.line.quantity ?? 0);
    const received = Number(found.line.quantity ?? 0);
    this.openItemMenuId.set(null);
    this.editingStockItemId.set(found.line.id);
    this.delivery.set(this.deliveryFromReceipt(found.receipt));
    this.selectedItemId.set(item.id);
    this.search.set(`${item.itemCode || `ITM-${item.id}`} · ${item.itemName}`);
    this.draftExpected.set(String(expected));
    this.draftQty.set(String(received + balance.balance));
    this.draftHasExpiry.set(!!found.line.expirationDate);
    this.draftExpiry.set(found.line.expirationDate?.substring(0, 10) ?? '');
    this.showItemDropdown.set(false);
    this.errorMsg.set('');
    document.getElementById('delivery-details-title-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private deliveryFromReceipt(receipt: GoodsReceiptRecord): DeliveryDetails {
    return {
      supplier: receipt.supplier,
      deliveredBy: receipt.deliveredBy,
      deliveryReference: receipt.deliveryReference || receipt.receiptNumber,
      deliveryDate: receipt.deliveryDate?.substring(0, 10) || this.todayValue(),
      stockClassification: receipt.stockClassification || 'NEW',
      remarks: receipt.remarks || '',
    };
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.showItemDropdown() && !target?.closest('.receipt-item-controls')) {
      this.showItemDropdown.set(false);
    }
    if (this.openItemMenuId() !== null && !target?.closest('.receipt-row-actions')) {
      this.openItemMenuId.set(null);
    }
    if (this.openSupplierMenuId() !== null && !target?.closest('.supplier-row-actions')) {
      this.openSupplierMenuId.set(null);
    }
  }

  openCreateCatalogItem(): void {
    this.catalogItemToEdit.set(null);
    this.showCatalog.set(true);
  }

  editCatalogItem(item: InventoryItem): void {
    this.openItemMenuId.set(null);
    this.openSupplierMenuId.set(null);
    this.catalogItemToEdit.set(item);
    this.showCatalog.set(true);
  }

  closeCatalog(): void {
    this.showCatalog.set(false);
    this.catalogItemToEdit.set(null);
  }

  closeStockEntryEditor(): void {
    this.showStockEntryEditor.set(false);
    this.finishDraft();
  }

  selectCatalogItem(item: InventoryItem): void {
    this.selectedItemId.set(item.id);
    this.search.set(item.itemName);
    this.showItemDropdown.set(false);
    this.resetDraft();
  }

  get selectedCatalogItem(): InventoryItem | null {
    const itemId = this.selectedItemId();
    return itemId ? (this.items().find((item) => item.id === itemId) ?? null) : null;
  }

  addReceiptItem(): void {
    const itemId = this.selectedItemId();
    if (!itemId) return;
    const selectedItem = this.selectedCatalogItem;
    if (!selectedItem) return;
    const delivery = this.delivery();
    if (!delivery.supplier.trim() || !delivery.deliveredBy.trim()) {
      this.errorMsg.set('Enter the supplier/source and the person who delivered the items before adding an item.');
      return;
    }
    const quantity = Number(this.draftQty());
    if (!(quantity > 0)) {
      this.errorMsg.set('Enter the received quantity before adding the item.');
      return;
    }
    if (this.draftHasExpiry() && !this.draftExpiry()) {
      this.errorMsg.set('Select the expiry date for this delivery before adding the item.');
      return;
    }
    const expected = Number(this.draftExpected().trim() || this.draftQty().trim());
    const stockItemId = this.editingStockItemId();

    this.postingReceipt.set(true);
    this.errorMsg.set('');
    this.receiptMessage.set('');

    if (stockItemId !== null) {
      this.svc.updateStockInLine(stockItemId, {
        quantity,
        expectedQuantity: expected,
        expirationDate: this.draftHasExpiry() && this.draftExpiry() ? this.draftExpiry() : null,
      }).subscribe({
        next: () => {
          this.postingReceipt.set(false);
          const balance = Math.max(0, Math.round((expected - quantity) * 1000) / 1000);
          this.receiptMessage.set(
            `Updated ${selectedItem.itemName} (${delivery.supplier.trim()}): received ${quantity} ${selectedItem.purchaseUom}, supplier balance ${balance} ${selectedItem.purchaseUom}.`,
          );
          this.finishDraft();
          this.load();
          this.loadReceipts();
        },
        error: (error: unknown) => {
          this.postingReceipt.set(false);
          this.errorMsg.set(this.errMsg(error));
        },
      });
      return;
    }

    this.svc.createGoodsReceipt({
      supplier: delivery.supplier.trim(),
      deliveredBy: delivery.deliveredBy.trim(),
      deliveryReference: delivery.deliveryReference.trim(),
      deliveryDate: delivery.deliveryDate,
      stockClassification: delivery.stockClassification,
      remarks: delivery.remarks.trim(),
      items: [{
        itemId: selectedItem.id,
        quantity,
        expectedQuantity: expected,
        ...(this.draftHasExpiry() && this.draftExpiry() ? { expirationDate: this.draftExpiry() } : {}),
      }],
    }).subscribe({
      next: (receipt) => {
        this.postingReceipt.set(false);
        this.receiptMessage.set(
          `Successfully received ${quantity} ${selectedItem.purchaseUom} of ${selectedItem.itemName} (${receipt.receiptNumber}). Stock and Available balances updated immediately!`
        );
        this.qtyMap.update((rows) => ({
          ...rows,
          [itemId]: {
            expected: String(expected),
            qty: String(quantity),
            hasExpiry: this.draftHasExpiry(),
            expiry: this.draftHasExpiry() ? this.draftExpiry() : '',
            delivery: this.cloneDelivery(delivery),
          },
        }));
        this.finishDraft();
        this.load();
        this.loadReceipts();
      },
      error: (error: unknown) => {
        this.postingReceipt.set(false);
        this.errorMsg.set(this.errMsg(error));
      },
    });
  }

  private finishDraft(): void {
    this.showStockEntryEditor.set(false);
    this.editingStockItemId.set(null);
    this.selectedItemId.set(null);
    this.search.set('');
    this.showItemDropdown.set(false);
    this.openItemMenuId.set(null);
    this.resetDraft();
    this.draftHasExpiry.set(false);
    this.draftExpiry.set('');
  }

  addAdditionalDelivery(item: InventoryItem): void {
    const pendShortage = this.shortage(item.id);
    this.editingStockItemId.set(null);
    this.selectedItemId.set(item.id);
    this.search.set(`${item.itemCode || `ITM-${item.id}`} · ${item.itemName}`);
    this.draftExpected.set(pendShortage > 0 ? String(pendShortage) : '');
    this.draftQty.set(pendShortage > 0 ? String(pendShortage) : '');
    this.draftHasExpiry.set(false);
    this.draftExpiry.set('');
    this.showItemDropdown.set(false);
    const existing = this.latestDelivery(item.id);
    if (existing) {
      this.delivery.set({
        supplier: existing.supplier,
        deliveredBy: '',
        deliveryReference: '',
        deliveryDate: this.todayValue(),
        stockClassification: 'NEW',
        remarks: pendShortage > 0 ? `Additional delivery from supplier for remaining ${pendShortage} ${item.purchaseUom}` : '',
      });
    }
    document.getElementById('delivery-details-title-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  addAdditionalForSupplier(item: InventoryItem, batch: StockBatch): void {
    this.addAdditionalDelivery(item);
    this.delivery.update((current) => ({
      ...current,
      supplier: batch.supplier || current.supplier,
      remarks: batch.supplier
        ? `Additional stock from ${batch.supplier}`
        : current.remarks,
    }));
    this.expandedSupplierRowId.set(null);
    if (this.stockOnHandOnly) this.showStockEntryEditor.set(true);
  }

  editSupplierStockEntry(item: InventoryItem, batch: StockBatch): void {
    this.openItemMenuId.set(null);
    this.editingStockItemId.set(batch.id);
    this.delivery.set({
      supplier: batch.supplier || '',
      deliveredBy: batch.deliveredBy || '',
      deliveryReference: batch.deliveryReference || '',
      deliveryDate: batch.deliveryDate?.substring(0, 10) || this.todayValue(),
      stockClassification: batch.stockClassification,
      remarks: batch.remarks || '',
    });
    this.selectedItemId.set(item.id);
    this.search.set(`${item.itemCode || `ITM-${item.id}`} · ${item.itemName}`);
    this.draftExpected.set(String(batch.expectedQuantity || batch.quantity || ''));
    this.draftQty.set(String(batch.quantity || ''));
    this.draftHasExpiry.set(!!batch.expirationDate);
    this.draftExpiry.set(batch.expirationDate?.substring(0, 10) || '');
    this.showItemDropdown.set(false);
    this.errorMsg.set('');
    this.expandedSupplierRowId.set(null);
    if (this.stockOnHandOnly) this.showStockEntryEditor.set(true);
    document.getElementById('delivery-details-title-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  deleteSupplierStockEntry(item: InventoryItem, batch: StockBatch): void {
    this.openSupplierMenuId.set(null);
    if (!confirm(`Delete this stock entry from ${batch.supplier || 'the supplier'}? Its quantity will be removed from ${item.itemName} stock.`)) return;
    this.deletingStockItemId.set(batch.id);
    this.errorMsg.set('');
    this.svc.deleteStockInLine(batch.id).subscribe({
      next: () => {
        this.deletingStockItemId.set(null);
        this.receiptMessage.set(`Deleted the stock entry from ${batch.supplier || 'the supplier'}.`);
        this.load();
        this.loadReceipts();
      },
      error: (error: unknown) => {
        this.deletingStockItemId.set(null);
        this.errorMsg.set(this.errMsg(error));
      },
    });
  }

  draftShortage(): number {
    const exp = Number(this.draftExpected());
    const qty = Number(this.draftQty());
    if (exp > 0 && qty > 0 && exp > qty) {
      return Math.round((exp - qty) * 1000) / 1000;
    }
    return 0;
  }

  setDraftExpected(value: string): void {
    this.draftExpected.set(value);
  }

  setDraftQty(value: string): void {
    this.draftQty.set(value);
  }

  toggleDraftExpiry(): void {
    this.draftHasExpiry.update((value) => !value);
    if (!this.draftHasExpiry()) this.draftExpiry.set('');
  }

  setDraftExpiry(value: string): void {
    this.draftExpiry.set(value);
  }

  private resetDraft(): void {
    this.draftExpected.set('');
    this.draftQty.set('');
    this.editingStockItemId.set(null);
  }

  projectedStock(item: InventoryItem): number {
    return this.balance(item);
  }

  completePurchaseUnits(item: InventoryItem): number {
    const factor = Number(item.conversionFactor || 1);
    return factor > 0 ? Math.floor((this.projectedStock(item) + 1e-9) / factor) : 0;
  }

  hasPackConversion(item: InventoryItem): boolean {
    return Number(item.conversionFactor || 1) !== 1 || item.purchaseUom.toLowerCase() !== item.distributionUom.toLowerCase();
  }

  needsReorder(item: InventoryItem): boolean {
    return this.projectedStock(item) <= this.reorderThresholdBase(item);
  }

  reorderThresholdBase(item: InventoryItem): number {
    return Number(item.reorderLevel || 0) * Number(item.conversionFactor || 1);
  }

  draftComputedStock(item: InventoryItem): number {
    const qty = Number(this.draftQty() || 0);
    const factor = Number(item.conversionFactor || 1);
    return qty * (factor > 0 ? factor : 1);
  }

  shortage(itemId: number): number {
    const row = this.qtyMap()[itemId];
    if (row && Number(row.expected) > 0) {
      return Math.max(0, Number(row.expected) - Number(row.qty || 0));
    }
    const found = this.latestReceiptItem(itemId);
    if (found) {
      const exp = Number(found.line.expectedQuantity || 0);
      const rec = Number(found.line.quantity || 0);
      if (exp > rec) return Math.max(0, exp - rec);
    }
    return 0;
  }

  get lowStockCount(): number {
    return this.items().filter((item) => {
      const quantity = this.balance(item);
      return quantity > 0 && quantity <= this.reorderThresholdBase(item);
    }).length;
  }

  get outOfStockCount(): number {
    return this.items().filter((item) => this.balance(item) <= 0).length;
  }

  get receiptLineCount(): number {
    return Object.values(this.qtyMap()).filter((row) => Number(row.qty) > 0).length;
  }

  get receiverName(): string {
    return this.auth.profile()?.name || 'Signed-in inventory officer';
  }

  postReceipt(): void {
    if (this.postingReceipt()) return;

    const groups = new Map<string, ReceiptGroup>();
    for (const item of this.items()) {
      const row = this.qtyMap()[item.id];
      if (!row) continue;
      const quantity = Number(row.qty);
      if (!(quantity > 0)) continue;
      const delivery = row.delivery ?? this.delivery();
      const key = [delivery.supplier.trim(), delivery.deliveredBy.trim(), delivery.deliveryReference.trim(), delivery.deliveryDate, delivery.stockClassification].join('|');
      let group = groups.get(key);
      if (!group) {
        group = { delivery, items: [] };
        groups.set(key, group);
      }
      group.items.push({
        itemId: item.id,
        quantity,
        expectedQuantity: Number(row.expected || quantity),
        ...(row.hasExpiry && row.expiry ? { expirationDate: row.expiry } : {}),
      });
    }

    if (!groups.size) {
      this.errorMsg.set('Enter a received quantity for at least one item.');
      return;
    }

    this.postingReceipt.set(true);
    this.errorMsg.set('');
    this.receiptMessage.set('');
    forkJoin(
      [...groups.values()].map((group) => this.svc.createGoodsReceipt({
        supplier: group.delivery.supplier.trim(),
        deliveredBy: group.delivery.deliveredBy.trim(),
        deliveryReference: group.delivery.deliveryReference.trim(),
        deliveryDate: group.delivery.deliveryDate,
        stockClassification: group.delivery.stockClassification,
        remarks: group.delivery.remarks.trim(),
        items: group.items,
      })),
    ).subscribe({
      next: (receipts) => {
        this.receiptMessage.set(receipts.length === 1
          ? `${receipts[0].receiptNumber} posted successfully with ${receipts[0].items.length} item line(s).`
          : `${receipts.length} goods receipts posted successfully: ${receipts.map((receipt) => receipt.receiptNumber).join(', ')}.`);
        this.postingReceipt.set(false);
        this.delivery.set({ supplier: '', deliveredBy: '', deliveryReference: '', deliveryDate: this.todayValue(), stockClassification: 'NEW', remarks: '' });
        this.draftHasExpiry.set(false);
        this.draftExpiry.set('');
        this.qtyMap.set(Object.fromEntries(
          this.items().map((item) => [item.id, this.blankRow()]),
        ));
        this.clearStoredDraftRows();
        this.selectedCategory.set('');
        this.selectedItemId.set(null);
        this.showItemDropdown.set(false);
        this.search.set('');
        this.load();
        this.loadReceipts();
      },
      error: (error: unknown) => {
        this.errorMsg.set(this.errMsg(error));
        this.postingReceipt.set(false);
      },
    });
  }

  private blankRow(): ReceiptRow {
    return { expected: '', qty: '', hasExpiry: false, expiry: '', delivery: null };
  }

  private cloneDelivery(delivery: DeliveryDetails): DeliveryDetails {
    return { ...delivery };
  }

  private readStoredDraftRows(): Record<number, ReceiptRow> {
    try {
      const stored = localStorage.getItem(this.draftStorageKey);
      if (!stored) return {};
      const parsed = JSON.parse(stored) as Record<string, ReceiptRow>;
      return Object.fromEntries(
        Object.entries(parsed).map(([id, row]) => [Number(id), row]),
      );
    } catch {
      return {};
    }
  }

  private clearStoredDraftRows(): void {
    try {
      localStorage.removeItem(this.draftStorageKey);
    } catch {
      // Ignore browser storage restrictions after a successful post.
    }
  }

  setDelivery(field: keyof DeliveryDetails, value: string): void {
    this.delivery.update((current) => ({ ...current, [field]: value }));
  }

  balance(item: InventoryItem): number {
    return +(item.balance?.quantity ?? 0);
  }

  private errMsg(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg)) return msg.join(' ');
      if (e.status === 0) return 'Cannot connect to server.';
      return `Error ${e.status}`;
    }
    return e instanceof Error ? e.message : 'Unexpected error.';
  }

  private todayValue(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }
}

