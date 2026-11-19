import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';

import {
  InventoryService,
  type InventoryItem,
} from '@/services/inventory.service';

type BorrowedUnit = 'BASE' | 'PURCHASE' | 'OTHER';
type BorrowCondition = 'GOOD' | 'FAIR' | 'POOR';

interface BorrowedFormDraft {
  itemId: number | null;
  itemIsOther: boolean;
  customItemName: string;
  quantity: string;
  unit: BorrowedUnit;
  customUnit: string;
  borrowerName: string;
  department: string;
  contactNumber: string;
  borrowedAt: string;
  expectedReturnAt: string;
  conditionAtBorrow: BorrowCondition;
  purpose: string;
  notes: string;
  photoData: string | null;
  photoName: string;
}

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'lib-dashboard-01-borrowed-form-modal',
  standalone: true,
  templateUrl: './dashboard-01-borrowed-form-modal.component.html',
  styleUrl: './dashboard-01-borrowed-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01BorrowedFormModalComponent implements OnChanges {
  readonly open = model(false);

  private readonly svc = inject(InventoryService);
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');

  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly loadingItems = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly draft = signal<BorrowedFormDraft>(this.emptyDraft());

  protected readonly selectedItem = computed(
    () => this.items().find((item) => item.id === this.draft().itemId) ?? null,
  );

  constructor() {
    this.loadItems();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      this.draft.set(this.emptyDraft());
      this.error.set('');
      this.success.set('');
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) this.close();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected itemValue(): string {
    const draft = this.draft();
    if (draft.itemIsOther) return 'OTHER';
    return draft.itemId === null ? '' : String(draft.itemId);
  }

  protected itemLabel(item: InventoryItem): string {
    const code = item.itemCode?.trim();
    return `${item.itemName}${code ? ` · ${code}` : ''} · ${item.distributionUom}`;
  }

  protected hasPurchaseUnit(item: InventoryItem | null): boolean {
    if (!item) return false;
    const factor = Number(item.conversionFactor) || 1;
    const purchase = item.purchaseUom.trim().toLowerCase();
    const base = item.distributionUom.trim().toLowerCase();
    return factor > 1 && !!purchase && purchase !== base;
  }

  protected setField<K extends keyof BorrowedFormDraft>(
    field: K,
    value: BorrowedFormDraft[K],
  ): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
    this.error.set('');
    this.success.set('');
  }

  protected setItem(value: string): void {
    const isOther = value === 'OTHER';
    const id = Number(value);
    this.draft.update((current) => ({
      ...current,
      itemId: !isOther && Number.isFinite(id) && id > 0 ? id : null,
      itemIsOther: isOther,
      customItemName: isOther ? current.customItemName : '',
      unit: isOther ? 'OTHER' : 'BASE',
      customUnit: isOther ? current.customUnit : '',
    }));
    this.error.set('');
    this.success.set('');
  }

  protected setUnit(value: string): void {
    const unit: BorrowedUnit =
      value === 'PURCHASE' || value === 'OTHER' ? value : 'BASE';
    this.setField('unit', unit);
  }

  protected setCondition(value: string): void {
    const condition: BorrowCondition =
      value === 'FAIR' || value === 'POOR' ? value : 'GOOD';
    this.setField('conditionAtBorrow', condition);
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      this.error.set('Photo must be 2MB or less.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.setField('photoData', typeof reader.result === 'string' ? reader.result : null);
      this.setField('photoName', file.name);
    };
    reader.readAsDataURL(file);
  }

  protected clearPhoto(): void {
    this.draft.update((current) => ({ ...current, photoData: null, photoName: '' }));
    const input = this.photoInput()?.nativeElement;
    if (input) input.value = '';
  }

  protected submit(): void {
    if (this.saving()) return;
    const draft = this.draft();
    const item = draft.itemIsOther ? null : this.selectedItem();
    const customItemName = draft.customItemName.trim();
    const customUnit = draft.customUnit.trim();

    if (!draft.itemIsOther && !item) {
      this.error.set('Select an item to borrow.');
      return;
    }
    if (draft.itemIsOther && !customItemName) {
      this.error.set('Type the item name.');
      return;
    }
    if (draft.unit === 'OTHER' && !customUnit) {
      this.error.set('Type the unit.');
      return;
    }
    const borrowerName = draft.borrowerName.trim();
    if (!borrowerName) {
      this.error.set('Enter the borrower name.');
      return;
    }
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.error.set('Enter a quantity greater than zero.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    this.svc
      .createBorrowedSupply({
        ...(item
          ? {
              itemId: item.id,
              unit: draft.unit === 'PURCHASE' ? 'PURCHASE' : 'BASE',
              ...(draft.unit === 'OTHER' ? { customUnit } : {}),
            }
          : { customItemName, customUnit }),
        borrowerName,
        ...(draft.department.trim() ? { department: draft.department.trim() } : {}),
        ...(draft.contactNumber.trim() ? { contactNumber: draft.contactNumber.trim() } : {}),
        quantity,
        conditionAtBorrow: draft.conditionAtBorrow,
        borrowedAt: draft.borrowedAt,
        ...(draft.expectedReturnAt
          ? { expectedReturnAt: draft.expectedReturnAt }
          : {}),
        ...(draft.purpose.trim() ? { purpose: draft.purpose.trim() } : {}),
        ...(draft.photoData ? { photoData: draft.photoData } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      })
      .subscribe({
        next: (record) => {
          this.success.set(`Recorded as ${record.referenceNumber}.`);
          this.draft.set(this.emptyDraft());
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.error.set(this.errorMessage(error));
          this.saving.set(false);
        },
      });
  }

  private loadItems(): void {
    this.loadingItems.set(true);
    this.svc.listItems({ status: 'ACTIVE' }).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loadingItems.set(false);
      },
      error: () => {
        this.error.set('Unable to load items. Please try again.');
        this.loadingItems.set(false);
      },
    });
  }

  private emptyDraft(): BorrowedFormDraft {
    return {
      itemId: null,
      itemIsOther: false,
      customItemName: '',
      quantity: '',
      unit: 'BASE',
      customUnit: '',
      borrowerName: '',
      department: '',
      contactNumber: '',
      borrowedAt: localToday(),
      expectedReturnAt: '',
      conditionAtBorrow: 'GOOD',
      purpose: '',
      notes: '',
      photoData: null,
      photoName: '',
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string } | null;
      return body?.message ?? 'Unable to save the borrowed supply.';
    }
    return 'Unable to save the borrowed supply.';
  }
}
