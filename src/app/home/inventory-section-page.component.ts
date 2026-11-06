import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-inventory-section-page',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (route.data | async; as page) {
      <section class="px-4 lg:px-6" [attr.aria-labelledby]="'inventory-page-title'">
        <p class="text-muted-foreground text-sm">{{ page['section'] }}</p>
        <h1 id="inventory-page-title" class="mt-1 text-2xl font-semibold tracking-tight">
          {{ page['title'] }}
        </h1>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventorySectionPageComponent {
  protected readonly route = inject(ActivatedRoute);
}
