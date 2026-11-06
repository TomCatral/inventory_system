import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { StockInService, type InventoryItem, type StockMovementResponse } from './stock-in.service';

@Component({
  selector: 'app-stock-out-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="mx-auto w-full max-w-5xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Transactions</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">Stock Out</h1>
        <p class="text-muted-foreground mt-1 text-sm">Issue inventory using each item’s distribution unit.</p>
      </header>

      @if (message()) {
        <p role="status" class="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{{ message() }}</p>
      }
      @if (error()) {
        <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="rounded-xl border bg-card p-5 shadow-sm md:p-7">
        <div class="grid gap-5 sm:grid-cols-2">
          <label class="grid gap-2 text-sm font-medium sm:col-span-2">Inventory item
            <select formControlName="itemId" class="h-11 rounded-lg border bg-background px-3 font-normal">
              <option [ngValue]="null" disabled>Select an active item</option>
              @for (item of items(); track item.id) {
                <option [ngValue]="item.id">{{ item.itemName }} — {{ item.balance?.quantity ?? '0' }} {{ item.distributionUom }} available</option>
              }
            </select>
          </label>
          @if (selectedItem(); as item) {
            <div class="rounded-lg bg-primary/5 p-4 text-sm sm:col-span-2">
              <span class="text-muted-foreground">Available balance</span>
              <p class="mt-1 text-lg font-semibold text-primary">{{ item.balance?.quantity ?? '0' }} {{ item.distributionUom }}</p>
            </div>
          }
          <label class="grid gap-2 text-sm font-medium">Quantity to issue ({{ selectedItem()?.distributionUom || 'distribution unit' }})
            <input formControlName="quantity" type="number" min="0.000001" step="0.001" class="h-11 rounded-lg border bg-background px-3 font-normal" required />
          </label>
        </div>
        <div class="mt-6 flex justify-end border-t pt-5">
          <button type="submit" [disabled]="saving()" class="app-button app-button-primary">{{ saving() ? 'Issuing…' : 'Issue items' }}</button>
        </div>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockOutPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    itemId: new FormControl<number | null>(null, Validators.required),
    quantity: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.000001),
      Validators.max(999999999999),
    ]),
  });

  ngOnInit(): void {
    this.loadBalances();
  }

  protected selectedItem(): InventoryItem | undefined {
    const id = this.form.controls.itemId.value;
    return this.items().find((item) => item.id === id);
  }

  protected submit(): void {
    this.error.set('');
    this.message.set('');
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { itemId, quantity } = this.form.getRawValue();
    if (itemId === null || quantity === null) {
      this.error.set('Select an item and enter a quantity.');
      return;
    }
    this.saving.set(true);
    this.inventory.issue({ itemId, quantity }).subscribe({
      next: (result: StockMovementResponse) => {
        this.message.set(`Issued ${result.issuedQuantity} ${result.issuedUom}. Remaining balance: ${result.balance} ${result.balanceUom}.`);
        this.form.controls.quantity.reset(null);
        this.loadBalances();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.saving.set(false);
      },
    });
  }

  private loadBalances(): void {
    this.inventory.listBalances().subscribe({
      next: (items) => this.items.set(items),
      error: (error: unknown) => this.error.set(this.getError(error)),
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
