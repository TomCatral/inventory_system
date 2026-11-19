import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../Auth/auth.service';
import { interval } from 'rxjs';
import {
  InventoryService,
  type InventoryItem,
  type ItemSetupRequest,
  type StockItemCategory,
} from '../services/inventory.service';


type ItemForm = FormGroup<{
  itemCode: FormControl<string>;
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
  styleUrl: './item-setup-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemSetupPageComponent implements OnInit, OnDestroy {
  private readonly inventory = inject(InventoryService);
  private readonly auth = inject(AuthService);
  private filterTimer: ReturnType<typeof setTimeout> | undefined;

  readonly embedded = input(false);
  readonly editingItem = input<InventoryItem | null>(null);
  readonly itemSaved = output<InventoryItem>();

  protected readonly records = signal<InventoryItem[]>([]);
  protected readonly selected = signal<InventoryItem | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly showForm = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly search = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly conversionMode = signal<'SAME' | 'PACK'>('SAME');
  protected readonly canManage = () =>
    this.auth.inventoryRole() === 'ADMIN' ||
    this.auth.inventoryRole() === 'SUPERADMIN';

  protected readonly form: ItemForm = new FormGroup({
    itemCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(32)],
    }),
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
    purchaseUom: new FormControl('pcs', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    distributionUom: new FormControl('pcs', {
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
    if (!this.embedded()) {
      interval(5_000)
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.load(true));
    }
    if (this.embedded()) {

      const item = this.editingItem();
      item ? this.edit(item) : this.beginCreate();
    }
  }

  protected load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.errorMessage.set('');
    }
    this.inventory.listItems({

      search: this.search(),
      category: this.categoryFilter(),
      status: this.statusFilter(),
    }).subscribe({
      next: (items) => {
        this.records.set(items);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.errorMessage.set(this.getError(error));
        if (!silent) this.loading.set(false);
      },

    });
  }

  protected filterChanged(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.load(), 250);
  }

  ngOnDestroy(): void {
    clearTimeout(this.filterTimer);
  }

  protected beginCreate(): void {
    this.editingId.set(null);
    this.selected.set(null);
    this.form.reset({
      itemCode: '',
      itemName: '',
      description: '',
      brand: '',
      category: 'CONSUMABLE',
      purchaseUom: 'pcs',
      distributionUom: 'pcs',
      conversionFactor: 1,
      reorderLevel: 0,
      status: 'ACTIVE',
    });
    this.errorMessage.set('');
    this.conversionMode.set('SAME');
    this.showForm.set(true);
  }

  protected edit(item: InventoryItem): void {
    this.selected.set(null);
    this.editingId.set(item.id);
    this.form.reset({
      itemCode: item.itemCode ?? '',
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
    this.conversionMode.set(
      item.purchaseUom.toLowerCase() === item.distributionUom.toLowerCase() && Number(item.conversionFactor) === 1
        ? 'SAME'
        : 'PACK',
    );
    this.showForm.set(true);
  }

  protected cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  protected deleteItem(item: InventoryItem): void {
    if (this.deletingId() !== null) return;
    if (!confirm(`Delete ${item.itemName} from the active Item Catalog? Existing stock and transaction history will be preserved.`)) return;
    this.deletingId.set(item.id);
    this.errorMessage.set('');
    this.inventory.updateItem(item.id, {
      itemName: item.itemName,
      description: item.description ?? '',
      brand: item.brand ?? '',
      category: item.category,
      purchaseUom: item.purchaseUom,
      distributionUom: item.distributionUom,
      conversionFactor: Number(item.conversionFactor),
      reorderLevel: Number(item.reorderLevel),
      status: 'INACTIVE',
    }).subscribe({
      next: (updated) => {
        this.deletingId.set(null);
        this.records.update((items) => items.filter((record) => record.id !== item.id));
        this.successMessage.set(`${item.itemName} removed from the active Item Catalog.`);
        this.itemSaved.emit(updated);
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.errorMessage.set(this.getError(error));
      },
    });
  }

  protected stockLabel(item: InventoryItem): string {
    const quantity = Number(item.balance?.quantity ?? 0);
    const baseUnit = item.distributionUom?.trim() || 'unit';
    const purchaseUnit = item.purchaseUom?.trim();
    const factor = Number(item.conversionFactor) > 0 ? Number(item.conversionFactor) : 1;
    const amount = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(quantity);
    const baseLabel = `${amount} ${baseUnit}`;
    if (!purchaseUnit || purchaseUnit.toLowerCase() === baseUnit.toLowerCase()) {
      return baseLabel;
    }
    const packs = Math.round((quantity / factor) * 1_000_000) / 1_000_000;
    const packsLabel = `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(packs)} ${purchaseUnit}`;
    return `${packsLabel} = ${baseLabel}`;
  }

  protected unitFormatLabel(item: InventoryItem): string {
    const purchaseUnit = item.purchaseUom?.trim() || 'receiving unit';
    const factor = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(Number(item.conversionFactor) || 1);
    const baseUnit = item.distributionUom?.trim() || 'stock unit';
    return `1 ${purchaseUnit} = ${factor} ${baseUnit}`;
  }

  protected setConversionMode(mode: 'SAME' | 'PACK'): void {
    this.conversionMode.set(mode);
    if (mode === 'SAME') {
      const unit = this.form.controls.distributionUom.value.trim() || 'pcs';
      this.form.patchValue({ purchaseUom: unit, distributionUom: unit, conversionFactor: 1 });
    } else if (this.form.controls.conversionFactor.value === 1) {
      this.form.patchValue({
        purchaseUom: this.form.controls.purchaseUom.value.trim() || 'pack',
        distributionUom: this.form.controls.distributionUom.value.trim() || 'pcs',
        conversionFactor: 12,
      });
    }
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.conversionFactor === null || value.reorderLevel === null) {
      this.errorMessage.set('Enter a valid quantity.');
      return;
    }

    const purchaseUom = value.purchaseUom.trim();
    const distributionUom = value.distributionUom.trim();
    if (!purchaseUom || !distributionUom || value.conversionFactor <= 0) {
      this.errorMessage.set('Enter valid receiving and stock units with a conversion greater than zero.');
      return;
    }
    if (purchaseUom.toLowerCase() === distributionUom.toLowerCase() && value.conversionFactor !== 1) {
      this.errorMessage.set('When the receiving and stock units are the same, the conversion must be 1.');
      return;
    }

    const request: ItemSetupRequest = {
      ...value,
      itemCode: value.itemCode.trim() || undefined,
      itemName: value.itemName.trim(),
      description: value.description.trim(),
      purchaseUom,
      distributionUom,
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
        this.successMessage.set(`${item.itemName} (${item.itemCode || `ITM-${item.id}`}) ${editingId === null ? 'created' : 'updated'}.`);
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.load();
        this.itemSaved.emit(item);
        if (this.embedded()) this.beginCreate();
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

