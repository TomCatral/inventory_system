import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  StockInService,
  type InventoryItem,
  type StockItem,
} from './stock-in.service';

type StockInForm = FormGroup<{
  itemId: FormControl<number | null>;
  quantity: FormControl<number | null>;
  hasExpirationDate: FormControl<boolean>;
  expirationDate: FormControl<string>;
}>;

@Component({
  selector: 'app-stock-in-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './stock-in-page.component.html',
  styleUrl: './stock-in-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockInPageComponent implements OnInit {
  private readonly stockIn = inject(StockInService);

  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly items = signal<StockItem[]>([]);
  protected readonly catalogItems = signal<InventoryItem[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly form: StockInForm = new FormGroup({
    itemId: new FormControl<number | null>(null, [Validators.required]),
    quantity: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.001),
      Validators.max(999999999),
    ]),
    hasExpirationDate: new FormControl(false, { nonNullable: true }),
    expirationDate: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadItems();
    this.loadCatalogItems();
  }

  protected selectedItem(): InventoryItem | undefined {
    const itemId = this.form.controls.itemId.value;
    return this.catalogItems().find((item) => item.id === itemId);
  }

  protected submit(): void {
    this.successMessage.set('');
    this.errorMessage.set('');

    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    if (value.itemId === null || value.quantity === null) {
      this.errorMessage.set('Complete the required fields before saving.');
      return;
    }
    if (value.hasExpirationDate && !value.expirationDate) {
      this.form.controls.expirationDate.markAsTouched();
      this.errorMessage.set('Enter an expiration date or uncheck the expiration option.');
      return;
    }

    this.saving.set(true);
    this.stockIn.receive({
      itemId: value.itemId,
      quantity: value.quantity,
      ...(value.hasExpirationDate ? { expirationDate: value.expirationDate } : {}),
    }).subscribe({
      next: (movement) => {
        if (movement.stockEntry) {
          this.items.update((items) => [movement.stockEntry!, ...items]);
        }
        this.successMessage.set(
          `Received ${movement.receivedQuantity} ${movement.receivedUom} (${movement.baseQuantity} ${movement.baseUom}). New balance: ${movement.balance} ${movement.baseUom}.`,
        );
        this.form.reset({
          itemId: null,
          quantity: null,
          hasExpirationDate: false,
          expirationDate: '',
        });
        this.loadItems();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.saving.set(false);
      },
    });
  }

  private loadItems(): void {
    this.loading.set(true);
    this.stockIn.listRecent().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private loadCatalogItems(): void {
    this.stockIn.listItems({ status: 'ACTIVE' }).subscribe({
      next: (items) => {
        this.catalogItems.set(items);
        this.catalogLoading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.catalogLoading.set(false);
      },
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join(' ');
      }
      if (error.status === 0) {
        return 'Could not connect to the inventory service. Check that the backend is running.';
      }
      return `Inventory request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}
