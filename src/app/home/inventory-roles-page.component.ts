import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  StockInService,
  type InventoryRole,
  type InventoryRoleType,
} from './stock-in.service';

@Component({
  selector: 'app-inventory-roles-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="mx-auto w-full max-w-5xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Setup</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">User roles</h1>
        <p class="text-muted-foreground mt-1 text-sm">Only employee numbers assigned here can access the inventory system.</p>
      </header>
      @if (message()) { <p role="status" class="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{{ message() }}</p> }
      @if (error()) { <p role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{{ error() }}</p> }

      <form [formGroup]="form" (ngSubmit)="add()" class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_14rem_auto]">
        <label class="grid gap-2 text-sm font-medium">Employee number
          <input formControlName="employeeNumber" maxlength="32" required class="h-11 rounded-lg border bg-background px-3 font-normal" placeholder="Enter SSO employee number" />
        </label>
        <label class="grid gap-2 text-sm font-medium">Role
          <select formControlName="roleType" class="h-11 rounded-lg border bg-background px-3 font-normal">
            <option value="USER">User</option><option value="ADMIN">Admin</option><option value="SUPERADMIN">Superadmin</option>
          </select>
        </label>
        <div class="flex items-end"><button type="submit" [disabled]="saving()" class="app-button app-button-primary">Assign role</button></div>
      </form>

      <section class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div class="border-b px-5 py-4"><h2 class="font-semibold">Authorized employees</h2></div>
        @if (loading()) { <p class="text-muted-foreground p-6 text-sm">Loading role assignments…</p> }
        @else if (roles().length === 0) { <p class="text-muted-foreground p-6 text-sm">No role assignments found.</p> }
        @else {
          <div class="app-table-scroll">
            <table class="app-data-table min-w-[600px] text-left text-sm">
              <thead class="bg-muted/60 text-muted-foreground"><tr><th class="px-5 py-3 font-medium">Employee number</th><th class="px-5 py-3 font-medium">Role</th><th class="px-5 py-3 text-right font-medium">Actions</th></tr></thead>
              <tbody class="divide-y">
                @for (role of roles(); track role.id) {
                  <tr>
                    <td class="px-5 py-3 font-mono">{{ role.employeeNumber }}</td>
                    <td class="px-5 py-3">
                      <select [value]="role.roleType" (change)="changeRoleFromEvent(role, $event)" class="h-9 rounded-md border bg-background px-2">
                        <option value="USER">User</option><option value="ADMIN">Admin</option><option value="SUPERADMIN">Superadmin</option>
                      </select>
                    </td>
                    <td class="whitespace-nowrap px-5 py-3 text-right"><button type="button" (click)="remove(role)" class="app-button app-button-danger app-button-sm">Remove access</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryRolesPageComponent implements OnInit {
  private readonly inventory = inject(StockInService);
  protected readonly roles = signal<InventoryRole[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly form = new FormGroup({
    employeeNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    roleType: new FormControl<InventoryRoleType>('USER', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  protected add(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    this.inventory.createRole({
      employeeNumber: value.employeeNumber.trim(),
      roleType: value.roleType,
    }).subscribe({
      next: () => {
        this.message.set('Role assigned.');
        this.form.controls.employeeNumber.reset('');
        this.load();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.saving.set(false);
      },
    });
  }

  protected changeRole(role: InventoryRole, value: string): void {
    if (value !== 'USER' && value !== 'ADMIN' && value !== 'SUPERADMIN') return;
    if (role.roleType === value) return;
    this.inventory.updateRole(role.id, value).subscribe({
      next: () => {
        this.message.set(`Role updated for ${role.employeeNumber}.`);
        this.load();
      },
      error: (error: unknown) => this.error.set(this.getError(error)),
    });
  }

  protected changeRoleFromEvent(role: InventoryRole, event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      this.changeRole(role, event.target.value);
    }
  }

  protected remove(role: InventoryRole): void {
    this.error.set('');
    this.inventory.deleteRole(role.id).subscribe({
      next: () => {
        this.message.set(`Inventory access removed for ${role.employeeNumber}.`);
        this.load();
      },
      error: (error: unknown) => this.error.set(this.getError(error)),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.inventory.listRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.loading.set(false);
      },
    });
  }

  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return Array.isArray(message) ? message.join(' ') :
        typeof message === 'string' ? message :
          error.status === 0 ? 'Could not connect to the inventory service.' :
            `Role request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}
