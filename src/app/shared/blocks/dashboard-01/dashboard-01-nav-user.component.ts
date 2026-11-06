import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideEllipsisVertical, lucideLogOut, lucideSettings, lucideUserCircle } from '@ng-icons/lucide';

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
      lucideBell,
      lucideEllipsisVertical,
      lucideLogOut,
      lucideSettings,
      lucideUserCircle,
    }),
  ],
  templateUrl: './dashboard-01-nav-user.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01NavUserComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidebar = inject(ZardSidebarService);
  /** shadcn opens these menus to the side of the sidebar on desktop and below the trigger on mobile. */
  protected readonly menuSide = computed<ZardDropdownSide>(() => (this.sidebar.isMobile() ? 'bottom' : 'right'));

  readonly user = input.required<Dashboard01User>();

  protected navigate(path: string): void {
    void this.router.navigateByUrl(path);
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/sign-in'),
      error: () =>
        void this.router.navigate(['/sign-in'], {
          queryParams: { logout: 'failed' },
        }),
    });
  }
}
