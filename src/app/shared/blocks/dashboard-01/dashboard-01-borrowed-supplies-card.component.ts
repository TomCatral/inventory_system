import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePackageCheck } from '@ng-icons/lucide';

import { InventoryService, type BorrowedSupplyRecord } from '@/services/inventory.service';

@Component({
  selector: 'lib-dashboard-01-borrowed-supplies-card',
  standalone: true,
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ lucidePackageCheck })],
  templateUrl: './dashboard-01-borrowed-supplies-card.component.html',
  styleUrl: './dashboard-01-borrowed-supplies-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01BorrowedSuppliesCardComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<BorrowedSupplyRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly pendingCount = computed(
    () => this.records().filter((record) => record.status === 'PENDING').length,
  );

  constructor() {
    interval(10_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    this.load(false);
  }

  private load(silent: boolean): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }
    this.inventory.listBorrowedSupplies().subscribe({
      next: (records) => {
        this.records.set(records);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) {
          this.error.set(error instanceof HttpErrorResponse
            ? error.status === 0
              ? 'Could not connect to the inventory service.'
              : `Unable to load borrowed supplies (${error.status}).`
            : 'Unable to load borrowed supplies.');
        }
        this.loading.set(false);
      },
    });
  }
}
