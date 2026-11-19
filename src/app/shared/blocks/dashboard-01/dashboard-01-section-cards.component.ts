import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBoxes, lucideCircleAlert, lucidePackageX } from '@ng-icons/lucide';

import type { InventoryItem } from '@/services/inventory.service';
import { ZardCardImports } from '@/shared/components/card/card.imports';

interface SectionCard {
  readonly description: string;
  readonly value: string;
  readonly caption: string;
  readonly icon: string;
  readonly route: string;
  readonly tone: 'default' | 'warning' | 'danger';
}

@Component({
  selector: 'lib-dashboard-01-section-cards',
  standalone: true,
  imports: [...ZardCardImports, RouterLink, NgIcon],
  viewProviders: [provideIcons({ lucideBoxes, lucideCircleAlert, lucidePackageX })],
  templateUrl: './dashboard-01-section-cards.component.html',
  styleUrl: './dashboard-01-section-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01SectionCardsComponent {
  readonly items = input<InventoryItem[]>([]);
  protected readonly cards = computed<readonly SectionCard[]>(() => {
    const items = this.items();
    const outOfStock = items.filter((item) => this.quantity(item) <= 0).length;
    const lowStock = items.filter((item) => {
      const quantity = this.quantity(item);
      return quantity > 0 && quantity <= this.reorderBaseQuantity(item);
    }).length;

    return [
      {
        description: 'Active items',
        value: String(items.length),
        caption: 'Items currently available for inventory transactions',
        icon: 'lucideBoxes', route: '/home/setup/items', tone: 'default',
      },
      {
        description: 'Low stock items',
        value: String(lowStock),
        caption: 'Items with a positive balance at or below reorder level',
        icon: 'lucideCircleAlert', route: '/home/reports/low-stock', tone: 'warning',
      },
      {
        description: 'Out of stock',
        value: String(outOfStock),
        caption: 'Active items with no available balance',
        icon: 'lucidePackageX', route: '/home/reports/low-stock', tone: 'danger',
      },
    ];
  });

  private quantity(item: InventoryItem): number {
    return Number(item.balance?.quantity ?? 0);
  }

  private reorderBaseQuantity(item: InventoryItem): number {
    const reorderLevel = Math.max(0, Number(item.reorderLevel) || 0);
    const factor = Number(item.conversionFactor);
    return reorderLevel * (Number.isFinite(factor) && factor > 0 ? factor : 1);
  }
}

