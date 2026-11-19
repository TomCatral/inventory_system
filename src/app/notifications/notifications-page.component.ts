import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryService, type AppNotification } from '../services/inventory.service';

type NotificationTone = 'approved' | 'rejected' | 'pending' | 'info';
type NotificationFilter = 'all' | 'unread';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPageComponent implements OnInit, OnDestroy {
  private readonly inventory = inject(InventoryService);
  private readonly pollInterval: ReturnType<typeof setInterval>;

  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filter = signal<NotificationFilter>('all');

  constructor() {
    this.pollInterval = setInterval(() => {
      if (!document.hidden) this.loadNotifications();
    }, 5_000);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.pollInterval);
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.inventory.listNotifications().subscribe({
      next: (items) => {
        this.notifications.set(items.filter((n) => this.isInventoryUpdate(n)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  private loadNotifications(): void {
    this.inventory.listNotifications().subscribe({
      next: (items) => this.notifications.set(items.filter((n) => this.isInventoryUpdate(n))),
      error: () => {},
    });
  }

  protected isSupplyUpdate(n: AppNotification): boolean {
    return n.refType === 'SUPPLY_ASSIGNMENT' || n.refType === 'SUPPLY_RETURN' || n.refType === 'STOCK_REQUEST';
  }

  protected refCode(n: AppNotification): string {
    return `${this.isSupplyUpdate(n) ? 'ASN' : 'REQ'}-${n.refId}`;
  }

  private isInventoryUpdate(n: AppNotification): boolean {
    return this.isSupplyUpdate(n);
  }

  protected unread(): AppNotification[] {
    return this.notifications().filter((n) => !n.isRead);
  }

  protected filteredNotifications(): AppNotification[] {
    const filter = this.filter();
    if (filter === 'all') return this.notifications();
    if (filter === 'unread') return this.unread();
    return this.notifications();
  }


  protected setFilter(filter: NotificationFilter): void {
    this.filter.set(filter);
  }

  protected tone(n: AppNotification): NotificationTone {
    if (n.message.includes('READY TO PICK UP') || n.message.includes('APPROVED')) return 'approved';
    if (n.message.includes('REJECTED')) return 'rejected';
    if (n.message.toLowerCase().includes('new supply request')) return 'pending';
    return 'info';
  }

  protected markRead(id: number): void {
    this.inventory.markNotificationRead(id).subscribe({
      next: () => this.notifications.update((items) => items.map((n) => n.id === id ? { ...n, isRead: true } : n)),
      error: (error: unknown) => this.error.set(this.getError(error)),
    });
  }

  protected markAllRead(): void {
    this.inventory.markAllNotificationsRead().subscribe({
      next: () => this.notifications.update((items) => items.map((n) => ({ ...n, isRead: true }))),
      error: (error: unknown) => this.error.set(this.getError(error)),
    });
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return typeof message === 'string' ? message : `Unable to load notifications (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unable to load notifications.';
  }
}

