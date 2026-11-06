import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { StockInService, type InventoryItem, type InventoryMovement } from '@/home/stock-in.service';
import { Dashboard01ChartAreaInteractiveComponent } from './dashboard-01-chart-area-interactive.component';
import { Dashboard01DataTableComponent } from './dashboard-01-data-table.component';
import { Dashboard01SectionCardsComponent } from './dashboard-01-section-cards.component';

@Component({
  selector: 'lib-dashboard-01-overview',
  standalone: true,
  imports: [
    Dashboard01ChartAreaInteractiveComponent,
    Dashboard01DataTableComponent,
    Dashboard01SectionCardsComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      @if (error()) {
        <p role="alert" class="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive lg:mx-6">
          {{ error() }}
          <button type="button" class="ml-2 font-semibold underline" (click)="loadDashboard()">Try again</button>
        </p>
      } @else if (loading()) {
        <p role="status" class="px-4 text-sm text-muted-foreground lg:px-6">Loading inventory dashboard…</p>
      } @else {
        <lib-dashboard-01-section-cards [items]="items()" />

        <div class="px-4 lg:px-6">
          <lib-dashboard-01-chart-area-interactive [movements]="movements()" />
        </div>

        <lib-dashboard-01-data-table [items]="items()" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01OverviewComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly movements = signal<InventoryMovement[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.loadDashboard();
  }

  protected loadDashboard(): void {
    this.loading.set(true);
    this.error.set('');

    const from = new Date();
    from.setDate(from.getDate() - 89);
    const fromDate = from.toISOString().slice(0, 10);

    this.inventory.listBalances().subscribe({
      next: (items) => {
        this.items.set(items);
        this.inventory.listMovements({ from: fromDate }).subscribe({
          next: (movements) => {
            this.movements.set(movements);
            this.loading.set(false);
          },
          error: (error: unknown) => this.handleError(error),
        });
      },
      error: (error: unknown) => this.handleError(error),
    });
  }

  private handleError(error: unknown): void {
    this.error.set(
      error instanceof HttpErrorResponse
        ? error.status === 0
          ? 'Could not connect to the inventory service. Check that the backend is running.'
          : `Unable to load dashboard inventory (${error.status}).`
        : error instanceof Error
          ? error.message
          : 'Unable to load dashboard inventory.',
    );
    this.loading.set(false);
  }
}
