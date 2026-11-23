import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, interval, of } from 'rxjs';
import { InventoryService, type InventoryItem, type StockBatch } from '../services/inventory.service';
import { ItemSetupPageComponent } from '../items/item-setup-page.component';

interface ReportColumn {
  readonly key: string;
  readonly label: string;
}

type ReportRow = Record<string, string | number | null>;

interface HistoryDelivery {
  readonly date: string;
  readonly stockNumber: string;
  readonly receiptNumber: string;
  readonly supplier: string;
  readonly deliveredBy: string;
  readonly delivererCode: string;
  readonly receivedBy: string;
  readonly reference: string;
  readonly expected: string;
  readonly quantity: string;
  readonly remaining: string;
  readonly expiration: string;
  readonly classification: string;
  readonly remarks: string;
}

interface ItemHistory {
  readonly itemId: number;
  readonly itemName: string;
  readonly itemCode: string;
  readonly brand: string;
  readonly category: string;
  readonly stock: string;
  readonly reorder: string;
  readonly deliveries: HistoryDelivery[];
}

interface SummarySource {
  readonly item: Record<string, unknown> | null;
  readonly balance: Record<string, unknown> | null;
  readonly stockItems: unknown[];
}

interface SupplyTotal {
  readonly key: string;
  readonly itemCode: string;
  readonly itemName: string;
  readonly unit: string;
  readonly quantity: number;
  readonly label: string;
}

interface SupplyTotalBucket {
  readonly key: string;
  readonly itemCode: string;
  readonly itemName: string;
  readonly unit: string;
  readonly purchaseUom: string;
  readonly distributionUom: string;
  readonly conversionFactor: number;
  quantity: number;
}

interface EmployeeSupplyGroup {
  readonly key: string;
  readonly employeeName: string;
  readonly employeeNumber: string;
  readonly supplies: ReportRow[];
  readonly itemCount: number;
  readonly issueCount: number;
  readonly totals: SupplyTotal[];
}

