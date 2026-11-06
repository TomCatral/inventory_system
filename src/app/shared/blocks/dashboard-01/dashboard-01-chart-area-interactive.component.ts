import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import type { InventoryMovement } from '@/home/stock-in.service';
import { ZardCardImports } from '@/shared/components/card/card.imports';
import { ZardChartImports } from '@/shared/components/chart/chart.imports';
import type { ZardChartConfig, ZardChartSeries } from '@/shared/components/chart/chart.types';
import { ZardSelectImports } from '@/shared/components/select/select.imports';
import { ZardToggleGroupComponent } from '@/shared/components/toggle-group/toggle-group.component';

@Component({
  selector: 'lib-dashboard-01-chart-area-interactive',
  standalone: true,
  imports: [...ZardCardImports, ...ZardChartImports, ...ZardSelectImports, ZardToggleGroupComponent],
  templateUrl: './dashboard-01-chart-area-interactive.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01ChartAreaInteractiveComponent {
  protected readonly chartConfig: ZardChartConfig = {
    stockIn: { label: 'Stock received', color: 'var(--chart-1)' },
    stockOut: { label: 'Stock issued', color: 'var(--chart-2)' },
  };

  protected readonly series: ZardChartSeries[] = [
    { dataKey: 'stockIn', smooth: true },
    { dataKey: 'stockOut', smooth: true },
  ];

  protected readonly ranges = [
    { value: '90d', label: 'Last 3 months' },
    { value: '30d', label: 'Last 30 days' },
    { value: '7d', label: 'Last 7 days' },
  ];

  protected readonly range = signal('90d');
  readonly movements = input<InventoryMovement[]>([]);

  /** The trailing slice of the series, counted back from the newest row. */
  protected readonly visibleData = computed(() => {
    const days = this.range() === '7d' ? 7 : this.range() === '30d' ? 30 : 90;
    return this.chartData().slice(-days);
  });
  protected readonly hasVisibleMovement = computed(() =>
    this.visibleData().some((day) => day.stockIn > 0 || day.stockOut > 0),
  );

  protected onRangeChange(value: string | string[]): void {
    if (typeof value === 'string' && value) {
      this.range.set(value);
    }
  }

  protected readonly shortDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  protected readonly longDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  protected readonly chartData = computed(() => {
    const days = Array.from({ length: 90 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (89 - index));
      return date.toISOString().slice(0, 10);
    });
    const totals = new Map(
      days.map((date) => [date, { date, stockIn: 0, stockOut: 0 }]),
    );

    for (const movement of this.movements()) {
      const day = new Date(movement.createdAt).toISOString().slice(0, 10);
      const row = totals.get(day);
      if (!row) continue;

      const quantity = Number(movement.quantityBase);
      if (movement.movementType === 'STOCK_IN') row.stockIn += quantity;
      if (movement.movementType === 'STOCK_OUT') row.stockOut += quantity;
    }

    return days.map((date) => totals.get(date)!);
  });
}
