import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StockInService, type InventoryMovement } from './stock-in.service';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <section class="mx-auto w-full max-w-5xl space-y-6 px-4 lg:px-8">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-primary text-sm font-medium">Updates</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight">Notifications</h1>
          <p class="text-muted-foreground mt-1 text-sm">Recent inventory activity and stock changes.</p>
        </div>
        <button type="button" class="app-button app-button-primary app-button-sm" [disabled]="loading()" (click)="load()">
          {{ loading() ? 'Refreshing…' : 'Refresh' }}
        </button>
      </header>

      @if (error()) {
        <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p>
      }

      <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
        @if (loading() && movements().length === 0) {
          <p class="text-muted-foreground p-6 text-sm">Loading recent activity…</p>
        } @else if (movements().length === 0) {
          <div class="p-8 text-center">
            <h2 class="font-semibold">You’re all caught up</h2>
            <p class="text-muted-foreground mt-1 text-sm">New inventory activity will appear here.</p>
          </div>
        } @else {
          <ul class="divide-y">
            @for (movement of movements(); track movement.id) {
              <li class="flex flex-wrap items-start justify-between gap-3 p-4 md:px-6">
                <div class="min-w-0">
                  <p class="font-medium">{{ movement.item.itemName }}</p>
                  <p class="text-muted-foreground mt-1 text-sm">
                    {{ movementLabel(movement.movementType) }} ·
                    {{ movement.quantityEntered | number: '1.0-3' }} {{ movement.enteredUom }}
                  </p>
                  @if (movement.note) {
                    <p class="text-muted-foreground mt-1 text-xs">{{ movement.note }}</p>
                  }
                </div>
                <div class="text-right">
                  <time class="text-muted-foreground text-xs" [dateTime]="movement.createdAt">{{ movement.createdAt | date: 'medium' }}</time>
                  <p class="mt-1 text-xs">Balance: {{ movement.balanceAfter | number: '1.0-3' }} {{ movement.item.distributionUom }}</p>
                </div>
              </li>
            }
          </ul>
          <div class="border-t p-4 text-right">
            <a routerLink="/home/transactions/transaction-history" class="text-primary text-sm font-medium underline underline-offset-4">View transaction history</a>
          </div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  protected readonly movements = signal<InventoryMovement[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.inventory.listMovements().subscribe({
      next: (movements) => {
        this.movements.set(movements.slice(0, 30));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  protected movementLabel(type: string): string {
    const labels: Record<string, string> = {
      STOCK_IN: 'Stock received',
      STOCK_OUT: 'Stock issued',
      RETURN_IN: 'Items returned',
      ADJUSTMENT_IN: 'Stock adjustment increased balance',
      ADJUSTMENT_OUT: 'Stock adjustment decreased balance',
      DAMAGE_OUT: 'Damaged stock written off',
      COUNT_IN: 'Physical count increased balance',
      COUNT_OUT: 'Physical count decreased balance',
    };
    return labels[type] ?? type.replaceAll('_', ' ').toLocaleLowerCase();
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return typeof message === 'string' ? message : `Unable to load notifications (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unable to load notifications.';
  }
}
