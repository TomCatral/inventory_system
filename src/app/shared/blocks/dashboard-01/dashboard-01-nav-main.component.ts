import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChartBar,
  lucideChevronDown,
  lucideClipboardList,
  lucidePackage,
  lucideSettings2,
  lucidePackagePlus,
  lucidePackageMinus,
  lucideRotateCcw,
  lucidePackageCheck,
  lucideBoxes,
  lucideCircleAlert,
  lucideHistory,
  lucideArrowDownToLine,
  lucideArrowUpFromLine,
  lucideShieldAlert,
  lucideUsersRound,
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
  readonly icon: string;
}

export const DASHBOARD01_NAV_GROUPS: readonly Dashboard01NavGroup[] = [
  {
    title: 'Inventory Operations',
    icon: 'lucidePackage',
    items: [
      { title: 'Stock In', route: 'transactions/stock-in', icon: 'lucidePackagePlus' },
      { title: 'Stock Out', route: 'transactions/stock-out', icon: 'lucidePackageMinus' },
      { title: 'Item Returns', route: 'transactions/return-of-items', icon: 'lucideRotateCcw' },
      { title: 'Supply Requests', route: 'transactions/manage-requests', icon: 'lucideClipboardList' },
    ],
  },
  {
    title: 'Assigned Supplies',
    icon: 'lucidePackageCheck',
    items: [
      { title: 'My Supplies', route: 'transactions/my-supplies', icon: 'lucidePackageCheck' },
      { title: 'Borrowed Supplies', route: 'transactions/borrowed-supply', icon: 'lucidePackageCheck' },
    ],
  },
  {
    title: 'Transactions',
    icon: 'lucideClipboardList',
    items: [
      { title: 'Request Supply', route: 'transactions/request-supply', icon: 'lucideClipboardList' },
      { title: 'Activity History', route: 'notifications', icon: 'lucideHistory' },
    ],
  },
  {
    title: 'Reports & History',
    icon: 'lucideChartBar',
    items: [
      { title: 'Stock on Hand', route: 'reports/inventory-summary', icon: 'lucideBoxes' },
      { title: 'Low Stock Report', route: 'reports/low-stock', icon: 'lucideCircleAlert' },
      { title: 'Transaction History', route: 'reports/transaction-history', icon: 'lucideHistory' },
      { title: 'Stock In Report', route: 'reports/stock-in', icon: 'lucideArrowDownToLine' },
      { title: 'Stock Out Report', route: 'reports/stock-out', icon: 'lucideArrowUpFromLine' },
      { title: 'Items Return Report', route: 'reports/damage-and-expired-items', icon: 'lucideShieldAlert' },
      { title: 'Employee Supplies Report', route: 'reports/employee-supplies', icon: 'lucideUsersRound' },
    ],
  },
  {
    title: 'Administration',
    icon: 'lucideSettings2',
    items: [
      { title: 'Item Catalog', route: 'setup/items', icon: 'lucidePackage' },
      { title: 'User Management', route: 'setup/user-roles', icon: 'lucideUsersRound' },
    ],
  },
];

export const DASHBOARD01_ASSIGNABLE_NAV_GROUPS: readonly Dashboard01NavGroup[] =
  DASHBOARD01_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.route !== 'setup/user-roles' &&
        item.route !== 'transactions/my-supplies',
    ),
  })).filter((group) => group.items.length > 0);

@Component({
  selector: 'lib-dashboard-01-nav-main',
  standalone: true,
  imports: [...ZardSidebarImports, NgIcon, RouterLink, RouterLinkActive],
  viewProviders: [
    provideIcons({
      lucideChartBar,
      lucideChevronDown,
      lucideClipboardList,
      lucidePackage,
      lucideSettings2,
      lucidePackagePlus,
      lucidePackageMinus,
      lucideRotateCcw,
      lucidePackageCheck,
      lucideBoxes,
      lucideCircleAlert,
      lucideHistory,
      lucideArrowDownToLine,
      lucideArrowUpFromLine,
      lucideShieldAlert,
      lucideUsersRound,
    }),
  ],
  templateUrl: './dashboard-01-nav-main.component.html',
  styleUrl: './dashboard-01-nav-main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01NavMainComponent {
  readonly groups = input<readonly Dashboard01NavGroup[]>([]);
  protected readonly expandedGroups = signal<ReadonlySet<string>>(
    new Set(['Inventory Operations', 'Assigned Supplies', 'Transactions', 'Reports & History']),
  );

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

