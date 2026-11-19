import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideMoon, lucideSun } from '@ng-icons/lucide';

import { AuthService } from '@/Auth/auth.service';
import { InventoryService } from '@/services/inventory.service';
import { NotificationDrawerComponent } from '@/notifications/notification-drawer.component';
import { ZardSeparatorComponent } from '@/shared/components/separator/separator.component';
import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';
import { Dashboard01NavUserComponent, type Dashboard01User } from './dashboard-01-nav-user.component';

@Component({
  selector: 'lib-dashboard-01-site-header',
  standalone: true,
  imports: [
    ...ZardSidebarImports,
    ZardSeparatorComponent,
    NgIcon,
    NotificationDrawerComponent,
    Dashboard01NavUserComponent,
  ],
  viewProviders: [provideIcons({ lucideBell, lucideMoon, lucideSun })],
  templateUrl: './dashboard-01-site-header.component.html',
  styleUrl: './dashboard-01-site-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01SiteHeaderComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryService);
  protected readonly theme = inject(ZardDarkMode);
  private readonly subscription: Subscription;
  private readonly pollInterval: ReturnType<typeof setInterval>;

  protected readonly pageTitle = signal('Dashboard');
  protected readonly sectionTitle = signal('Overview');
  protected readonly unreadCount = signal(0);
  protected readonly drawerOpen = signal(false);
  protected readonly user = computed<Dashboard01User>(() => ({
    name: this.auth.profile()?.name || 'PGC Employee',
    email: this.roleLabel(),
    avatar: '',
  }));
  protected readonly isAdmin = computed(() => {
    const role = this.auth.inventoryRole();
    return role === 'ADMIN' || role === 'SUPERADMIN';
  });
  protected readonly isDark = computed(() => this.theme.themeMode() === EDarkModes.DARK);
  protected readonly today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date());

  constructor() {
    this.updateTitle(this.router.url);
    this.subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateTitle(event.urlAfterRedirects);
        this.loadUnread();
      });
    this.loadUnread();
    this.pollInterval = setInterval(() => this.loadUnread(), 5_000);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    clearInterval(this.pollInterval);
  }

  protected loadUnread(): void {
    if (!this.auth.hasSession()) return;
    try {
      this.inventory.unreadCount().subscribe({
        next: (count) => this.unreadCount.set(Number(count) || 0),
        error: () => {},
      });
    } catch {
      this.unreadCount.set(0);
    }
  }

  protected toggleTheme(): void {
    this.theme.toggleTheme(this.isDark() ? EDarkModes.LIGHT : EDarkModes.DARK);
  }

  private roleLabel(): string {
    switch (this.auth.inventoryRole()) {
      case 'SUPERADMIN': return 'Super Admin';
      case 'ADMIN': return 'Administrator';
      default: return 'Staff';
    }
  }

  private updateTitle(url: string): void {
    const route = url.split('?')[0].split('/').filter(Boolean).slice(1);
    if (route.length === 0) {
      this.sectionTitle.set('Overview');
      this.pageTitle.set('Dashboard');
      return;
    }
    const labels: Record<string, string> = {
      transactions: 'Transactions', reports: 'Reports', setup: 'Setup',
      account: 'Account', settings: 'Preferences', notifications: 'Supply History',
    };
    this.sectionTitle.set(labels[route[0]] ?? 'Inventory');
    this.pageTitle.set((route.at(-1) ?? 'Dashboard')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '));
  }
}

