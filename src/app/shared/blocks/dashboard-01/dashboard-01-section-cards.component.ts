import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { InventoryItem } from '@/home/stock-in.service';
import { ZardCardImports } from '@/shared/components/card/card.imports';

interface SectionCard {
  readonly description: string;
  readonly value: string;
  readonly caption: string;
}

@Component({
  selector: 'lib-dashboard-01-section-cards',
  standalone: true,
  imports: [...ZardCardImports],
  templateUrl: './dashboard-01-section-cards.component.html',
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
      return quantity > 0 && quantity <= Number(item.reorderLevel);
    }).length;

    return [
      {
        description: 'Active items',
        value: String(items.length),
        caption: 'Items currently available for inventory transactions',
      },
      {
        description: 'Low stock items',
        value: String(lowStock),
        caption: 'Items with a positive balance at or below reorder level',
      },
      {
        description: 'Out of stock',
        value: String(outOfStock),
        caption: 'Active items with no available balance',
      },
    ];
  });

  private quantity(item: InventoryItem): number {
    return Number(item.balance?.quantity ?? 0);
  }
}
