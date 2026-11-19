import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../Auth/auth.service';

interface AccountProfile {
  readonly employeeNumber: string;
  readonly name: string;
  readonly division: string;
  readonly divisionDescription: string;
}

@Component({
  selector: 'app-account-page',
  standalone: true,
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly profile = signal<AccountProfile | null>(null);

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (response) => {
        this.profile.set(this.readProfile(response));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'PG';
  }

  private readProfile(value: unknown): AccountProfile {
    const root = this.asRecord(value);
    const nested = root && this.asRecord(root['user']);
    const record = nested ?? root ?? {};
    return {
      employeeNumber: this.readString(record, ['emp_no', 'employeeNumber', 'Employee_number']),
      name: this.readString(record, ['Full_name', 'fullName', 'name']) ||
        [this.readString(record, ['First_name', 'first_name', 'firstName']), this.readString(record, ['Last_name', 'last_name', 'lastName'])]
          .filter(Boolean)
          .join(' '),
      division: this.readString(record, ['Division', 'division']),
      divisionDescription: this.readString(record, ['DivDesc', 'divisionDescription', 'division_description']),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private readString(record: Record<string, unknown>, keys: readonly string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return typeof message === 'string' ? message : `Unable to load account information (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unable to load account information.';
  }
}

