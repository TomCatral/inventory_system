import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import {
  InventoryService,
  type BorrowedSupplyRecord,
  type BorrowedSupplyStatus,
  type InventoryItem,
} from '../services/inventory.service';

const QUANTITY_FORMATTER = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

type BorrowedSupplyFilter = 'ALL' | BorrowedSupplyStatus;
type BorrowCondition = 'GOOD' | 'FAIR' | 'POOR';
type BorrowedUnit = 'BASE' | 'PURCHASE' | 'OTHER';

interface BorrowedSupplyDraft {
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

@Component({
  selector: 'app-borrowed-supply-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './borrowed-supply-page.component.html',
  styleUrl: './borrowed-supply-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BorrowedSupplyPageComponent {
  private readonly svc = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly uploadInput = viewChild<ElementRef<HTMLInputElement>>('uploadInput');
  private readonly captureInput = viewChild<ElementRef<HTMLInputElement>>('captureInput');
  private readonly cameraVideo = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');
  private cameraStream: MediaStream | null = null;

  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly records = signal<BorrowedSupplyRecord[]>([]);
  protected readonly loadingItems = signal(true);
  protected readonly loadingRecords = signal(true);
  protected readonly saving = signal(false);
  protected readonly returningId = signal<number | null>(null);
  protected readonly confirmingReturnId = signal<number | null>(null);
  protected readonly filter = signal<BorrowedSupplyFilter>('ALL');
  protected readonly draft = signal<BorrowedSupplyDraft>(this.emptyDraft());
  protected readonly formError = signal('');
  protected readonly itemError = signal('');
  protected readonly loadError = signal('');
  protected readonly photoError = signal('');
  protected readonly cameraOpen = signal(false);
  protected readonly cameraError = signal('');
  protected readonly successMsg = signal('');
  protected readonly selectedRecordId = signal<number | null>(null);
  protected readonly returnNotes = signal<Record<number, string>>({});
  protected readonly filterTabs: readonly { readonly value: BorrowedSupplyFilter; readonly label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'RETURNED', label: 'Returned' },
  ];
  protected readonly receiptCopies = [
    { key: 'CLIENT', label: "Client's Copy" },
    { key: 'OFFICE', label: 'Office Copy' },
  ] as const;

  protected readonly selectedItem = computed(
    () => this.items().find((item) => item.id === this.draft().itemId) ?? null,
  );
  protected readonly pendingCount = computed(
    () => this.records().filter((record) => record.status === 'PENDING').length,
  );
  protected readonly returnedCount = computed(
    () => this.records().filter((record) => record.status === 'RETURNED').length,
  );
  protected readonly filteredRecords = computed(() => {
    const current = this.filter();
    const records = [...this.records()].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    return current === 'ALL' ? records : records.filter((record) => record.status === current);
  });
  protected readonly selectedRecord = computed(
    () => this.records().find((record) => record.id === this.selectedRecordId()) ?? null,
  );

  constructor() {
    this.loadItems();
    this.loadRecords();
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.loadRecords(true));
    this.destroyRef.onDestroy(() => this.closeCamera());
  }

