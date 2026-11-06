import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StockInService } from './stock-in.service';

interface ReportColumn {
  readonly key: string;
  readonly label: string;
}

type ReportRow = Record<string, string | number | null>;

const REPORT_COLUMNS: Record<string, readonly ReportColumn[]> = {
  summary: [
    { key: 'itemName', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'On hand' },
    { key: 'unit', label: 'Distribution UOM' },
    { key: 'reorderLevel', label: 'Reorder level' },
  ],
  'stock-in': [
    { key: 'date', label: 'Received' },
    { key: 'stockNumber', label: 'Stock number' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Purchase UOM' },
    { key: 'expiration', label: 'Expiration' },
  ],
  'stock-out': [
    { key: 'date', label: 'Date' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Issued' },
    { key: 'unit', label: 'Unit' },
    { key: 'balance', label: 'Balance after' },
    { key: 'employeeNumber', label: 'Employee number' },
  ],
  'low-stock': [
    { key: 'itemName', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'On hand' },
    { key: 'unit', label: 'Distribution UOM' },
    { key: 'reorderLevel', label: 'Reorder level' },
  ],
  'physical-count': [
    { key: 'date', label: 'Count date' },
    { key: 'sessionId', label: 'Session' },
    { key: 'itemName', label: 'Item' },
    { key: 'expected', label: 'System balance' },
    { key: 'counted', label: 'Counted' },
    { key: 'variance', label: 'Variance' },
    { key: 'unit', label: 'Unit' },
    { key: 'employeeNumber', label: 'Employee number' },
  ],
  'damage-and-expired-items': [
    { key: 'date', label: 'Date' },
    { key: 'classification', label: 'Classification' },
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'note', label: 'Details' },
  ],
  'transaction-history': [
    { key: 'date', label: 'Date' },
    { key: 'itemName', label: 'Item' },
    { key: 'action', label: 'Transaction' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'balance', label: 'Balance after' },
    { key: 'employeeNumber', label: 'Employee number' },
    { key: 'note', label: 'Details' },
  ],
};

@Component({
  selector: 'app-inventory-report-page',
  standalone: true,
  template: `
    <section class="mx-auto w-full max-w-7xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Reports</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">{{ title }}</h1>
        <p class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
      </header>

      @if (error()) {
        <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p>
      }

      <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
        @if (report !== 'summary' && report !== 'low-stock') {
        <form (submit)="applyDates($event)" class="flex flex-wrap items-end gap-3 border-b p-4">
          <label class="grid gap-1 text-xs font-medium">From
            <input type="date" [value]="from()" (change)="from.set(inputValue($event))" class="h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <label class="grid gap-1 text-xs font-medium">To
            <input type="date" [value]="to()" (change)="to.set(inputValue($event))" class="h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <button type="submit" [disabled]="loading()" class="app-button app-button-primary app-button-sm">{{ loading() ? 'Loading…' : 'Apply dates' }}</button>
          <button type="button" (click)="clearDates()" class="app-button app-button-secondary app-button-sm">Clear</button>
          <span class="text-muted-foreground ml-auto pb-2 text-xs">{{ rows().length }} records</span>
        </form>
        }

        @if (loading()) {
          <p class="text-muted-foreground p-6 text-sm">Loading report…</p>
        } @else if (rows().length === 0) {
          <p class="text-muted-foreground p-6 text-sm">No records found for this report and date range.</p>
        } @else {
          <div class="app-table-scroll">
            <table class="app-data-table min-w-[900px] text-left text-sm">
              <thead class="bg-muted/60 text-muted-foreground"><tr>
                @for (column of columns; track column.key) {
                  <th class="whitespace-nowrap px-4 py-3 font-medium">{{ column.label }}</th>
                }
              </tr></thead>
              <tbody class="divide-y">
                @for (row of rows(); track $index) {
                  <tr class="hover:bg-muted/30">
                    @for (column of columns; track column.key) {
                      <td class="max-w-[24rem] px-4 py-3">{{ display(row[column.key]) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      @if (report === 'damage-and-expired-items') {
        <p class="text-muted-foreground text-xs">Expired entries are based on receipt expiration dates; their receipt quantities are historical and are not a batch-level remaining-stock estimate.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryReportPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  private readonly route = inject(ActivatedRoute);
  protected readonly report = String(this.route.snapshot.data['report'] ?? '');
  protected readonly title = String(this.route.snapshot.data['title'] ?? 'Inventory report');
  protected readonly columns = REPORT_COLUMNS[this.report] ?? [];
  protected readonly rows = signal<ReportRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly description = this.report === 'summary'
    ? 'Current balance for active inventory items.'
    : this.report === 'low-stock'
      ? 'Active items at or below their configured reorder level.'
      : this.report === 'physical-count'
        ? 'Recorded physical count sessions, count variances, and responsible employees.'
        : this.report === 'damage-and-expired-items'
          ? 'Logged damage write-offs and receipts whose expiration date has passed.'
          : 'Inventory records from the selected date range.';

  ngOnInit(): void {
    this.load();
  }

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected display(value: ReportRow[string]): string {
    if (value === null || value === '') return '—';
    return String(value);
  }

  protected applyDates(event: Event): void {
    event.preventDefault();
    this.load();
  }

  protected clearDates(): void {
    this.from.set('');
    this.to.set('');
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.inventory.getReport(this.report, {
      ...(this.from() ? { from: this.from() } : {}),
      ...(this.to() ? { to: `${this.to()}T23:59:59.999` } : {}),
    }).subscribe({
      next: (data) => {
        this.rows.set(this.mapRows(data));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  private mapRows(data: unknown): ReportRow[] {
    if (this.report === 'damage-and-expired-items') {
      const report = this.record(data);
      const damaged = this.array(report?.['damaged']).map((value) => this.movementRow(value, 'Damaged / written off'));
      const expired = this.array(report?.['expired']).map((value) => this.expiredRow(value));
      return [...damaged, ...expired];
    }
    if (this.report === 'transaction-history') {
      const report = this.record(data);
      const movements = this.array(report?.['movements']).map((value) => this.movementRow(value));
      const legacy = this.array(report?.['legacyReceipts']).map((value) => this.stockItemRow(value, true));
      return [...movements, ...legacy];
    }
    if (this.report === 'physical-count') {
      return this.array(data).flatMap((sessionValue) => {
        const session = this.record(sessionValue);
        return this.array(session?.['counts']).map((countValue) => {
          const count = this.record(countValue);
          const item = this.record(count?.['item']);
          return {
            date: this.string(session?.['createdAt']),
            sessionId: this.number(session?.['id']),
            itemName: this.string(item?.['itemName']),
            expected: this.string(count?.['expected']),
            counted: this.string(count?.['counted']),
            variance: this.string(count?.['variance']),
            unit: this.string(item?.['distributionUom']),
            employeeNumber: this.string(session?.['employeeNumber']),
          };
        });
      });
    }
    return this.array(data).map((value) => {
      if (this.report === 'summary' || this.report === 'low-stock') {
        return this.inventoryItemRow(value);
      }
      if (this.report === 'stock-in') {
        return this.stockItemRow(value, false);
      }
      return this.movementRow(value);
    });
  }

  private inventoryItemRow(value: unknown): ReportRow {
    const item = this.record(value);
    const balance = this.record(item?.['balance']);
    return {
      itemName: this.string(item?.['itemName']),
      category: this.string(item?.['category']).replaceAll('_', ' '),
      quantity: this.string(balance?.['quantity'] ?? '0'),
      unit: this.string(item?.['distributionUom']),
      reorderLevel: this.string(item?.['reorderLevel']),
    };
  }

  private stockItemRow(value: unknown, legacy: boolean): ReportRow {
    const item = this.record(value);
    return {
      date: this.string(item?.['createdAt']),
      stockNumber: `${legacy ? 'Legacy ' : ''}${this.string(item?.['stockNumber'])}`,
      itemName: this.string(item?.['itemName']),
      quantity: this.string(item?.['quantity']),
      unit: this.string(item?.['unitOfMeasurement']),
      expiration: this.string(item?.['expirationDate']),
    };
  }

  private movementRow(value: unknown, label?: string): ReportRow {
    const movement = this.record(value);
    const item = this.record(movement?.['item']);
    const movementType = this.string(movement?.['movementType']);
    return {
      date: this.string(movement?.['createdAt']),
      classification: label ?? movementType.replaceAll('_', ' '),
      itemName: this.string(item?.['itemName']),
      action: movementType.replaceAll('_', ' '),
      quantity: this.string(movement?.['quantityEntered']),
      unit: this.string(movement?.['enteredUom']),
      balance: this.string(movement?.['balanceAfter']),
      employeeNumber: this.string(movement?.['employeeNumber']),
      note: this.string(movement?.['note']),
    };
  }

  private expiredRow(value: unknown): ReportRow {
    const item = this.record(value);
    return {
      date: this.string(item?.['expirationDate']),
      classification: 'Expired receipt',
      itemName: this.string(item?.['itemName']),
      quantity: this.string(item?.['quantity']),
      unit: this.string(item?.['unitOfMeasurement']),
      note: `Stock number ${this.string(item?.['stockNumber'])}`,
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
