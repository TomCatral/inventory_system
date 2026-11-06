import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  StockInService,
  type InventoryItem,
} from './stock-in.service';

interface HistoryRow {
  readonly date: string;
  readonly itemName: string;
  readonly action: string;
  readonly quantity: string;
  readonly unit: string;
  readonly balance: string;
  readonly employeeNumber: string;
  readonly note: string;
}

interface CountRow {
  readonly item: InventoryItem;
  readonly countedQuantity: number | null;
}

@Component({
  selector: 'app-inventory-workflow-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  template: `
    <section class="mx-auto w-full max-w-7xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Transactions</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">{{ title }}</h1>
        @if (kind === 'return') {
          <p class="text-muted-foreground mt-1 text-sm">Record returned items back into available stock.</p>
        } @else if (kind === 'adjustment') {
          <p class="text-muted-foreground mt-1 text-sm">Record a documented balance correction, damage, or write-off.</p>
        } @else if (kind === 'physical-count') {
          <p class="text-muted-foreground mt-1 text-sm">Enter the physically counted quantity for every active item. Variances are applied and audited.</p>
        } @else {
          <p class="text-muted-foreground mt-1 text-sm">Review inventory movements with timestamps, balances, and responsible employee numbers.</p>
        }
      </header>

      @if (message()) {
        <p role="status" class="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{{ message() }}</p>
      }
      @if (error()) {
        <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p>
      }

      @if (kind === 'return' || kind === 'adjustment') {
        <form [formGroup]="form" (ngSubmit)="submitMovement()" class="rounded-xl border bg-card p-5 shadow-sm md:p-7">
          <div class="grid gap-5 sm:grid-cols-2">
            <label class="grid gap-2 text-sm font-medium sm:col-span-2">Inventory item
              <select formControlName="itemId" class="h-11 rounded-lg border bg-background px-3 font-normal" required>
                <option [ngValue]="null" disabled>Select an active item</option>
                @for (item of items(); track item.id) {
                  <option [ngValue]="item.id">{{ item.itemName }} — {{ item.balance?.quantity ?? '0' }} {{ item.distributionUom }} available</option>
                }
              </select>
            </label>
            @if (selectedItem(); as item) {
              <div class="rounded-lg bg-primary/5 p-4 text-sm sm:col-span-2">
                <span class="text-muted-foreground">Current balance</span>
                <p class="mt-1 text-lg font-semibold text-primary">{{ item.balance?.quantity ?? '0' }} {{ item.distributionUom }}</p>
              </div>
            }
            @if (kind === 'adjustment') {
              <label class="grid gap-2 text-sm font-medium">Adjustment type
                <select formControlName="adjustmentType" class="h-11 rounded-lg border bg-background px-3 font-normal">
                  <option value="INCREASE">Increase stock</option>
                  <option value="DECREASE">Decrease stock</option>
                  <option value="DAMAGE">Damaged / write-off</option>
                </select>
              </label>
            }
            <label class="grid gap-2 text-sm font-medium">Quantity ({{ selectedItem()?.distributionUom || 'distribution unit' }})
              <input formControlName="quantity" type="number" min="0.000001" step="0.000001" class="h-11 rounded-lg border bg-background px-3 font-normal" required />
            </label>
            <label class="grid gap-2 text-sm font-medium sm:col-span-2">{{ kind === 'return' ? 'Return reason' : 'Reason / reference' }}
              <textarea formControlName="reason" rows="3" maxlength="500" class="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Enter a reason for this transaction" required></textarea>
            </label>
          </div>
          <div class="mt-6 flex justify-end border-t pt-5">
            <button type="submit" [disabled]="saving()" class="app-button app-button-primary">{{ saving() ? 'Saving…' : kind === 'return' ? 'Record return' : 'Save adjustment' }}</button>
          </div>
        </form>
      } @else if (kind === 'physical-count') {
        <form (ngSubmit)="submitCount()" class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div class="flex flex-wrap items-end justify-between gap-3 border-b p-4 md:p-5">
            <label class="grid w-full gap-2 text-sm font-medium sm:max-w-xl">Count notes (optional)
              <input [value]="countNote()" (input)="countNote.set(inputValue($event))" maxlength="500" class="h-10 rounded-lg border bg-background px-3 font-normal" placeholder="Count date, location, or reference" />
            </label>
            <button type="submit" [disabled]="saving() || loading()" class="app-button app-button-primary">{{ saving() ? 'Applying count…' : 'Submit physical count' }}</button>
          </div>
          @if (loading()) {
            <p class="text-muted-foreground p-6 text-sm">Loading active inventory…</p>
          } @else if (countRows().length === 0) {
            <p class="text-muted-foreground p-6 text-sm">There are no active items to count.</p>
          } @else {
            <div class="app-table-scroll">
              <table class="app-data-table min-w-[720px] text-left text-sm">
                <thead class="bg-muted/60 text-muted-foreground"><tr><th class="px-4 py-3 font-medium">Item</th><th class="px-4 py-3 text-right font-medium">System balance</th><th class="px-4 py-3 font-medium">Unit</th><th class="px-4 py-3 font-medium">Counted quantity</th></tr></thead>
                <tbody class="divide-y">
                  @for (row of countRows(); track row.item.id) {
                    <tr>
                      <td class="px-4 py-3 font-medium">{{ row.item.itemName }}</td>
                      <td class="px-4 py-3 text-right tabular-nums">{{ row.item.balance?.quantity ?? '0' }}</td>
                      <td class="px-4 py-3">{{ row.item.distributionUom }}</td>
                      <td class="px-4 py-3"><input type="number" min="0" step="0.000001" [value]="row.countedQuantity ?? ''" (input)="updateCount(row.item.id, $event)" class="h-10 w-40 rounded-lg border bg-background px-3 text-right tabular-nums" required /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </form>
      } @else {
        <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div class="flex flex-wrap items-end gap-3 border-b p-4">
            <label class="grid gap-1 text-xs font-medium">From
              <input type="date" [value]="from()" (change)="from.set(inputValue($event))" class="h-9 rounded-md border bg-background px-2 text-sm" />
            </label>
            <label class="grid gap-1 text-xs font-medium">To
              <input type="date" [value]="to()" (change)="to.set(inputValue($event))" class="h-9 rounded-md border bg-background px-2 text-sm" />
            </label>
            <button type="button" (click)="loadHistory()" class="app-button app-button-primary app-button-sm">Apply dates</button>
          </div>
          @if (loading()) {
            <p class="text-muted-foreground p-6 text-sm">Loading transaction history…</p>
          } @else if (history().length === 0) {
            <p class="text-muted-foreground p-6 text-sm">No transactions found for this period.</p>
          } @else {
            <div class="app-table-scroll">
              <table class="app-data-table min-w-[1100px] text-left text-sm">
                <thead class="bg-muted/60 text-muted-foreground"><tr><th class="px-4 py-3 font-medium">Date</th><th class="px-4 py-3 font-medium">Item</th><th class="px-4 py-3 font-medium">Transaction</th><th class="px-4 py-3 text-right font-medium">Quantity</th><th class="px-4 py-3 text-right font-medium">Balance after</th><th class="px-4 py-3 font-medium">Employee number</th><th class="px-4 py-3 font-medium">Note</th></tr></thead>
                <tbody class="divide-y">
                  @for (row of history(); track row.date + row.itemName + row.action + row.employeeNumber) {
                    <tr>
                      <td class="whitespace-nowrap px-4 py-3">{{ row.date | date: 'medium' }}</td>
                      <td class="px-4 py-3 font-medium">{{ row.itemName }}</td>
                      <td class="px-4 py-3">{{ row.action }}</td>
                      <td class="px-4 py-3 text-right tabular-nums">{{ row.quantity | number: '1.0-6' }} {{ row.unit }}</td>
                      <td class="px-4 py-3 text-right tabular-nums">{{ row.balance | number: '1.0-6' }}</td>
                      <td class="px-4 py-3 font-mono text-xs">{{ row.employeeNumber }}</td>
                      <td class="px-4 py-3">{{ row.note || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryWorkflowPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  private readonly route = inject(ActivatedRoute);
  protected readonly kind = String(this.route.snapshot.data['workflow'] ?? 'history');
  protected readonly title = String(this.route.snapshot.data['title'] ?? 'Transactions');
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly countRows = signal<CountRow[]>([]);
  protected readonly history = signal<HistoryRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly countNote = signal('');
  protected readonly form = new FormGroup({
    itemId: new FormControl<number | null>(null, Validators.required),
    quantity: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.000001),
      Validators.max(999999999999),
    ]),
    adjustmentType: new FormControl<'INCREASE' | 'DECREASE' | 'DAMAGE'>('INCREASE', { nonNullable: true }),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });

  ngOnInit(): void {
    if (this.kind === 'history') this.loadHistory();
    else this.loadItems();
  }

  protected selectedItem(): InventoryItem | undefined {
    const id = this.form.controls.itemId.value;
    return this.items().find((item) => item.id === id);
  }

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected submitMovement(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.itemId === null || value.quantity === null) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    const request = this.kind === 'return'
      ? this.inventory.returnItems({
          itemId: value.itemId,
          quantity: value.quantity,
          reason: value.reason.trim(),
        })
      : this.inventory.adjustStock({
          itemId: value.itemId,
          quantity: value.quantity,
          adjustmentType: value.adjustmentType,
          reason: value.reason.trim(),
        });
    request.subscribe({
      next: (result) => {
        this.message.set(`${result.movementType} recorded: ${result.quantity} ${result.unit}. New balance: ${result.balance} ${result.unit}.`);
        this.form.controls.quantity.reset(null);
        this.form.controls.reason.reset('');
        this.loadItems();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.saving.set(false);
      },
    });
  }

  protected updateCount(itemId: number, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value;
    const quantity = value === '' ? null : Number(value);
    this.countRows.update((rows) =>
      rows.map((row) =>
        row.item.id === itemId
          ? { ...row, countedQuantity: quantity }
          : row,
      ),
    );
  }

  protected submitCount(): void {
    if (this.saving()) return;
    const rows = this.countRows();
    if (rows.some((row) =>
      row.countedQuantity === null ||
      !Number.isFinite(row.countedQuantity) ||
      row.countedQuantity < 0,
    )) {
      this.error.set('Enter a valid counted quantity for every active item.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.inventory.countInventory({
      counts: rows.map((row) => ({
        itemId: row.item.id,
        countedQuantity: row.countedQuantity!,
      })),
      ...(this.countNote().trim() ? { note: this.countNote().trim() } : {}),
    }).subscribe({
      next: (result) => {
        const varianceCount = result.counts.filter((count) => Number(count.variance) !== 0).length;
        this.message.set(`Physical inventory #${result.sessionId} recorded for ${result.counts.length} items; ${varianceCount} balance adjustment(s) applied.`);
        this.countNote.set('');
        this.loadItems();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.saving.set(false);
      },
    });
  }

  protected loadHistory(): void {
    this.loading.set(true);
    this.error.set('');
    const filters = {
      ...(this.from() ? { from: this.from() } : {}),
      ...(this.to() ? { to: `${this.to()}T23:59:59.999` } : {}),
    };
    this.inventory.getReport('transaction-history', filters).subscribe({
      next: (data) => {
        const report = this.asRecord(data);
        const movements = this.asArray(report?.['movements']);
        const legacy = this.asArray(report?.['legacyReceipts']);
        const rows = [
          ...movements.map((movement) => this.movementRow(movement)),
          ...legacy.map((item) => this.legacyRow(item)),
        ];
        rows.sort((left, right) => right.date.localeCompare(left.date));
        this.history.set(rows);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  private loadItems(): void {
    this.loading.set(true);
    this.inventory.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        if (this.kind === 'physical-count') {
          this.countRows.set(items.map((item) => ({ item, countedQuantity: null })));
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  private movementRow(value: unknown): HistoryRow {
    const movement = this.asRecord(value);
    const item = this.asRecord(movement?.['item']);
    return {
      date: this.asString(movement?.['createdAt']),
      itemName: this.asString(item?.['itemName']),
      action: this.asString(movement?.['movementType']).replaceAll('_', ' '),
      quantity: this.asString(movement?.['quantityEntered']),
      unit: this.asString(movement?.['enteredUom']),
      balance: this.asString(movement?.['balanceAfter']),
      employeeNumber: this.asString(movement?.['employeeNumber']),
      note: this.asString(movement?.['note']),
    };
  }

  private legacyRow(value: unknown): HistoryRow {
    const item = this.asRecord(value);
    return {
      date: this.asString(item?.['createdAt']),
      itemName: this.asString(item?.['itemName']),
      action: 'LEGACY STOCK IN',
      quantity: this.asString(item?.['quantity']),
      unit: this.asString(item?.['unitOfMeasurement']),
      balance: '—',
      employeeNumber: '—',
      note: `Stock number ${this.asString(item?.['stockNumber'])}`,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
      ? value as Record<string, unknown>
      : null;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asString(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
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
