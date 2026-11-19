import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin, interval } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucidePackageCheck, lucidePackageOpen, lucidePackagePlus } from '@ng-icons/lucide';

import { InventoryService, type AppNotification, type StockRequest, type SupplyAssignment } from '@/services/inventory.service';
import { ZardCardImports } from '@/shared/components/card/card.imports';
import { Dashboard01BorrowedFormModalComponent } from './dashboard-01-borrowed-form-modal.component';

interface StaffSupplyGroup {
  readonly itemId: number;
  readonly item: SupplyAssignment['item'];
  readonly assignments: SupplyAssignment[];
  readonly issuedLabel: string;
  readonly remainingLabel: string;
}

@Component({
  selector: 'lib-dashboard-01-staff-overview',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, NgIcon, ...ZardCardImports, Dashboard01BorrowedFormModalComponent],
  viewProviders: [provideIcons({ lucideBell, lucidePackageCheck, lucidePackageOpen, lucidePackagePlus })],
  templateUrl: './dashboard-01-staff-overview.component.html',
  styleUrl: './dashboard-01-staff-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01StaffOverviewComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  protected readonly supplies = signal<SupplyAssignment[]>([]);
  protected readonly requests = signal<StockRequest[]>([]);
  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly borrowedFormOpen = signal(false);
  protected readonly unread = computed(() => this.notifications().filter((n) => !n.isRead));
  protected readonly totalUnits = computed(() => this.supplies().reduce((sum, supply) => sum + Number(supply.remainingQuantity), 0));
  protected readonly recentSupplies = computed(() => this.supplies().slice(0, 6));
  protected readonly recentNotifications = computed(() => this.notifications().slice(0, 5));
  protected readonly pendingRequests = computed(() =>
    this.requests()
      .filter((request) => request.status === 'PENDING')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  );
  protected readonly supplyGroups = computed<StaffSupplyGroup[]>(() => {
    const grouped = new Map<number, SupplyAssignment[]>();
    for (const supply of this.supplies()) {
      const list = grouped.get(supply.itemId) ?? [];
      list.push(supply);
      grouped.set(supply.itemId, list);
    }
    return [...grouped.entries()].map(([itemId, assignments]) => {
      const ordered = [...assignments].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const representative = ordered[0];
      const issuedBase = ordered.reduce((total, supply) => total + (Number(supply.quantity) || 0), 0);
      const remainingBase = ordered.reduce((total, supply) => total + (Number(supply.remainingQuantity) || 0), 0);
      return {
        itemId,
        item: representative.item,
        assignments: ordered,
        issuedLabel: this.issueLabel(representative, String(issuedBase)),
        remainingLabel: this.issueLabel(representative, String(remainingBase)),
      };
    });
  });

  constructor() {
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load(true));
  }

  ngOnInit(): void { this.load(); }

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

  protected issueLabel(supply: SupplyAssignment, quantity: string): string {
    const baseQuantity = Number(quantity) || 0;
    const baseUnit = supply.item.distributionUom?.trim() || 'unit';
    const storedUnit = supply.enteredUom?.trim();
    const storedFactor = Number(supply.conversionFactor ?? 0) || 0;
    if (
      storedUnit &&
      storedFactor > 1 &&
      storedUnit.toLowerCase() !== baseUnit.toLowerCase()
    ) {
      return this.formatAmount(baseQuantity / storedFactor) + ' ' + storedUnit + ' = ' + this.formatAmount(baseQuantity) + ' ' + baseUnit;
    }
    const factor = Number(supply.item.conversionFactor) || 1;
    const purchaseUnit = supply.item.purchaseUom?.trim() || '';
    if (factor > 1 && purchaseUnit && purchaseUnit.toLowerCase() !== baseUnit.toLowerCase()) {
      return this.formatAmount(baseQuantity / factor) + ' ' + purchaseUnit + ' = ' + this.formatAmount(baseQuantity) + ' ' + baseUnit;
    }
    return this.formatAmount(baseQuantity) + ' ' + baseUnit;
  }

  private formatAmount(value: number): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(value);
  }

  protected load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }
    forkJoin({
      supplies: this.inventory.listMySupplies(),
      requests: this.inventory.listMyRequests(),
      notifications: this.inventory.listNotifications(),
    }).subscribe({
      next: ({ supplies, requests, notifications }) => {
        this.supplies.set(supplies);
        this.requests.set(requests);
        this.notifications.set(notifications.filter((n) => n.refType === 'SUPPLY_ASSIGNMENT' || n.refType === 'STOCK_REQUEST'));
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) {
          this.error.set(error instanceof HttpErrorResponse
            ? error.status === 0 ? 'Could not connect to the inventory service.' : `Unable to load assigned supplies (${error.status}).`
            : error instanceof Error ? error.message : 'Unable to load assigned supplies.');
        }
        if (!silent) this.loading.set(false);
      },
    });
  }
}
