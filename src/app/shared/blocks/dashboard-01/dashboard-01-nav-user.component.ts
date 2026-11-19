import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEllipsisVertical, lucideLogOut, lucideUserCircle } from '@ng-icons/lucide';

import { AuthService } from '@/Auth/auth.service';
import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import type { ZardDropdownSide } from '@/shared/components/dropdown/dropdown-positions';
import { ZardDropdownImports } from '@/shared/components/dropdown/dropdown.imports';
import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';
import { ZardSidebarService } from '@/shared/components/sidebar/sidebar.service';

export interface Dashboard01User {
  readonly name: string;
  readonly email: string;
  readonly avatar: string;
}

@Component({
  selector: 'lib-dashboard-01-nav-user',
  standalone: true,
  imports: [...ZardSidebarImports, ...ZardDropdownImports, ZardAvatarComponent, NgIcon],
  viewProviders: [
    provideIcons({
      lucideEllipsisVertical,
      lucideLogOut,
      lucideUserCircle,
    }),
  ],
  templateUrl: './dashboard-01-nav-user.component.html',
  styleUrl: './dashboard-01-nav-user.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01NavUserComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidebar = inject(ZardSidebarService);
  /** shadcn opens these menus to the side of the sidebar on desktop and below the trigger on mobile. */
  protected readonly menuSide = computed<ZardDropdownSide>(() => (this.compact() || this.sidebar.isMobile() ? 'bottom' : 'right'));

  readonly user = input.required<Dashboard01User>();
  readonly compact = input(false);

  protected initials(): string {
    const parts = this.user().name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'PG';
    return parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  protected navigate(path: string): void {
    void this.router.navigateByUrl(path);
  }

  protected logout(): void {
    // Clear the local session synchronously, then sign out of PGC SSO on a
    // best-effort basis. The local sign-out must always succeed even when the
    // SSO logout endpoint is unreachable.
    this.auth.logout().subscribe();
    void this.router.navigateByUrl('/sign-in');
  }
}

