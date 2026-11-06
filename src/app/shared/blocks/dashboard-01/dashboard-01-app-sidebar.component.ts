import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@/Auth/auth.service';

import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

import {
  DASHBOARD01_NAV_GROUPS,
  Dashboard01NavMainComponent,
} from './dashboard-01-nav-main.component';
import { Dashboard01NavUserComponent, type Dashboard01User } from './dashboard-01-nav-user.component';

@Component({
  selector: 'lib-dashboard-01-app-sidebar',
  standalone: true,
  imports: [
    ...ZardSidebarImports,
    Dashboard01NavMainComponent,
    Dashboard01NavUserComponent,
    RouterLink,
  ],
  templateUrl: './dashboard-01-app-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01AppSidebarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly user = signal<Dashboard01User>({
    name: 'Loading profile…',
    email: this.roleEmail(),
    avatar: '',
  });

  protected readonly navGroups = computed(() =>
    DASHBOARD01_NAV_GROUPS.map((group) =>
      group.title === 'Setup'
        ? {
            ...group,
            items: group.items.filter(
              (item) =>
                item.route !== 'setup/user-roles' ||
                this.auth.inventoryRole() === 'SUPERADMIN',
            ),
          }
        : group,
    ),
  );

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (profile) => {
        const record = this.asRecord(profile);
        const user = this.asRecord(record?.['user']) ?? record;
        const name = this.readString(user, ['Full_name', 'fullName', 'name']) ||
          [
            this.readString(user, ['First_name', 'first_name', 'firstName']),
            this.readString(user, ['Last_name', 'last_name', 'lastName']),
          ].filter(Boolean).join(' ');
        this.user.update((current) => ({
          ...current,
          name: name || 'Name unavailable',
          email: this.roleEmail(),
        }));
      },
      error: () => {
        this.user.update((current) => ({
          ...current,
          name: 'Profile unavailable',
          email: this.roleEmail(),
        }));
      },
    });
  }

  private roleEmail(): string {
    const role = this.auth.inventoryRole()?.toLocaleLowerCase() ?? 'user';
    return `${role}@inventory.local`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private readString(
    record: Record<string, unknown> | null,
    keys: readonly string[],
  ): string {
    if (!record) return '';
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }
}