  private emptyDraft(): BorrowedSupplyDraft {
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

  private loadItems(): void {
    this.loadingItems.set(true);
    this.itemError.set('');
    this.svc.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loadingItems.set(false);
      },
      error: () => {
        this.itemError.set('Unable to load items for borrowing. Please try again.');
        this.loadingItems.set(false);
      },
    });
  }

  private loadRecords(silent = false): void {
    if (!silent) {
      this.loadingRecords.set(true);
      this.loadError.set('');
    }
    this.svc.listBorrowedSupplies().subscribe({
      next: (records) => {
        this.records.set(records);
        const selectedId = this.selectedRecordId();
        if (selectedId !== null) this.loadReceiptPhoto(selectedId);
        if (!silent) this.loadingRecords.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.errMsg(error));
        if (!silent) this.loadingRecords.set(false);
      },
    });
  }

  protected setDraft<K extends keyof BorrowedSupplyDraft>(
    field: K,
    value: BorrowedSupplyDraft[K],
  ): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
    this.formError.set('');
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
    this.formError.set('');
  }

  protected setUnit(value: string): void {
    this.setDraft('unit', value === 'PURCHASE' || value === 'OTHER' ? value : 'BASE');
  }

  protected hasPurchaseUnit(item: InventoryItem): boolean {
    const factor = Number(item.conversionFactor) || 1;
    const purchase = item.purchaseUom.trim().toLowerCase();
    const base = item.distributionUom.trim().toLowerCase();
    return factor > 1 && !!purchase && purchase !== base;
  }

  protected setCondition(value: string): void {
    this.setDraft('conditionAtBorrow', value === 'FAIR' || value === 'POOR' ? value : 'GOOD');
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    this.photoError.set('');
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      this.photoError.set('Photo must be 4 MB or smaller.');
      if (input) input.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.photoError.set('Please choose an image file.');
      if (input) input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        this.photoError.set('Could not read the photo. Please try again.');
        return;
      }
      this.draft.update((current) => ({ ...current, photoData: result, photoName: file.name }));
    };
    reader.onerror = () => this.photoError.set('Could not read the photo. Please try again.');
    reader.readAsDataURL(file);
  }

  protected removePhoto(): void {
    this.draft.update((current) => ({ ...current, photoData: null, photoName: '' }));
    this.photoError.set('');
    this.cameraError.set('');
    for (const input of [this.uploadInput(), this.captureInput()]) {
      if (input) input.nativeElement.value = '';
    }
  }

  protected async openCamera(): Promise<void> {
    this.cameraError.set('');
    this.photoError.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
        this.captureInput()?.nativeElement.click();
        return;
      }
      this.cameraError.set('Camera needs HTTPS. Use Upload photo on this device.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      this.cameraStream = stream;
      this.cameraOpen.set(true);
      setTimeout(() => {
        const video = this.cameraVideo()?.nativeElement;
        if (!video) return;
        video.srcObject = stream;
        void video.play();
      }, 0);
    } catch {
      this.cameraError.set('Unable to open the camera. Check camera permission and try again.');
    }
  }

  protected capturePhoto(): void {
    const video = this.cameraVideo()?.nativeElement;
    if (!video || !video.videoWidth || !video.videoHeight) {
      this.cameraError.set('Camera is still starting. Please try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      this.cameraError.set('Unable to capture the photo. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoData = canvas.toDataURL('image/jpeg', 0.85);
    if (photoData.length > 4 * 1024 * 1024) {
      this.photoError.set('Photo must be 4 MB or smaller.');
      return;
    }
    this.draft.update((current) => ({
      ...current,
      photoData,
      photoName: `camera-photo-${Date.now()}.jpg`,
    }));
    this.closeCamera();
  }

  protected closeCamera(): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    this.cameraOpen.set(false);
  }

  protected balance(item: InventoryItem): number {
    return Number(item.balance?.quantity ?? 0);
  }

  protected balanceLabel(item: InventoryItem): string {
    return this.unitQuantityLabel(
      this.balance(item),
      item.purchaseUom,
      item.distributionUom,
      Number(item.conversionFactor) || 1,
    );
  }

  protected recordQuantityLabel(record: BorrowedSupplyRecord): string {
    const base = Number(record.quantity) || 0;
    const baseUnit = (record.baseUom || record.distributionUom || 'unit').trim();
    const enteredQuantity = Number(record.enteredQuantity) || 0;
    const enteredUnit = (record.enteredUom || '').trim();
    const factor = Number(record.conversionFactor) || 1;
    if (enteredUnit && enteredUnit.toLowerCase() !== baseUnit.toLowerCase() && enteredQuantity > 0) {
      return `${QUANTITY_FORMATTER.format(enteredQuantity)} ${enteredUnit} = ${QUANTITY_FORMATTER.format(base)} ${baseUnit}`;
    }
    return this.unitQuantityLabel(base, record.purchaseUom, baseUnit, factor);
  }

  protected statusLabel(status: BorrowedSupplyStatus): string {
    return status === 'RETURNED' ? 'Returned' : 'Pending';
  }

  protected conditionLabel(value: string | null): string {
    if (value === 'FAIR' || value === 'POOR' || value === 'GOOD') {
      return value.charAt(0) + value.slice(1).toLowerCase();
    }
    return 'Not specified';
  }

  protected display(value: string | null | undefined): string {
    return value?.trim() ? value.trim() : '—';
  }

  protected borrowerLabel(record: BorrowedSupplyRecord): string {
    return record.borrowerEmpNo?.trim()
      ? `${record.borrowerName} · ${record.borrowerEmpNo.trim()}`
      : record.borrowerName;
  }

  protected issuerLabel(record: BorrowedSupplyRecord): string {
    const name = record.issuedByName?.trim() || 'Inventory staff';
    return record.issuedByEmpNo?.trim() ? `${name} · ${record.issuedByEmpNo.trim()}` : name;
  }

  protected returnerLabel(record: BorrowedSupplyRecord): string {
    const name = record.returnedByName?.trim() || record.returnedByEmpNo?.trim() || '—';
    return record.returnedByEmpNo?.trim() && name !== record.returnedByEmpNo.trim()
      ? `${name} · ${record.returnedByEmpNo.trim()}`
      : name;
  }

  protected submit(): void {
    const draft = this.draft();
    const item = this.selectedItem();
    const catalogItem = draft.itemIsOther ? null : item;
    const customItemName = draft.customItemName.trim();
    const customUnit = draft.customUnit.trim();
    if (!draft.itemIsOther && !catalogItem) {
      this.formError.set('Select an item to borrow.');
      return;
    }
    if (draft.itemIsOther && !customItemName) {
      this.formError.set('Type the item name.');
      return;
    }
    if (draft.unit === 'OTHER' && !customUnit) {
      this.formError.set('Type the unit.');
      return;
    }
    const borrowerName = draft.borrowerName.trim();
    if (!borrowerName) {
      this.formError.set('Enter the borrower name.');
      return;
    }
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.formError.set('Enter a quantity greater than zero.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.successMsg.set('');

    this.svc.createBorrowedSupply({
      ...(catalogItem
        ? {
            itemId: catalogItem.id,
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
      ...(draft.expectedReturnAt ? { expectedReturnAt: draft.expectedReturnAt } : {}),
      ...(draft.purpose.trim() ? { purpose: draft.purpose.trim() } : {}),
      ...(draft.photoData ? { photoData: draft.photoData } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    }).subscribe({
      next: (record) => {
        this.successMsg.set(`Borrowed supply recorded as ${record.referenceNumber}. Use Print on the record to print.`);
        this.resetForm();
        this.filter.set('ALL');
        this.selectedRecordId.set(record.id);
        this.saving.set(false);
        this.loadRecords();
      },
      error: (error: unknown) => {
        this.formError.set(this.errMsg(error));
        this.saving.set(false);
      },
    });
  }

  protected askReturn(record: BorrowedSupplyRecord): void {
    this.confirmingReturnId.set(record.id);
    this.returnNotes.update((current) => ({ ...current, [record.id]: '' }));
    this.successMsg.set('');
    this.loadError.set('');
  }

  protected cancelReturn(id: number): void {
    this.confirmingReturnId.update((current) => (current === id ? null : current));
  }

  protected setReturnNotes(id: number, value: string): void {
    this.returnNotes.update((current) => ({ ...current, [id]: value }));
  }

  protected confirmReturn(record: BorrowedSupplyRecord): void {
    if (this.returningId() !== null) return;
    this.returningId.set(record.id);
    this.loadError.set('');
    const notes = (this.returnNotes()[record.id] ?? '').trim();
    this.svc.returnBorrowedSupply(record.id, notes || undefined).subscribe({
      next: (updated) => {
        this.successMsg.set(`${updated.referenceNumber} marked as returned.`);
        this.returningId.set(null);
        this.confirmingReturnId.set(null);
        this.loadRecords(true);
      },
      error: (error: unknown) => {
        this.loadError.set(this.errMsg(error));
        this.returningId.set(null);
      },
    });
  }

  protected printRecord(record: BorrowedSupplyRecord): void {
    this.selectedRecordId.set(record.id);
    this.loadReceiptPhoto(record.id, () => {
      this.cdr.detectChanges();
      this.printReceipt();
    });
  }

  protected printReceipt(): void {
    if (!this.selectedRecord()) return;
    const originalTitle = document.title;
    document.title = `Borrowed Supply Receipt ${this.selectedRecord()?.referenceNumber ?? ''}`;
    window.addEventListener('afterprint', () => { document.title = originalTitle; }, { once: true });
    window.print();
  }

  private loadReceiptPhoto(id: number, done?: () => void): void {
    const record = this.records().find((row) => row.id === id);
    if (!record?.hasPhoto || record.photoData) {
      done?.();
      return;
    }
    this.svc.getBorrowedSupplyPhoto(id).subscribe({
      next: ({ photoData }) => {
        if (photoData) {
          this.records.update((rows) =>
            rows.map((row) => (row.id === id ? { ...row, photoData } : row)),
          );
        }
        done?.();
      },
      error: () => done?.(),
    });
  }

  private resetForm(): void {
    this.draft.set(this.emptyDraft());
    this.removePhoto();
  }

  private unitQuantityLabel(
    quantity: number,
    purchaseUom: string,
    baseUom: string,
    conversionFactor: number,
  ): string {
    const base = (baseUom || 'unit').trim();
    const purchase = (purchaseUom || '').trim();
    const baseLabel = `${QUANTITY_FORMATTER.format(quantity)} ${base}`;
    if (!purchase || purchase.toLowerCase() === base.toLowerCase() || !(conversionFactor > 1)) {
      return baseLabel;
    }
    return `${QUANTITY_FORMATTER.format(quantity / conversionFactor)} ${purchase} = ${baseLabel}`;
  }

  private errMsg(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(' ');
      return error.status === 0
        ? 'Cannot connect to the inventory service.'
        : `Request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unexpected error.';
  }
}
