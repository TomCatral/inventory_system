import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import {
  InventoryService,
  type EmployeeSearchResult,
} from '../../../services/inventory.service';

@Component({
  selector: 'app-employee-picker',
  standalone: true,
  templateUrl: './employee-picker.component.html',
  styleUrl: './employee-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeePickerComponent {
  private readonly inventory = inject(InventoryService);

  readonly placeholder = input('Search staff by name');
  readonly value = model<EmployeeSearchResult | null>(null);

  protected readonly query = signal('');
  protected readonly results = signal<EmployeeSearchResult[]>([]);
  protected readonly open = signal(false);
  protected readonly searching = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;

  protected onInput(text: string): void {
    this.query.set(text);
    if (this.value()) {
      this.value.set(null);
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const term = text.trim();
    if (!term) {
      this.results.set([]);
      this.open.set(false);
      return;
    }
    this.timer = setTimeout(() => this.search(term), 250);
  }

  protected onFocus(): void {
    if (this.results().length > 0) {
      this.open.set(true);
    }
  }

  protected onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  protected choose(employee: EmployeeSearchResult): void {
    this.value.set(employee);
    this.query.set('');
    this.results.set([]);
    this.open.set(false);
  }

  protected clear(): void {
    this.value.set(null);
    this.query.set('');
    this.results.set([]);
    this.open.set(false);
  }

  private search(term: string): void {
    this.searching.set(true);
    this.inventory.listIssuanceRecipients(term).subscribe({
      next: (employees) => {
        this.results.set(employees);
        this.open.set(true);
        this.searching.set(false);
      },
      error: () => {
        this.results.set([]);
        this.open.set(false);
        this.searching.set(false);
      },
    });
  }
}
