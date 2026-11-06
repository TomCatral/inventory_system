import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideChartBar,
  lucideChevronDown,
  lucideSettings2,
} from '@ng-icons/lucide';

import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

export interface Dashboard01NavGroup {
  readonly title: string;
  readonly icon: string;
  readonly items: readonly Dashboard01NavItem[];
}

export interface Dashboard01NavItem {
  readonly title: string;
  readonly route: string;
}

export const DASHBOARD01_NAV_GROUPS: readonly Dashboard01NavGroup[] = [
  {
    title: 'Transactions',
    icon: 'lucideArrowLeftRight',
    items: [
      { title: 'Stock In', route: 'transactions/stock-in' },
      { title: 'Stock Out', route: 'transactions/stock-out' },
      { title: 'Return of Items', route: 'transactions/return-of-items' },
      { title: 'Stock Adjustment', route: 'transactions/stock-adjustment' },
      { title: 'Transaction History', route: 'transactions/transaction-history' },
      { title: 'Physical Inventory', route: 'transactions/physical-inventory' },
    ],
  },
  {
    title: 'Reports',
    icon: 'lucideChartBar',
    items: [
      { title: 'Inventory Summary', route: 'reports/inventory-summary' },
      { title: 'Stock In Report', route: 'reports/stock-in' },
      { title: 'Stock Out Report', route: 'reports/stock-out' },
      { title: 'Low Stock Report', route: 'reports/low-stock' },
      { title: 'Physical Count Report', route: 'reports/physical-count' },
      { title: 'Damage and Expired Items', route: 'reports/damage-and-expired-items' },
      { title: 'Transaction History Reports', route: 'reports/transaction-history' },
    ],
  },
  {
    title: 'Setup',
    icon: 'lucideSettings2',
    items: [
      { title: 'Items', route: 'setup/items' },
      { title: 'User Roles', route: 'setup/user-roles' },
    ],
  },
];

export const DASHBOARD01_NAV_ROUTES = DASHBOARD01_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    path: item.route,
    title: item.title,
    section: group.title,
  })),
);


@Component({
  selector: 'lib-dashboard-01-nav-main',
  standalone: true,
  imports: [...ZardSidebarImports, NgIcon, RouterLink, RouterLinkActive],
  viewProviders: [
    provideIcons({
      lucideArrowLeftRight,
      lucideChartBar,
      lucideChevronDown,
      lucideSettings2,
    }),
  ],
  templateUrl: './dashboard-01-nav-main.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01NavMainComponent {
  readonly groups = input<readonly Dashboard01NavGroup[]>([]);
  protected readonly expandedGroups = signal<ReadonlySet<string>>(new Set(['Transactions', 'Reports']));

  protected isExpanded(title: string): boolean {
    return this.expandedGroups().has(title);
  }

  protected toggleGroup(title: string): void {
    this.expandedGroups.update((expanded) => {
      const next = new Set(expanded);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }
}
