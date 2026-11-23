import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  InventoryService,
  type EmployeeSearchResult,
  type InventoryRole,
  type InventoryRoleType,
} from '../services/inventory.service';
import { interval } from 'rxjs';
import {
  DASHBOARD01_ASSIGNABLE_NAV_GROUPS,
  type Dashboard01NavGroup,
} from '../shared/blocks/dashboard-01/dashboard-01-nav-main.component';


@Component({
  selector: 'app-inventory-roles-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './inventory-roles-page.component.html',
  styleUrl: './inventory-roles-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryRolesPageComponent implements OnInit, OnDestroy {
  private readonly inventory = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly roles = signal<InventoryRole[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');

  protected readonly employeeInputText = signal('');
  protected readonly showEmployeeDropdown = signal(false);
  protected readonly employeeSearchResults = signal<EmployeeSearchResult[]>([]);
  protected readonly selectedEmployee = signal<EmployeeSearchResult | null>(null);

  protected readonly filterQuery = signal('');
  protected readonly updatingId = signal<number | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly editPermissions = signal<readonly string[]>([]);

  protected readonly assignableGroups: readonly Dashboard01NavGroup[] =
    DASHBOARD01_ASSIGNABLE_NAV_GROUPS;
  protected readonly allPermissions: readonly string[] =
    DASHBOARD01_ASSIGNABLE_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.route),
    );
  protected readonly selectedPermissions = signal<readonly string[]>(
    this.allPermissions,
  );

  protected readonly roleOptions: {
    value: InventoryRoleType;
    label: string;
    short: string;
    activeClass: string;
  }[] = [
    {
      value: 'ADMIN',
      label: 'Administrator — selected features only',
      short: 'Admin',
      activeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    {
      value: 'SUPERADMIN',
      label: 'Superadmin — full access to everything',
      short: 'Super',
      activeClass: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    },
  ];

  protected readonly form = new FormGroup({
    employeeNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    roleType: new FormControl<InventoryRoleType>('ADMIN', { nonNullable: true }),
  });

  protected readonly superadminCount = computed(
    () => this.roles().filter((r) => r.roleType === 'SUPERADMIN').length,
  );
  protected readonly adminCount = computed(
    () => this.roles().filter((r) => r.roleType === 'ADMIN').length,
  );
  protected readonly assignableCount = this.allPermissions.length;

  protected readonly filteredRoles = computed(() => {
    const q = this.filterQuery().trim().toLowerCase();
    if (!q) return this.roles();
    return this.roles().filter(
      (r) =>
        r.employeeNumber.toLowerCase().includes(q) ||
        (r.employeeName || '').toLowerCase().includes(q) ||
        (r.departmentName || '').toLowerCase().includes(q) ||
        r.roleType.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.load();
    interval(5_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(true));
  }

  ngOnDestroy(): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
  }

  protected dismissMessage(): void {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    this.message.set('');
  }

  private showMessage(text: string): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.message.set(text);
    this.messageTimer = setTimeout(() => {
      this.message.set('');
      this.messageTimer = null;
    }, 3500);
  }


  protected onInputFocus(): void {
    if (this.employeeSearchResults().length > 0) {
      this.showEmployeeDropdown.set(true);
    }
  }

  protected onEmployeeInput(query: string): void {
    this.employeeInputText.set(query);
    this.form.controls.employeeNumber.setValue(query.trim());

    if (!query.trim()) {
      this.employeeSearchResults.set([]);
      this.showEmployeeDropdown.set(false);
      this.selectedEmployee.set(null);
      return;
    }

    this.inventory.searchEmployees(query).subscribe({
      next: (results) => {
        this.employeeSearchResults.set(results);
        this.showEmployeeDropdown.set(results.length > 0);
      },
      error: () => {
        this.employeeSearchResults.set([]);
        this.showEmployeeDropdown.set(false);
      },
    });
  }

  protected selectEmployee(emp: EmployeeSearchResult): void {
    this.selectedEmployee.set(emp);
    this.    employeeInputText.set(emp.employeeName);
    this.form.controls.employeeNumber.setValue(emp.employeeNumber);
    this.showEmployeeDropdown.set(false);
  }

  protected clearEmployeeSelection(): void {
    this.employeeInputText.set('');
    this.form.controls.employeeNumber.setValue('');
    this.selectedEmployee.set(null);
    this.employeeSearchResults.set([]);
    this.showEmployeeDropdown.set(false);
  }

  protected getInitials(name: string): string {
    if (!name) return 'PG';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  protected isPermissionSelected(route: string): boolean {
    return this.selectedPermissions().includes(route);
  }

  protected togglePermission(route: string): void {
    this.selectedPermissions.update((permissions) =>
      permissions.includes(route)
        ? permissions.filter((permission) => permission !== route)
        : [...permissions, route],
    );
  }

  protected toggleGroup(group: Dashboard01NavGroup): void {
    const routes = group.items.map((item) => item.route);
    const allSelected = routes.every((route) =>
      this.selectedPermissions().includes(route),
    );
    this.selectedPermissions.update((permissions) =>
      allSelected
        ? permissions.filter((permission) => !routes.includes(permission))
        : [...new Set([...permissions, ...routes])],
    );
  }

  protected selectAllPermissions(): void {
    this.selectedPermissions.set(this.allPermissions);
  }

  protected clearAllPermissions(): void {
    this.selectedPermissions.set([]);
  }

  protected isGroupSelected(group: Dashboard01NavGroup): boolean {
    return group.items.every((item) => this.isPermissionSelected(item.route));
  }

  protected accessSummary(role: InventoryRole): string {
    if (role.roleType === 'SUPERADMIN') return 'Full access to every feature';
    if (!role.permissions) return 'All features (legacy access)';
    return `${role.permissions.length} of ${this.assignableCount} features`;
  }

  protected startEdit(role: InventoryRole): void {
    this.editingId.set(role.id);
    this.editPermissions.set(
      role.permissions && role.permissions.length > 0
        ? role.permissions
        : this.allPermissions,
    );
    this.error.set('');
    this.message.set('');
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editPermissions.set([]);
  }

  protected isEditPermissionSelected(route: string): boolean {
    return this.editPermissions().includes(route);
  }

  protected toggleEditPermission(route: string): void {
    this.editPermissions.update((permissions) =>
      permissions.includes(route)
        ? permissions.filter((permission) => permission !== route)
        : [...permissions, route],
    );
  }

  protected toggleEditGroup(group: Dashboard01NavGroup): void {
    const routes = group.items.map((item) => item.route);
    const allSelected = routes.every((route) =>
      this.editPermissions().includes(route),
    );
    this.editPermissions.update((permissions) =>
      allSelected
        ? permissions.filter((permission) => !routes.includes(permission))
        : [...new Set([...permissions, ...routes])],
    );
  }

  protected isEditGroupSelected(group: Dashboard01NavGroup): boolean {
    return group.items.every((item) =>
      this.isEditPermissionSelected(item.route),
    );
  }

  protected saveEdit(role: InventoryRole): void {
    const permissions = [...this.editPermissions()];
    if (permissions.length === 0) {
      this.error.set('Select at least one feature for the administrator.');
      return;
    }
    this.error.set('');
    this.updatingId.set(role.id);
    this.inventory.updateRole(role.id, 'ADMIN', permissions).subscribe({
      next: () => {
        this.showMessage(
          `Feature access updated for ${role.employeeName || role.employeeNumber}.`,
        );
        this.updatingId.set(null);
        this.editingId.set(null);
        this.editPermissions.set([]);
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.updatingId.set(null);
      },
    });
  }

  protected add(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const employeeNumber = value.employeeNumber.trim();
    const roleType = value.roleType;
    const permissions =
      roleType === 'ADMIN' ? [...this.selectedPermissions()] : null;
    if (roleType === 'ADMIN' && (!permissions || permissions.length === 0)) {
      this.error.set('Select at least one feature for the administrator.');
      return;
    }
    const existing = this.roles().find(
      (role) => role.employeeNumber.trim() === employeeNumber,
    );
    const request = existing
      ? this.inventory.updateRole(existing.id, roleType, permissions)
      : this.inventory.createRole({ employeeNumber, roleType, permissions });
    this.saving.set(true);
    this.error.set('');
    request.subscribe({
      next: () => {
        const label = roleType === 'SUPERADMIN' ? 'Superadmin' : 'Administrator';
        const target = this.selectedEmployee()?.employeeName || employeeNumber;
        this.showMessage(
          existing
            ? `${label} access updated for ${target}.`
            : `${label} access granted to ${target}.`,
        );
        this.clearEmployeeSelection();
        this.form.controls.roleType.setValue('ADMIN');
        this.selectedPermissions.set(this.allPermissions);
        this.load();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.saving.set(false);
      },
    });
  }

  protected setRole(role: InventoryRole, value: InventoryRoleType): void {
    if (role.roleType === value || this.updatingId() === role.id) return;
    const permissions =
      value === 'ADMIN'
        ? role.permissions && role.permissions.length > 0
          ? role.permissions
          : this.allPermissions
        : null;
    this.error.set('');
    this.updatingId.set(role.id);
    this.inventory.updateRole(role.id, value, permissions).subscribe({
      next: () => {
        const label = this.roleOptions.find((o) => o.value === value)?.short ?? value;
        this.showMessage(
          `${role.employeeName || role.employeeNumber} is now ${label}. Access updated.`,
        );
        this.updatingId.set(null);
        this.editingId.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(this.getError(error));
        this.updatingId.set(null);
      },
    });
  }

  protected remove(role: InventoryRole): void {
    const targetName = role.employeeName || role.employeeNumber;
    if (!window.confirm(`Are you sure you want to remove Inventory System access for ${targetName}?`)) {
      return;
    }
    this.error.set('');
    this.inventory.deleteRole(role.id).subscribe({
      next: () => {
        this.showMessage(`Inventory access removed for ${targetName}.`);
        this.load();
      },
      error: (error: unknown) => this.error.set(this.getError(error)),
    });
  }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.inventory.listRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        if (!silent) this.loading.set(false);
      },
      error: (error: unknown) => {
        if (!silent) this.error.set(this.getError(error));
        if (!silent) this.loading.set(false);
      },
    });
  }


  private getError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      return Array.isArray(message)
        ? message.join(' ')
        : typeof message === 'string'
          ? message
          : error.status === 0
            ? 'Could not connect to the inventory service.'
            : `Inventory request failed (${error.status}).`;
    }
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}

