import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { InventoryService, type AppNotification, type StockRequest } from '../services/inventory.service';

type NotificationTone = 'approved' | 'rejected' | 'pending' | 'info';

@Component({
  selector: 'app-notification-drawer',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './notification-drawer.component.html',
  styleUrl: './notification-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDrawerComponent {
  private readonly inventory = inject(InventoryService);

  readonly open = input(false);
  readonly canApprove = input(false);
  readonly closed = output<void>();
  readonly changed = output<void>();

  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly requests = signal<Record<number, StockRequest>>({});
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly acting = signal<number | null>(null);
  protected readonly approveTarget = signal<StockRequest | null>(null);
  protected readonly approveNotification = signal<AppNotification | null>(null);
  protected readonly rejectTarget = signal<StockRequest | null>(null);
  protected readonly rejectNotification = signal<AppNotification | null>(null);
  protected readonly rejectReason = signal('');

  private wasOpen = false;

  constructor() {
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.open()) this.load(true);
      });

    effect(() => {
      const isOpen = this.open();
      if (isOpen && !this.wasOpen) {
        this.load();
      }
      if (!isOpen) {
        this.approveTarget.set(null);
        this.approveNotification.set(null);
        this.rejectTarget.set(null);
        this.rejectNotification.set(null);
        this.rejectReason.set('');
      }
      this.wasOpen = isOpen;
    });
  }

  protected load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
    }
    this.inventory.listNotifications().subscribe({
      next: (items) => {
        this.notifications.set(items.filter((n) => this.isInventoryUpdate(n)));
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.error.set(this.errMsg(error));
        if (!silent) this.loading.set(false);
      },
    });

    if (this.canApprove()) {
      this.inventory.listAllRequests().subscribe({
        next: (requests) => {
          this.requests.set(Object.fromEntries(requests.map((request) => [request.id, request])));
        },
        error: () => this.requests.set({}),
      });
    }
  }

  protected requestFor(n: AppNotification): StockRequest | undefined {
    return n.refId == null ? undefined : this.requests()[n.refId];
  }

  protected quantityLabel(item: StockRequest['item'], quantity: string | number): string {
    const base = Number(quantity) || 0;
    const baseUnit = item.distributionUom?.trim() || 'unit';
    const factor = Number(item.conversionFactor) || 1;
    const purchaseUnit = item.purchaseUom?.trim() || '';
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

  protected isSupplyUpdate(n: AppNotification): boolean {
    return n.refType === 'SUPPLY_ASSIGNMENT' || n.refType === 'SUPPLY_RETURN' || n.refType === 'STOCK_REQUEST';
  }

  protected refCode(n: AppNotification): string {
    return `${this.isSupplyUpdate(n) ? 'ASN' : 'REQ'}-${n.refId}`;
  }

  private isInventoryUpdate(n: AppNotification): boolean {
    return this.isSupplyUpdate(n);
  }

  protected canAct(n: AppNotification): boolean {
    if (!this.canApprove() || n.refType !== 'STOCK_REQUEST') return false;
    const request = this.requestFor(n);
    return request?.status === 'PENDING';
  }

  protected tone(n: AppNotification): NotificationTone {
    if (n.message.includes('READY TO PICK UP') || n.message.includes('APPROVED')) return 'approved';
    if (n.message.includes('REJECTED')) return 'rejected';
    if (n.message.toLowerCase().includes('new supply request')) return 'pending';
    return 'info';
  }

  protected unreadCount(): number {
    return this.notifications().filter((n) => !n.isRead).length;
  }

  protected markRead(n: AppNotification): void {
    this.inventory.markNotificationRead(n.id).subscribe({
      next: () => this.markReadInternal(n.id),
      error: () => {},
    });
  }

  protected markAllRead(): void {
    this.inventory.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.update((items) => items.map((n) => ({ ...n, isRead: true })));
        this.changed.emit();
      },
      error: () => {},
    });
  }

  protected askApprove(n: AppNotification): void {
    const request = this.requestFor(n);
    if (!request) return;
    this.approveTarget.set(request);
    this.approveNotification.set(n);
    this.error.set('');
  }

  protected cancelApprove(): void {
    this.approveTarget.set(null);
    this.approveNotification.set(null);
  }

  protected confirmApprove(): void {
    const request = this.approveTarget();
    const notification = this.approveNotification();
    if (!request || !notification || this.acting() === request.id) return;

    this.acting.set(request.id);
    this.error.set('');
    this.inventory.approveRequest(request.id).subscribe({
      next: (updated) => {
        this.requests.update((map) => ({ ...map, [updated.id]: updated }));
        this.removeNotification(notification.id);
        this.approveTarget.set(null);
        this.approveNotification.set(null);
        this.acting.set(null);
        this.load(true);
      },
      error: (error: unknown) => {
        this.error.set(this.errMsg(error));
        this.acting.set(null);
      },
    });
  }

  protected askReject(n: AppNotification): void {
    const request = this.requestFor(n);
    if (!request) return;
    this.rejectTarget.set(request);
    this.rejectNotification.set(n);
    this.rejectReason.set('');
    this.error.set('');
  }

  protected setReason(value: string): void {
    this.rejectReason.set(value);
  }

  protected cancelReject(): void {
    this.rejectTarget.set(null);
    this.rejectNotification.set(null);
    this.rejectReason.set('');
  }

  protected confirmReject(): void {
    const request = this.rejectTarget();
    const notification = this.rejectNotification();
    const reason = this.rejectReason().trim();
    if (!request || !notification) return;
    if (!reason) {
      this.error.set('Please write the reason for disapproval.');
      return;
    }

    this.acting.set(request.id);
    this.error.set('');
    this.inventory.rejectRequest(request.id, reason).subscribe({
      next: (updated) => {
        this.requests.update((map) => ({ ...map, [updated.id]: updated }));
        this.removeNotification(notification.id);
        this.rejectTarget.set(null);
        this.rejectNotification.set(null);
        this.rejectReason.set('');
        this.acting.set(null);
        this.load(true);
      },
      error: (error: unknown) => {
        this.error.set(this.errMsg(error));
        this.acting.set(null);
      },
    });
  }

  private removeNotification(id: number): void {
    this.notifications.update((items) => items.filter((n) => n.id !== id));
    this.changed.emit();
  }

  private markReadInternal(id: number): void {
    this.notifications.update((items) =>
      items.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    this.changed.emit();
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

