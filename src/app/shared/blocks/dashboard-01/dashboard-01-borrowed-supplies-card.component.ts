import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePackageCheck } from '@ng-icons/lucide';

import { InventoryService, type BorrowedSupplyRecord } from '@/services/inventory.service';

type BorrowedFilter = 'ALL' | 'PENDING' | 'RETURNED';

@Component({
  selector: 'lib-dashboard-01-borrowed-supplies-card',
  standalone: true,
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ lucidePackageCheck })],
  templateUrl: './dashboard-01-borrowed-supplies-card.component.html',
  styleUrl: './dashboard-01-borrowed-supplies-card.component.scss',
})
export class Dashboard01BorrowedSuppliesCardComponent implements OnInit {
  private readonly inventory = inject(InventoryService);

  protected readonly records = signal<BorrowedSupplyRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly filter = signal<BorrowedFilter>('ALL');
  protected readonly query = signal('');
  protected readonly filterTabs: readonly { readonly value: BorrowedFilter; readonly label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'RETURNED', label: 'Returned' },
  ];

  protected readonly pendingCount = computed(
    () => this.records().filter((record) => record.status === 'PENDING').length,
  );
  protected readonly returnedCount = computed(
    () => this.records().filter((record) => record.status === 'RETURNED').length,
  );
  protected readonly filteredRecords = computed(() => {
    const filter = this.filter();
    const query = this.query().trim().toLocaleLowerCase();
    return this.records().filter((record) => {
      if (filter !== 'ALL' && record.status !== filter) return false;
      if (!query) return true;
      return [
        record.referenceNumber,
        record.itemName,
        record.itemCode,
        record.borrowerName,
        record.department,
        record.issuedByName,
        record.returnedByName,
      ].some((value) => String(value ?? '').toLocaleLowerCase().includes(query));
    });
  });

  constructor() {
    interval(10_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    this.load(false);
  }

  protected setFilter(filter: BorrowedFilter): void {
    this.filter.set(filter);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
  }

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }
    this.inventory.listBorrowedSupplies().subscribe({
      next: (records) => {
        this.records.set(records);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) {
          this.error.set(error instanceof HttpErrorResponse
            ? error.status === 0
              ? 'Could not connect to the inventory service.'
              : `Unable to load borrowed supplies (${error.status}).`
            : error instanceof Error ? error.message : 'Unable to load borrowed supplies.');
          this.loading.set(false);
        }
      },
    });
  }

  protected quantityLabel(record: BorrowedSupplyRecord): string {
    const base = Number(record.quantity) || 0;
    const entered = Number(record.enteredQuantity) || 0;
    const enteredUnit = String(record.enteredUom ?? '').trim();
    const unit = enteredUnit || String(record.baseUom ?? record.distributionUom ?? 'unit').trim();
    return `${enteredUnit && entered > 0 ? entered : base} ${unit}`;
  }

  protected display(value: string | null | undefined): string {
    return String(value ?? '').trim() || '—';
  }

  protected dateLabel(value: string | null | undefined, withTime = false): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    }).format(date);
  }

  protected statusLabel(record: BorrowedSupplyRecord): string {
    return record.status === 'PENDING' ? 'Pending' : 'Returned';
  }

  protected trackById(_: number, record: BorrowedSupplyRecord): number {
    return record.id;
  }
}
