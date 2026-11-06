import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../Auth/auth.service';
import {
  StockInService,
  type InventoryItem,
  type ItemSetupRequest,
  type StockItemCategory,
} from './stock-in.service';

type ItemForm = FormGroup<{
  itemName: FormControl<string>;
  description: FormControl<string>;
  brand: FormControl<string>;
  category: FormControl<StockItemCategory>;
  purchaseUom: FormControl<string>;
  distributionUom: FormControl<string>;
  conversionFactor: FormControl<number | null>;
  reorderLevel: FormControl<number | null>;
  status: FormControl<'ACTIVE' | 'INACTIVE'>;
}>;

@Component({
  selector: 'app-item-setup-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './item-setup-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemSetupPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  private readonly auth = inject(AuthService);

  protected readonly records = signal<InventoryItem[]>([]);
  protected readonly selected = signal<InventoryItem | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly showForm = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly search = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly canManage = () =>
    this.auth.inventoryRole() === 'ADMIN' ||
    this.auth.inventoryRole() === 'SUPERADMIN';

  protected readonly form: ItemForm = new FormGroup({
    itemName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    description: new FormControl('', { nonNullable: true }),
    brand: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    category: new FormControl<StockItemCategory>('CONSUMABLE', { nonNullable: true }),
    purchaseUom: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    distributionUom: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    conversionFactor: new FormControl<number | null>(1, [
      Validators.required,
      Validators.min(0.001),
      Validators.max(999999999),
    ]),
    reorderLevel: new FormControl<number | null>(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(999999999),
    ]),
    status: new FormControl<'ACTIVE' | 'INACTIVE'>('ACTIVE', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.inventory.listItems({
      search: this.search(),
      category: this.categoryFilter(),
      status: this.statusFilter(),
    }).subscribe({
      next: (items) => {
        this.records.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  protected filterChanged(): void {
    this.load();
  }

  protected beginCreate(): void {
    this.editingId.set(null);
    this.selected.set(null);
    this.form.reset({
      itemName: '',
      description: '',
      brand: '',
      category: 'CONSUMABLE',
      purchaseUom: '',
      distributionUom: '',
      conversionFactor: 1,
      reorderLevel: 0,
      status: 'ACTIVE',
    });
    this.errorMessage.set('');
    this.showForm.set(true);
  }

  protected view(item: InventoryItem): void {
    this.selected.set(item);
    this.showForm.set(false);
  }

  protected edit(item: InventoryItem): void {
    this.selected.set(null);
    this.editingId.set(item.id);
    this.form.reset({
      itemName: item.itemName,
      description: item.description ?? '',
      brand: item.brand ?? '',
      category: item.category,
      purchaseUom: item.purchaseUom,
      distributionUom: item.distributionUom,
      conversionFactor: Number(item.conversionFactor),
      reorderLevel: Number(item.reorderLevel),
      status: item.status,
    });
    this.errorMessage.set('');
    this.showForm.set(true);
  }

  protected cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.conversionFactor === null || value.reorderLevel === null) {
      this.errorMessage.set('Enter a valid conversion factor and reorder level.');
      return;
    }
    if (
      value.purchaseUom.trim().toLocaleLowerCase() ===
        value.distributionUom.trim().toLocaleLowerCase() &&
      value.conversionFactor !== 1
    ) {
      this.errorMessage.set('Use a conversion factor of 1 when the units are the same.');
      return;
    }

    const request: ItemSetupRequest = {
      ...value,
      itemName: value.itemName.trim(),
      description: value.description.trim(),
      purchaseUom: value.purchaseUom.trim(),
      distributionUom: value.distributionUom.trim(),
      conversionFactor: value.conversionFactor,
      reorderLevel: value.reorderLevel,
    };
    this.saving.set(true);
    this.errorMessage.set('');
    const editingId = this.editingId();
    const saveRequest = editingId === null
      ? this.inventory.createItem(request)
      : this.inventory.updateItem(editingId, request);
    saveRequest.subscribe({
      next: (item) => {
        this.successMessage.set(`${item.itemName} ${editingId === null ? 'created' : 'updated'}.`);
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.getError(error));
        this.saving.set(false);
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
