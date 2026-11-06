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
  template: `
    <section class="mx-auto w-full max-w-4xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Profile</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">Account</h1>
        <p class="text-muted-foreground mt-1 text-sm">Your account details come from PGC SSO.</p>
      </header>

      @if (error()) {
        <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p>
      } @else if (loading()) {
        <section class="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading your account…</section>
      } @else if (profile(); as account) {
        <section class="rounded-xl border bg-card p-5 shadow-sm md:p-7">
          <h2 class="font-semibold">Profile details</h2>
          <dl class="mt-5 grid gap-5 sm:grid-cols-2">
            <div><dt class="text-muted-foreground text-sm">Employee number</dt><dd class="mt-1 font-medium">{{ account.employeeNumber || 'Not provided by SSO' }}</dd></div>
            <div><dt class="text-muted-foreground text-sm">Full name</dt><dd class="mt-1 font-medium">{{ account.name || 'Not provided by SSO' }}</dd></div>
            <div><dt class="text-muted-foreground text-sm">Division</dt><dd class="mt-1 font-medium">{{ account.division || 'Not provided by SSO' }}</dd></div>
            <div><dt class="text-muted-foreground text-sm">Division description</dt><dd class="mt-1 font-medium">{{ account.divisionDescription || 'Not provided by SSO' }}</dd></div>
          </dl>
          <p class="text-muted-foreground mt-6 border-t pt-4 text-xs">To update these details, contact your PGC SSO administrator.</p>
        </section>
      }
    </section>
  `,
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
