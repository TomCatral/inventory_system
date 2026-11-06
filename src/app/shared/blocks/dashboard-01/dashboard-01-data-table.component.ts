import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronsLeft,
  lucideChevronsRight,
  lucideCircleCheck,
  lucideCircleX,
  lucideColumns3,
  lucidePlus,
  lucideTriangleAlert,
} from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge/badge.component';
import { ZardButtonComponent } from '@/shared/components/button/button.component';
import { ZardDropdownImports } from '@/shared/components/dropdown/dropdown.imports';
import { ZardSelectImports } from '@/shared/components/select/select.imports';
import { ZardTableImports } from '@/shared/components/table/table.imports';
import { tabButtonVariants, tabNavVariants } from '@/shared/components/tabs/tabs.variants';
import type { InventoryItem } from '@/home/stock-in.service';

export interface Dashboard01Row {
  readonly id: number;
  readonly header: string;
  readonly type: string;
  readonly status: 'In stock' | 'Low stock' | 'Out of stock';
  readonly target: string;
  readonly limit: string;
  readonly unit: string;
}

type ColumnKey = 'type' | 'status' | 'target' | 'limit' | 'unit';

@Component({
  selector: 'lib-dashboard-01-data-table',
  standalone: true,
  imports: [
    ...ZardTableImports,
    ...ZardDropdownImports,
    ...ZardSelectImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    FormsModule,
    NgIcon,
    RouterLink,
  ],
  viewProviders: [
    provideIcons({
      lucideChevronDown,
      lucideChevronLeft,
      lucideChevronRight,
      lucideChevronsLeft,
      lucideChevronsRight,
      lucideCircleCheck,
      lucideCircleX,
      lucideColumns3,
      lucidePlus,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './dashboard-01-data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01DataTableComponent {
  protected readonly navClasses = tabNavVariants({ zVariant: 'default' });
  protected readonly buttonClasses = tabButtonVariants();

  protected readonly activeTab = signal('outline');

  protected readonly columns: { key: ColumnKey; label: string }[] = [
    { key: 'type', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'target', label: 'In stock' },
    { key: 'limit', label: 'Reorder point' },
    { key: 'unit', label: 'Unit' },
  ];

  protected readonly hiddenColumns = signal<ReadonlySet<ColumnKey>>(new Set());

  readonly items = input<InventoryItem[]>([]);
  protected readonly rows = computed<Dashboard01Row[]>(() =>
    this.items().map((item) => {
      const quantity = Number(item.balance?.quantity ?? 0);
      const reorderLevel = Number(item.reorderLevel);
      return {
        id: item.id,
        header: item.itemName,
        type: item.category === 'CONSUMABLE' ? 'Consumable' : 'Non-consumable',
        status: quantity <= 0
          ? 'Out of stock'
          : quantity <= reorderLevel
            ? 'Low stock'
            : 'In stock',
        target: String(quantity),
        limit: String(reorderLevel),
        unit: item.distributionUom,
      };
    }),
  );
  protected readonly tabs = computed(() => [
    { value: 'outline', label: 'All items', badge: String(this.rows().length) },
    {
      value: 'past-performance',
      label: 'Low stock',
      badge: String(this.rows().filter((row) => row.status === 'Low stock').length),
    },
    {
      value: 'key-personnel',
      label: 'Out of stock',
      badge: String(this.rows().filter((row) => row.status === 'Out of stock').length),
    },
  ]);

  protected readonly pageSizes = ['10', '20', '30', '40', '50'];
  protected readonly pageSize = signal('10');
  protected readonly pageIndex = signal(0);

  protected readonly filteredRows = computed(() => {
    const tab = this.activeTab();
    if (tab === 'past-performance') {
      return this.rows().filter((row) => row.status === 'Low stock');
    }
    if (tab === 'key-personnel') {
      return this.rows().filter((row) => row.status === 'Out of stock');
    }
    return this.rows();
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / Number(this.pageSize()))),
  );

  protected readonly pageRows = computed(() => {
    const size = Number(this.pageSize());
    const start = this.pageIndex() * size;
    return this.filteredRows().slice(start, start + size);
  });

  protected visibleColumnCount(): number {
    return 1 + this.columns.filter((column) => this.isVisible(column.key)).length;
  }

  protected isVisible(column: ColumnKey): boolean {
    return !this.hiddenColumns().has(column);
  }

  protected toggleColumn(column: ColumnKey, visible: boolean): void {
    this.hiddenColumns.update(columns => {
      const next = new Set(columns);
      if (visible) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }

  protected onTabChange(tab: string): void {
    this.activeTab.set(tab);
    this.pageIndex.set(0);
  }

  protected onPageSizeChange(size: string | string[]): void {
    if (typeof size !== 'string' || !size) {
      return;
    }

    this.pageSize.set(size);
    this.pageIndex.set(0);
  }

  protected goToPage(index: number): void {
    this.pageIndex.set(Math.min(Math.max(index, 0), this.pageCount() - 1));
  }

}