const REPORT_COLUMNS: Record<string, readonly ReportColumn[]> = {
  summary: [
    { key: 'item', label: 'Item' },
    { key: 'brand', label: 'Brand' },
    { key: 'stock', label: 'Stock' },
    { key: 'expected', label: 'Expected' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'procurement', label: 'Procurement' },
    { key: 'actions', label: 'Actions' },
  ],
  'stock-in': [
    { key: 'date', label: 'Received' },
    { key: 'stockNumber', label: 'Stock number' },
    { key: 'itemCode', label: 'Item code' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'expectedQuantity', label: 'Expected' },
    { key: 'shortageQuantity', label: 'Short / pending' },
    { key: 'unit', label: 'Purchase UOM' },
    { key: 'supplier', label: 'Supplier / Source' },
    { key: 'deliveredBy', label: 'Delivered by' },
    { key: 'deliveryReference', label: 'Delivery reference' },
    { key: 'expiration', label: 'Expiration' },
  ],
  'stock-out': [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Reference' },
    { key: 'itemCode', label: 'Item code' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Issued' },
    { key: 'unit', label: 'Unit' },
    { key: 'balance', label: 'Balance after' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'employeeNumber', label: 'Employee #' },
  ],
  'low-stock': [
    { key: 'itemCode', label: 'Item code' },
    { key: 'itemName', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'stock', label: 'Stock' },
    { key: 'reorderLevel', label: 'Reorder level' },
    { key: 'actions', label: 'Actions' },
  ],
  'damage-and-expired-items': [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Reference' },
    { key: 'itemCode', label: 'Item code' },
    { key: 'itemName', label: 'Item' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'classification', label: 'Return reason' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'employeeName', label: 'Recorded by' },
    { key: 'note', label: 'Details' },
  ],
  'employee-supplies': [
    { key: 'issuedAt', label: 'Date issued' },
    { key: 'employeeName', label: 'Employee' },
    { key: 'employeeNumber', label: 'Employee #' },
    { key: 'itemCode', label: 'Item code' },
    { key: 'itemName', label: 'Item' },
    { key: 'issuedQuantity', label: 'Quantity issued' },
    { key: 'baseQuantity', label: 'Base quantity' },
    { key: 'unit', label: 'Base unit' },
    { key: 'reference', label: 'Reference' },
    { key: 'issuedBy', label: 'Issued by' },
  ],
  'transaction-history': [
    { key: 'date', label: 'Date & time' },
    { key: 'reference', label: 'Reference' },
    { key: 'status', label: 'Status' },
    { key: 'action', label: 'Activity' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'recipient', label: 'Recipient / Requester' },
    { key: 'employeeName', label: 'Issued / performed by' },
    { key: 'decisionBy', label: 'Approved / processed by' },
    { key: 'note', label: 'Remarks / reason' },
  ],
  'borrowed-supplies': [
    { key: 'referenceNumber', label: 'Control no.' },
    { key: 'borrowedAt', label: 'Date borrowed' },
    { key: 'borrowerName', label: 'Borrower' },
    { key: 'department', label: 'Department' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantityLabel', label: 'Quantity' },
    { key: 'status', label: 'Status' },
    { key: 'expectedReturnAt', label: 'Expected return' },
    { key: 'photoData', label: 'Photo' },
    { key: 'actions', label: 'Actions' },
  ],
};

@Component({
  selector: 'app-inventory-report-page',
  standalone: true,
  imports: [ItemSetupPageComponent],
  templateUrl: './inventory-report-page.component.html',
  styleUrl: './inventory-report-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryReportPageComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  protected readonly report = String(this.route.snapshot.data['report'] ?? '');
  protected readonly title = String(this.route.snapshot.data['title'] ?? 'Inventory report');
  protected readonly columns = REPORT_COLUMNS[this.report] ?? [];
  protected readonly rows = signal<ReportRow[]>([]);
  protected readonly search = signal('');
  protected readonly filteredRows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.rows();
    return this.rows().filter((row) => Object.entries(row).some(([key, value]) =>
      `${value ?? ''} ${this.display(value, key)}`.toLocaleLowerCase().includes(query),
    ));
  });
  protected readonly employeeSupplyGroups = computed<EmployeeSupplyGroup[]>(() => {
    const groups = new Map<string, {
      employeeName: string;
      employeeNumber: string;
      supplies: ReportRow[];
      items: Set<string>;
    }>();
    for (const row of this.filteredRows()) {
      const employeeName = this.display(row['employeeName']);
      const employeeNumber = this.display(row['employeeNumber']);
      const key = `${employeeNumber}|${employeeName}`;
      let current = groups.get(key);
      if (!current) {
        current = {
          employeeName,
          employeeNumber,
          supplies: [],
          items: new Set<string>(),
        };
        groups.set(key, current);
      }
      current.supplies.push(row);
      current.items.add(`${this.display(row['itemCode'])}|${this.display(row['itemName'])}`);
    }
    return [...groups.entries()].map(([key, group]) => ({
      key,
      employeeName: group.employeeName,
      employeeNumber: group.employeeNumber,
      supplies: group.supplies,
      itemCount: group.items.size,
      issueCount: group.supplies.length,
      totals: this.supplyTotals(group.supplies),
    }));
  });

  protected readonly grandSupplyTotals = computed<SupplyTotal[]>(
    () => this.supplyTotals(this.filteredRows()),
  );

  protected readonly reorderCount = computed(
    () => this.filteredRows().filter((row) => row['procurement'] === 'Reorder required').length,
  );

  protected readonly borrowedPendingCount = computed(
    () => this.filteredRows().filter((row) => String(row['status']).toUpperCase() === 'PENDING').length,
  );

  protected readonly borrowedReturnedCount = computed(
    () => this.filteredRows().filter((row) => String(row['status']).toUpperCase() === 'RETURNED').length,
  );
  protected readonly borrowedStatusTabs = [
    { label: 'All', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Returned', value: 'RETURNED' },
  ] as const;
  protected readonly receiptCopies = [
    { key: 'CLIENT', label: "Client's Copy" },
    { key: 'OFFICE', label: 'Office Copy' },
  ] as const;
  protected readonly borrowedStatusFilter = signal<'ALL' | 'PENDING' | 'RETURNED'>('ALL');
  protected readonly borrowedRows = computed(() => {
    const filter = this.borrowedStatusFilter();
    if (filter === 'ALL') return this.filteredRows();
    return this.filteredRows().filter((row) => String(row['status']).toUpperCase() === filter);
  });
  protected readonly printSlip = signal<ReportRow | null>(null);

  protected readonly printedAt = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  private supplyTotals(rows: ReportRow[]): SupplyTotal[] {
    const totals = new Map<string, SupplyTotalBucket>();
    for (const row of rows) {
      const quantity = Number(row['baseQuantity'] ?? row['quantity']) || 0;
      const itemCode = this.display(row['itemCode']);
      const itemName = this.display(row['itemName']) || 'Unspecified item';
      const unit = this.display(row['unit']) || this.display(row['distributionUom']) || 'unit';
      const purchaseUom = this.display(row['purchaseUom']);
      const distributionUom = this.display(row['distributionUom']) || unit;
      const conversionFactor = Number(row['conversionFactor']) || 1;
      const key = `${itemName.trim().toLocaleLowerCase()}|${purchaseUom}|${distributionUom}|${conversionFactor}`;
      const bucket = totals.get(key);
      if (bucket) {
        bucket.quantity += quantity;
      } else {
        totals.set(key, {
          key,
          itemCode,
          itemName,
          unit,
          purchaseUom,
          distributionUom,
          conversionFactor,
          quantity,
        });
      }
    }
    return [...totals.values()]
      .map((bucket) => ({
        key: bucket.key,
        itemCode: bucket.itemCode,
        itemName: bucket.itemName,
        unit: bucket.unit,
        quantity: bucket.quantity,
        label: this.quantityWithEquivalent(
          bucket.quantity,
          bucket.purchaseUom,
          bucket.distributionUom,
          bucket.conversionFactor,
        ),
      }))
      .sort((left, right) =>
        left.itemName.localeCompare(right.itemName) || left.unit.localeCompare(right.unit),
      );
  }
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly editingItem = signal<InventoryItem | null>(null);
  protected readonly loadingEditor = signal<number | null>(null);
  protected readonly historyItem = signal<ItemHistory | null>(null);
  private readonly summarySource = new Map<number, SummarySource>();
  private readonly catalogItemsMap = new Map<number, Record<string, unknown>>();
  protected readonly description = this.report === 'summary'
    ? 'Stock on hand per item. Click a row to see its complete history and breakdown.'
    : this.report === 'low-stock'
      ? 'Only items at or below their catalog reorder level, with the exact shortage and purchase-to-base conversion from the database.'
      : this.report === 'damage-and-expired-items'
      ? 'Items returned to inventory, including damaged, expired, and other returns.'
          : this.report === 'employee-supplies'
            ? 'Every supply issued to each employee with its issue date, purchase/base unit conversion, plus per-employee and overall totals.'
          : this.report === 'transaction-history'
            ? 'Audit log of stock movements, recipients, supply requests, and approval decisions.'
          : this.report === 'borrowed-supplies'
            ? 'Borrowed supplies with pending and returned status, borrower details, and return acknowledgments.'
          : 'Inventory records from the selected date range.';

  constructor() {
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    this.inventory.listBalances().subscribe({
      next: (items) => {
        for (const item of items) {
          this.catalogItemsMap.set(item.id, item as unknown as Record<string, unknown>);
        }
        this.load();
      },
      error: () => this.load(),
    });
  }

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected setBorrowedStatusFilter(value: string): void {
    if (value === 'PENDING' || value === 'RETURNED') {
      this.borrowedStatusFilter.set(value);
      return;
    }
    this.borrowedStatusFilter.set('ALL');
  }

  protected borrowedStatusLabel(value: ReportRow[string]): string {
    return String(value ?? '').toUpperCase() === 'RETURNED' ? 'Returned' : 'Pending';
  }

  protected borrowedConditionLabel(value: ReportRow[string]): string {
    const condition = String(value ?? '').toUpperCase();
    if (condition === 'GOOD' || condition === 'FAIR' || condition === 'POOR') {
      return condition.charAt(0) + condition.slice(1).toLowerCase();
    }
    return this.display(value);
  }

  protected display(value: ReportRow[string], key = ''): string {
    if (value === null || value === '') return '—';
    if ((key === 'date' || key === 'expiration' || key === 'expiry' || key === 'issuedAt' || key === 'deliveryDate' || key === 'createdAt' || key === 'borrowedAt' || key === 'expectedReturnAt' || key === 'returnedAt') && typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-PH', {
          year: 'numeric', month: 'short', day: 'numeric',
          ...(value.includes('T') ? { hour: 'numeric', minute: '2-digit' } : {}),
        }).format(date);
      }
    }
    return String(value);
  }

  protected noteBullets(value: ReportRow[string]): string[] {
    return this.display(value).split('|').map((part) => part.trim()).filter(Boolean);
  }

  protected isNumericColumn(key: string): boolean {
    return ['quantity', 'reorderLevel', 'expected', 'counted', 'variance', 'balance', 'receivedQty', 'remainingQty'].includes(key);
  }

  protected statusClass(value: ReportRow[string]): string {
    return `log-status-${String(value || 'completed').toLowerCase()}`;
  }

  protected applyDates(event: Event): void {
    event.preventDefault();
    this.load();
  }

  protected exportCsv(): void {
    const headers = this.columns.map((column) => column.label);
    const source = this.report === 'borrowed-supplies' ? this.borrowedRows() : this.filteredRows();
    const lines = [
      headers,
      ...source.map((row) => this.columns.map((column) => this.display(row[column.key], column.key))),
    ].map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.report || 'inventory-report'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected printReport(): void {
    const originalTitle = document.title;
    document.title = this.title;
    window.addEventListener('afterprint', () => { document.title = originalTitle; }, { once: true });
    window.print();
  }

  protected editCatalogItem(row: ReportRow): void {
    const id = Number(row['itemId']);
    if (!id || this.loadingEditor() !== null) return;
    this.loadingEditor.set(id);
    this.inventory.getItem(id).subscribe({
      next: (item) => {
        this.editingItem.set(item);
        this.loadingEditor.set(null);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loadingEditor.set(null);
      },
    });
  }

  protected closeEditor(): void {
    this.editingItem.set(null);
  }

  protected catalogItemSaved(): void {
    this.closeEditor();
    this.load();
  }

  protected openHistory(row: ReportRow): void {
    if (this.report !== 'summary') return;
    const itemId = Number(row['itemId']);
    const source = this.summarySource.get(itemId);
    if (!source) return;
    this.historyItem.set(this.buildHistory(itemId, source));
  }

  protected closeHistory(): void {
    this.historyItem.set(null);
  }

  private buildHistory(itemId: number, source: SummarySource): ItemHistory {
    const { item, balance, stockItems } = source;
    const itemCode = this.string(item?.['itemCode']) || (itemId ? `ITM-${String(itemId).padStart(6, '0')}` : '');
    const purchaseUom = this.string(item?.['purchaseUom']);
    const distributionUom = this.string(item?.['distributionUom']);
    const conversionFactor = Number(item?.['conversionFactor']) || 1;
    const deliveries = stockItems.map((value) => {
      const batch = this.record(value);
      const receipt = this.record(batch?.['goodsReceipt']);
      const qty = this.string(batch?.['quantity']);
      const expected = this.string(batch?.['expectedQuantity']);
      const unit = this.string(batch?.['unitOfMeasurement']) || purchaseUom;
      const expectedBase = expected ? this.stockInBaseQuantity(Number(expected) || 0, item, unit) : 0;
      const quantityBase = qty ? this.stockInBaseQuantity(Number(qty) || 0, item, unit) : 0;
      const remaining = this.string(batch?.['remainingQuantity']);
      return {
        date: this.string(batch?.['deliveryDate'] ?? batch?.['createdAt']),
        stockNumber: this.string(batch?.['stockNumber']) || '—',
        receiptNumber: this.string(receipt?.['receiptNumber']) || '—',
        supplier: this.string(batch?.['supplier'] ?? receipt?.['supplier']).trim() || '—',
        deliveredBy: this.string(batch?.['deliveredBy'] ?? receipt?.['deliveredBy']).trim() || '—',
        delivererCode: this.string(receipt?.['delivererCode']) || '—',
        receivedBy: this.string(receipt?.['receivedByName']) || this.string(receipt?.['receivedByEmpNo']) || '—',
        reference: this.string(batch?.['deliveryReference'] ?? receipt?.['deliveryReference']) || '—',
        expected: expected ? this.transactionQuantityLabel(expectedBase, item, Number(expected) || 0, unit) : '—',
        quantity: qty ? this.transactionQuantityLabel(quantityBase, item, Number(qty) || 0, unit) : '—',
        remaining: remaining !== ''
          ? this.quantityWithEquivalent(Number(remaining) || 0, purchaseUom, distributionUom, conversionFactor)
          : '—',
        expiration: this.string(batch?.['expirationDate']),
        classification: this.string(batch?.['stockClassification']) || this.string(receipt?.['stockClassification']) || 'NEW',
        remarks: this.string(batch?.['remarks']) || this.string(receipt?.['remarks']) || '',
      };
    });
    return {
      itemId,
      itemName: this.string(item?.['itemName']),
      itemCode,
      brand: this.string(item?.['brand']) || '—',
      category: this.string(item?.['category']).replaceAll('_', ' '),
      stock: this.stockDisplay(item, balance),
      reorder: `${this.string(item?.['reorderLevel'])}${purchaseUom ? ` ${purchaseUom}` : ''}`,
      deliveries,
    };
  }

  private load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }
    this.inventory.getReport(this.report, {
      ...(this.from() ? { from: this.from() } : {}),
      ...(this.to() ? { to: `${this.to()}T23:59:59.999` } : {}),
    }).subscribe({
      next: (data) => {
        const currentBreakdowns = new Map(
          this.rows().map((row) => [row['itemId'], {
            oldStockLabel: row['oldStockLabel'],
            newStockLabel: row['newStockLabel'],
          }]),
        );
        const rows = this.mapRows(data).map((row) => {
          const previous = currentBreakdowns.get(row['itemId']);
          return previous ? { ...row, ...previous } : row;
        });
        this.rows.set(rows);
        if (this.report === 'low-stock') this.loadStockBreakdowns(rows);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.error.set(this.getError(error));
        if (!silent) this.loading.set(false);
      },
    });
  }

  protected printBorrowedSlip(row: ReportRow): void {
    const originalTitle = document.title;
    this.printSlip.set(row);
    document.body.classList.add('printing-borrowed-report-slip');
    document.title = `Borrowed Supply ${this.display(row['referenceNumber'])}`;
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-borrowed-report-slip');
      this.printSlip.set(null);
      document.title = originalTitle;
    }, { once: true });
    setTimeout(() => window.print(), 0);
  }

  private loadStockBreakdowns(rows: ReportRow[]): void {
    const targets = rows.filter((row) => Number(row['itemId']) > 0);
    if (!targets.length) return;
    forkJoin(targets.map((row) =>
      this.inventory.listItemBatches(Number(row['itemId'])).pipe(
        catchError(() => of([] as StockBatch[])),
      ),
    )).subscribe({
      next: (batchesList) => {
        this.rows.update((current) => {
          let changed = false;
          const next = current.map((row) => {
            const index = targets.findIndex((target) => target['itemId'] === row['itemId']);
            if (index === -1) return row;
            const target = targets[index];
            const batches = batchesList[index] ?? [];
            const purchaseUom = this.string(target['purchaseUom']) || 'unit';
            const distributionUom = this.string(target['distributionUom']) || 'unit';
            const conversionFactor = Number(target['conversionFactor']) || 1;
            const oldStockLabel = this.stockBatchLabel(batches, true, purchaseUom, distributionUom, conversionFactor);
            const newStockLabel = this.stockBatchLabel(batches, false, purchaseUom, distributionUom, conversionFactor);
            if (row['oldStockLabel'] === oldStockLabel && row['newStockLabel'] === newStockLabel) return row;
            changed = true;
            return { ...row, oldStockLabel, newStockLabel };
          });
          return changed ? next : current;
        });
      },
    });
  }

  private stockBatchLabel(
    batches: StockBatch[],
    oldStock: boolean,
    purchaseUom: string,
    distributionUom: string,
    conversionFactor: number,
  ): string {
    const quantity = batches
      .filter((batch) => oldStock
        ? batch.stockClassification === 'OLD'
        : batch.stockClassification !== 'OLD')
      .reduce((sum, batch) => sum + (Number(batch.remainingQuantity) || 0), 0);
    if (quantity <= 0) return '';
    return this.quantityWithEquivalent(quantity, purchaseUom, distributionUom, conversionFactor);
  }

  private mapRows(data: unknown): ReportRow[] {
    if (this.report === 'summary') {
      this.summarySource.clear();
      return this.array(data).map((value) => {
        const item = this.record(value);
        const balance = this.record(item?.['balance']);
        const stockItems = this.array(item?.['stockItems']);
        const itemId = this.number(item?.['id']);
        const itemName = this.string(item?.['itemName']);
        const itemCode = this.string(item?.['itemCode']) || (itemId ? `ITM-${String(itemId).padStart(6, '0')}` : '');
        const purchaseUom = this.string(item?.['purchaseUom']);
        const latest = this.record(stockItems[0] ?? null);
        const expected = this.string(latest?.['expectedQuantity']);
        const quantity = this.string(latest?.['quantity']);
        const deliveredUnit = this.string(latest?.['unitOfMeasurement']) || purchaseUom;
        this.summarySource.set(itemId, { item, balance, stockItems });
        return {
          itemId,
          item: itemCode ? `${itemName} (${itemCode})` : itemName,
          itemName,
          itemCode,
          brand: this.string(item?.['brand']),
          stock: this.stockDisplay(item, balance),
          expected: expected ? `${expected}${deliveredUnit ? ` ${deliveredUnit}` : ''}` : '',
          quantity: quantity ? `${quantity}${deliveredUnit ? ` ${deliveredUnit}` : ''}` : '',
          expiry: this.string(latest?.['expirationDate']),
          procurement: this.needsReorder(item, balance) ? 'Reorder required' : 'Stock sufficient',
        };
      });
    }
    if (this.report === 'damage-and-expired-items') {
      const report = this.record(data);
      return this.array(report?.['returns']).map((value) => {
        const movement = this.record(value);
        const rawNote = this.string(movement?.['note']).trim();
        const parts = rawNote.split('|').map((part) => part.trim());
        let reason = '';
        let supplier = '';
        let batch = '';
        for (const part of parts) {
          if (part.toLowerCase().startsWith('reason:')) {
            reason = part.replace(/^reason:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('supplier:')) {
            supplier = part.replace(/^supplier:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('batch:')) {
            batch = part.replace(/^batch:\s*/i, '').trim();
          }
        }
        if (!reason) {
          reason = rawNote || (this.string(movement?.['movementType']) === 'RETURN_IN' ? 'Return to stock' : 'Return');
        }
        const row = this.movementRow(value, reason);
        row['supplier'] = supplier || '—';
        if (batch) row['batch'] = batch;
        return row;
      });
    }
    if (this.report === 'employee-supplies') {
      return this.array(data).map((value) => {
        const assignment = this.record(value);
        const item = this.record(assignment?.['item']);
        const itemId = this.number(assignment?.['itemId']);
        const assignmentId = this.number(assignment?.['id']);
        const baseQuantity = Number(assignment?.['quantity'] ?? 0) || 0;
        const purchaseUom = this.normalizeInventoryUom(this.string(item?.['purchaseUom']));
        const distributionUom = this.normalizeInventoryUom(this.string(item?.['distributionUom']));
        const conversionFactor = Number(item?.['conversionFactor']) || 1;
        const enteredUom = this.normalizeInventoryUom(this.string(assignment?.['enteredUom']));
        const enteredQuantity = Number(assignment?.['enteredQuantity'] ?? 0) || 0;
        const issuedQuantity = enteredUom
          ? this.enteredQuantityLabel(enteredQuantity, enteredUom, baseQuantity, distributionUom)
          : this.quantityWithEquivalent(baseQuantity, purchaseUom, distributionUom, conversionFactor);
        return {
          employeeName: this.string(assignment?.['recipientName']).trim() || 'Unnamed employee',
          employeeNumber: this.string(assignment?.['recipientEmpNo']),
          itemCode: this.string(item?.['itemCode']) || (itemId ? `ITM-${String(itemId).padStart(6, '0')}` : ''),
          itemName: this.string(item?.['itemName']),
          issuedQuantity,
          baseQuantity,
          quantity: baseQuantity,
          unit: distributionUom,
          purchaseUom,
          distributionUom,
          conversionFactor,
          issuedAt: this.string(assignment?.['createdAt']),
          reference: this.string(assignment?.['referenceNumber']) || (assignmentId ? `SUP-${String(assignmentId).padStart(6, '0')}` : ''),
          issuedBy: this.string(assignment?.['issuedByEmpNo']),
        };
      });
    }
    if (this.report === 'borrowed-supplies') {
      return this.array(data).map((value) => {
        const supply = this.record(value) ?? {};
        const baseQuantity = this.number(supply['quantity']);
        const enteredQuantity = this.number(supply['enteredQuantity']);
        const enteredUom = this.normalizeInventoryUom(this.string(supply['enteredUom']));
        const baseUom = this.normalizeInventoryUom(
          this.string(supply['distributionUom']) || this.string(supply['baseUom']),
        );
        const unit = enteredUom || baseUom;
        const displayedQuantity = enteredUom && enteredQuantity > 0 ? enteredQuantity : baseQuantity;
        return {
          id: this.number(supply['id']),
          createdAt: this.string(supply['createdAt']),
          borrowedAt: this.string(supply['borrowedAt']) || this.string(supply['createdAt']),
          referenceNumber: this.string(supply['referenceNumber']),
          borrowerName: this.string(supply['borrowerName']).trim() || 'Unnamed borrower',
          department: this.string(supply['department']),
          itemName: this.string(supply['itemName']),
          itemCode: this.string(supply['itemCode']),
          quantity: baseQuantity,
          quantityLabel: `${displayedQuantity} ${unit}`,
          unit,
          status: this.string(supply['status']).toUpperCase() || 'PENDING',
          expectedReturnAt: this.string(supply['expectedReturnAt']),
          returnedAt: this.string(supply['returnedAt']),
          issuedByName: this.string(supply['issuedByName']),
          returnedByName: this.string(supply['returnedByName']),
          conditionAtBorrow: this.string(supply['conditionAtBorrow']),
          purpose: this.string(supply['purpose']),
          photoData: this.string(supply['photoData']),
        };
      });
    }
    if (this.report === 'transaction-history') {
      const report = this.record(data);
      const movements = this.array(report?.['movements']).map((value) => this.movementRow(value));
      const legacy = this.array(report?.['legacyReceipts']).map((value) => this.stockItemRow(value, true));
      const requests = this.array(report?.['requests']).map((value) => this.requestRow(value));
      const transfers = this.array(report?.['supplyTransfers']).map((value) => this.transferRow(value));
      return [...movements, ...legacy, ...requests, ...transfers].sort((left, right) =>
        String(right['date']).localeCompare(String(left['date'])),
      );
    }
    return this.array(data).map((value) => {
      if (this.report === 'summary') {
        return this.inventoryItemRow(value);
      }
      if (this.report === 'low-stock') {
        const item = this.record(value);
        const balance = this.record(item?.['balance']);
        return this.needsReorder(item, balance) ? this.inventoryItemRow(value) : null;
      }
      if (this.report === 'stock-in') {
        return this.stockItemRow(value, false);
      }
      return this.movementRow(value);
    }).filter((row): row is ReportRow => row !== null);
  }

  private inventoryItemRow(value: unknown): ReportRow {
    const item = this.record(value);
    const balance = this.record(item?.['balance']);
    const purchaseUom = this.string(item?.['purchaseUom']);
    const distributionUom = this.string(item?.['distributionUom']);
    const conversionFactor = Number(item?.['conversionFactor'] ?? 1) || 1;
    const backendShortage = item?.['shortageBaseQuantity'];
    const balanceQuantity = Number(balance?.['quantity'] ?? 0);
    const shortageBaseQuantity = backendShortage === undefined || backendShortage === null || backendShortage === ''
      ? Math.max(0, Number(item?.['reorderLevel'] ?? 0) * conversionFactor - balanceQuantity)
      : Number(backendShortage) || 0;
    return {
      itemId: this.number(item?.['id']),
      itemName: this.string(item?.['itemName']),
      itemCode: this.string(item?.['itemCode']),
      category: this.string(item?.['category']).replaceAll('_', ' '),
      status: balanceQuantity <= 0 ? 'Out of stock' : 'Reorder required',
      stock: this.stockDisplay(item, balance),
      shortage: this.quantityWithEquivalent(shortageBaseQuantity, purchaseUom, distributionUom, conversionFactor),
      purchaseUom,
      distributionUom,
      conversionFactor,
      reorderLevel: `${this.string(item?.['reorderLevel'])} ${this.string(item?.['purchaseUom'])}`,
      actions: '',
    };
  }

  private stockDisplay(item: Record<string, unknown> | null, balance: Record<string, unknown> | null): string {
    const quantity = Number(balance?.['quantity'] ?? 0);
    return this.quantityWithEquivalent(
      quantity,
      this.string(item?.['purchaseUom']) || 'unit',
      this.string(item?.['distributionUom']) || 'unit',
      Number(item?.['conversionFactor'] ?? 1) || 1,
    );
  }

  private quantityWithEquivalent(
    quantity: number,
    purchaseUom: string,
    distributionUom: string,
    conversionFactor: number,
  ): string {
    const factor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
    const baseUom = this.normalizeInventoryUom(distributionUom);
    const purchaseUnit = this.normalizeInventoryUom(purchaseUom);
    const formatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });
    const baseLabel = `${formatter.format(quantity)} ${baseUom}`;
    if (!purchaseUnit || purchaseUnit.toLowerCase() === baseUom.toLowerCase()) {
      return baseLabel;
    }
    const packs = Math.round((quantity / factor) * 1_000_000) / 1_000_000;
    return `${formatter.format(packs)} ${purchaseUnit} = ${baseLabel}`;
  }

  private enteredQuantityLabel(
    enteredQuantity: number,
    enteredUom: string,
    baseQuantity: number,
    baseUom: string,
  ): string {
    const normalizedBaseUom = this.normalizeInventoryUom(baseUom);
    const normalizedEnteredUom = this.normalizeInventoryUom(enteredUom);
    const formatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });
    const formattedBase = formatter.format(baseQuantity);
    const formattedEntered = formatter.format(enteredQuantity);
    const baseLabel = `${formattedBase} ${normalizedBaseUom}`;
    if (!normalizedEnteredUom || normalizedEnteredUom.toLowerCase() === normalizedBaseUom.toLowerCase()) {
      return baseLabel;
    }
    return `${formattedEntered} ${normalizedEnteredUom} = ${baseLabel}`;
  }

  private normalizeInventoryUom(value: string): string {
    const unit = value.trim();
    if (!unit || /^(unit|units|piece|pieces|pc|pcs)$/i.test(unit)) return 'pcs';
    return unit;
  }

  private transactionQuantityLabel(
    baseQuantity: number,
    item: Record<string, unknown> | null,
    enteredQuantity?: number,
    enteredUom?: string,
  ): string {
    const distributionUom = this.string(item?.['distributionUom']);
    const purchaseUom = this.string(item?.['purchaseUom']);
    const conversionFactor = Number(item?.['conversionFactor']) || 1;
    if (
      enteredQuantity !== undefined &&
      enteredQuantity !== null &&
      enteredUom &&
      enteredUom.trim() &&
      enteredUom.trim().toLowerCase() !== distributionUom.trim().toLowerCase()
    ) {
      return this.enteredQuantityLabel(enteredQuantity, enteredUom, baseQuantity, distributionUom);
    }
    return this.quantityWithEquivalent(
      baseQuantity,
      purchaseUom,
      distributionUom,
      conversionFactor,
    );
  }

  private stockInBaseQuantity(
    quantity: number,
    item: Record<string, unknown> | null,
    enteredUom?: string,
  ): number {
    const uom = this.string(enteredUom);
    const distributionUom = this.string(item?.['distributionUom']) || 'unit';
    const factor = Number(item?.['conversionFactor']) || 1;
    if (factor > 1) {
      if (!uom.trim() || uom.trim().toLowerCase() !== distributionUom.trim().toLowerCase()) {
        return quantity * factor;
      }
    }
    return quantity;
  }

  private needsReorder(
    item: Record<string, unknown> | null,
    balance: Record<string, unknown> | null,
  ): boolean {
    const quantity = Number(balance?.['quantity'] ?? 0);
    const factor = Number(item?.['conversionFactor'] ?? 1) || 1;
    const threshold = Number(item?.['reorderLevel'] ?? 0) * factor;
    return quantity <= threshold;
  }

  private stockItemRow(value: unknown, legacy: boolean): ReportRow {
    const stock = this.record(value);
    const itemId = this.number(stock?.['itemId']);
    const catalogItem = itemId ? this.catalogItemsMap.get(itemId) : null;
    const item = this.record(stock?.['item']) ?? catalogItem ?? stock;
    const quantity = this.string(stock?.['quantity']);
    const unit = this.string(stock?.['unitOfMeasurement']) || this.string(item?.['purchaseUom']);
    const quantityValue = Number(quantity) || 0;
    const dbBaseQuantity = stock?.['baseQuantity'];
    const baseQuantity = dbBaseQuantity !== undefined && dbBaseQuantity !== null && dbBaseQuantity !== '' && Number(dbBaseQuantity) > 0
      ? Number(dbBaseQuantity)
      : this.stockInBaseQuantity(quantityValue, item, unit);
    return {
      date: this.string(stock?.['createdAt']),
      stockNumber: `${legacy ? 'Legacy ' : ''}${this.string(stock?.['stockNumber'])}`,
      itemCode: this.string(item?.['itemCode']) || (itemId ? `ITM-${String(itemId).padStart(6, '0')}` : ''),
      itemName: this.string(item?.['itemName'] ?? stock?.['itemName']),
      quantity,
      quantityLabel: this.transactionQuantityLabel(baseQuantity, item, quantityValue, unit),
      expectedQuantity: this.string(stock?.['expectedQuantity'] ?? stock?.['quantity']),
      shortageQuantity: this.string(stock?.['shortageQuantity'] ?? '0'),
      unit,
      supplier: this.string(stock?.['supplier']),
      deliveredBy: this.string(stock?.['deliveredBy']),
      deliveryReference: this.string(stock?.['deliveryReference']),
      expiration: this.string(stock?.['expirationDate']),
      status: legacy ? 'IMPORTED' : 'COMPLETED',
      action: legacy ? 'LEGACY STOCK IN' : 'STOCK IN',
      reference: this.string(stock?.['stockNumber']),
      recipient: '',
      employeeName: '',
      decisionBy: '',
      note: legacy ? `Imported stock record ${this.string(stock?.['stockNumber'])}` : '',
    };
  }

  private movementRow(value: unknown, label?: string): ReportRow {
    const movement = this.record(value);
    const item = this.record(movement?.['item']);
    const movementType = this.string(movement?.['movementType']);
    const quantity = this.string(movement?.['quantityEntered']);
    const unit = this.string(movement?.['enteredUom']);
    const baseQuantity = Number(movement?.['quantityBase']) || Number(quantity) || 0;
    const enteredQuantity = Number(movement?.['quantityEntered']) || 0;
    const rawNote = this.string(movement?.['note']).trim();
    return {
      date: this.string(movement?.['createdAt']),
      classification: label ?? this.movementLabel(movementType),
      reference: `MOV-${this.string(movement?.['id'])}`,
      itemCode: this.string(item?.['itemCode']),
      itemName: this.string(item?.['itemName']),
      action: this.movementLabel(movementType),
      status: 'COMPLETED',
      quantity,
      quantityLabel: this.transactionQuantityLabel(baseQuantity, item, enteredQuantity, unit),
      unit,
      balance: this.string(movement?.['balanceAfter']),
      employeeName: this.string(movement?.['employeeName']),
      employeeNumber: this.string(movement?.['employeeNumber']),
      recipient: this.recipientFromNote(rawNote),
      decisionBy: '',
      note: this.movementNote(movementType, quantity, unit, rawNote),
    };
  }

  private movementLabel(movementType: string): string {
    switch (movementType) {
      case 'DAMAGE_OUT':
        return 'Damage / write-off';
      case 'RETURN_IN':
        return 'Return to stock';
      case 'STOCK_IN':
        return 'Stock in';
      case 'STOCK_OUT':
        return 'Stock out';
      default:
        return movementType.replaceAll('_', ' ');
    }
  }

  private movementNote(
    movementType: string,
    quantity: string,
    unit: string,
    rawNote: string,
  ): string {
    const amount = `${quantity}${unit ? ` ${unit}` : ''}`.trim();
    const reason = rawNote
      ? rawNote.toLowerCase().startsWith('reason:')
        ? rawNote
        : `Reason: ${rawNote}`
      : '';
    let description = '';
    switch (movementType) {
      case 'DAMAGE_OUT':
        description = `Damaged / written off: deducted ${amount}.`;
        break;
      case 'RETURN_IN':
        description = `Returned to stock: added ${amount}.`;
        break;
      case 'STOCK_OUT':
        description = `Issued from stock: deducted ${amount}.`;
        break;
      case 'STOCK_IN':
        description = `Received into stock: added ${amount}.`;
        break;
      default:
        return rawNote || (amount ? `${this.movementLabel(movementType)}: ${amount}.` : '');
    }
    if (movementType === 'STOCK_IN' && rawNote) return rawNote;
    if (movementType === 'STOCK_OUT' && rawNote) return `${description} ${rawNote}`;
    return reason ? `${description} ${reason}` : description;
  }

  private requestRow(value: unknown): ReportRow {
    const request = this.record(value);
    const item = this.record(request?.['item']);
    const status = this.string(request?.['status']) || 'PENDING';
    const requesterName = this.string(request?.['requestedByName']) || 'PGC Employee';
    const requesterNo = this.string(request?.['requestedByEmpNo']);
    const resolverName = this.string(request?.['resolvedByName']);
    const resolverNo = this.string(request?.['resolvedByEmpNo']);
    const quantity = this.string(request?.['quantity']);
    return {
      date: this.string(request?.['resolvedAt'] ?? request?.['createdAt']),
      status,
      reference: `REQ-${this.string(request?.['id'])}`,
      action: 'SUPPLY REQUEST',
      itemName: this.string(item?.['itemName']),
      itemCode: this.string(item?.['itemCode']),
      quantity,
      quantityLabel: this.transactionQuantityLabel(Number(quantity) || 0, item),
      unit: this.string(item?.['distributionUom']),
      recipient: requesterName,
      employeeName: requesterName,
      employeeNumber: requesterNo,
      decisionBy: resolverName || (resolverNo ? 'PGC Employee' : ''),
      note: this.string(request?.['note']),
    };
  }

  private recipientFromNote(note: string): string {
    const match = note.match(/Issued to:\s*([^|]+)/i);
    return match?.[1]?.trim() ?? '';
  }

  private transferRow(value: unknown): ReportRow {
    const transfer = this.record(value);
    const assignment = this.record(transfer?.['assignment']);
    const item = this.record(assignment?.['item']);
    const transferType = this.string(transfer?.['transferType']);
    const isReturn = transferType === 'RETURN_TO_ADMIN';
    const quantity = this.string(transfer?.['quantity']);
    return {
      date: this.string(transfer?.['createdAt']),
      reference: `TRN-${this.string(transfer?.['id'])}`,
      status: 'COMPLETED',
      action: isReturn ? 'RETURN TO ADMIN' : 'STAFF TRANSFER',
      itemCode: this.string(item?.['itemCode']),
      itemName: this.string(item?.['itemName']),
      quantity,
      quantityLabel: this.transactionQuantityLabel(
        Number(quantity) || 0,
        item,
        Number(assignment?.['enteredQuantity']) || 0,
        this.string(assignment?.['enteredUom']),
      ),
      unit: this.string(item?.['distributionUom']),
      recipient: isReturn ? 'Inventory Admin' : this.string(transfer?.['toName']) || this.string(transfer?.['toEmpNo']),
      employeeName: this.string(assignment?.['recipientName']) || this.string(transfer?.['fromEmpNo']),
      decisionBy: '',
      note: this.string(transfer?.['note']) || (isReturn ? 'Returned to inventory' : 'Direct staff handover'),
    };
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
      ? value as Record<string, unknown>
      : null;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private string(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  }

  private number(value: unknown): number {
    return typeof value === 'number' ? value : 0;
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return Array.isArray(message) ? message.join(' ') :
        typeof message === 'string' ? message :
          error.status === 0 ? 'Could not connect to the inventory service.' :
            `Report request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}

