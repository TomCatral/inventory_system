import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { fromEvent, interval } from 'rxjs';

import { AuthService } from '@/Auth/auth.service';
import { InventoryService, type InventoryItem, type StockRequest } from '@/services/inventory.service';
import { Dashboard01BorrowedSuppliesCardComponent } from './dashboard-01-borrowed-supplies-card.component';
import { Dashboard01SectionCardsComponent } from './dashboard-01-section-cards.component';
import { Dashboard01StaffOverviewComponent } from './dashboard-01-staff-overview.component';


@Component({
  selector: 'lib-dashboard-01-overview',
  standalone: true,
  imports: [DatePipe, Dashboard01BorrowedSuppliesCardComponent, Dashboard01SectionCardsComponent, Dashboard01StaffOverviewComponent, RouterLink],

  templateUrl: './dashboard-01-overview.component.html',
  styleUrl: './dashboard-01-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01OverviewComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  private readonly auth = inject(AuthService);

  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly requests = signal<StockRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly processingId = signal<number | null>(null);
  protected readonly isStaff = computed(() => {
    const role = this.auth.inventoryRole();
    return role !== 'ADMIN' && role !== 'SUPERADMIN';
  });
  protected readonly isSuperAdmin = computed(() => this.auth.inventoryRole() === 'SUPERADMIN');
  protected readonly introTitle = computed(() =>
    this.isSuperAdmin() ? 'System Control' : 'Inventory Control',
  );
  protected readonly introCopy = computed(() =>
    this.isSuperAdmin()
      ? 'Oversee inventory, approvals, and role assignments across all PGC offices.'
      : 'Review current balances, complete daily stock operations, and act on items that need attention.',
  );
  protected readonly attentionCount = computed(() =>
    this.items().filter((item) => this.isLowStock(item)).length,
  );
  protected readonly sortedRequests = computed(() =>
    [...this.requests()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  );
  protected readonly pendingRequests = computed(() =>
    this.sortedRequests().filter((request) => request.status === 'PENDING'),
  );
  protected readonly recentRequests = computed(() => this.sortedRequests().slice(0, 5));

  constructor() {
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refreshIfVisible());

    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refreshIfVisible());
  }

  ngOnInit(): void {
    if (this.isStaff()) {
      this.loading.set(false);
      return;
    }
    this.loadDashboard();
  }

  protected loadDashboard(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }

    this.inventory.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => this.handleError(error, silent),
    });

    this.inventory.listAllRequests().subscribe({
      next: (requests) => this.requests.set(requests),
      error: () => {},
    });
  }

  protected approve(request: StockRequest): void {
    this.processingId.set(request.id);
    this.inventory.approveRequest(request.id).subscribe({
      next: () => this.afterAction(),
      error: (error: unknown) => this.afterAction(error),
    });
  }

  protected reject(request: StockRequest): void {
    this.processingId.set(request.id);
    this.inventory.rejectRequest(request.id).subscribe({
      next: () => this.afterAction(),
      error: (error: unknown) => this.afterAction(error),
    });
  }

  private afterAction(error?: unknown): void {
    this.processingId.set(null);
    if (error) {
      this.handleError(error);
      return;
    }
    this.loadDashboard(true);
  }

  protected isLowStock(item: InventoryItem): boolean {
    return Number(item.balance?.quantity ?? 0) <= this.reorderBaseQuantity(item);
  }

  private reorderBaseQuantity(item: InventoryItem): number {
    const reorderLevel = Math.max(0, Number(item.reorderLevel) || 0);
    const factor = Number(item.conversionFactor);
    return reorderLevel * (Number.isFinite(factor) && factor > 0 ? factor : 1);
  }

  private refreshIfVisible(): void {
    if (!document.hidden && !this.isStaff()) this.loadDashboard(true);
  }

  protected requestQuantityLabel(request: StockRequest): string {
    const base = Number(request.quantity) || 0;
    const baseUnit = request.item.distributionUom?.trim() || 'unit';
    const factor = Number(request.item.conversionFactor) || 1;
    const purchaseUnit = request.item.purchaseUom?.trim() || '';
    if (
      factor > 1 &&
      purchaseUnit &&
      purchaseUnit.toLowerCase() !== baseUnit.toLowerCase() &&
      base + 1e-9 >= factor
    ) {
      return `${this.formatAmount(base / factor)} ${purchaseUnit} = ${this.formatAmount(base)} ${baseUnit}`;
    }
    return `${this.formatAmount(base)} ${baseUnit}`;
  }

  private formatAmount(value: number): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(value);
  }

  private handleError(error: unknown, silent = false): void {
    if (!silent) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? error.status === 0
            ? 'Could not connect to the inventory service. Check that the backend is running.'
            : `Unable to load dashboard inventory (${error.status}).`
          : error instanceof Error
            ? error.message
            : 'Unable to load dashboard inventory.',
      );
    }
    if (!silent) this.loading.set(false);
  }

}

