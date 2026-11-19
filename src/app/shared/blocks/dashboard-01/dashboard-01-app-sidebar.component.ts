import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@/Auth/auth.service';

import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

import {
  DASHBOARD01_NAV_GROUPS,
  Dashboard01NavMainComponent,
} from './dashboard-01-nav-main.component';

@Component({
  selector: 'lib-dashboard-01-app-sidebar',
  standalone: true,
  imports: [
    ...ZardSidebarImports,
    Dashboard01NavMainComponent,
    RouterLink,
  ],
  templateUrl: './dashboard-01-app-sidebar.component.html',
  styleUrl: './dashboard-01-app-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01AppSidebarComponent {
  private readonly auth = inject(AuthService);

  protected readonly navGroups = computed(() => {
    return DASHBOARD01_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => this.auth.canAccessRoute(item.route)),
    })).filter((group) => group.items.length > 0);
  });

  constructor() {
    // Refresh the SSO profile whenever the session changes so a different
    // employee never sees the previous user's name after signing in.
    effect(() => {
      this.auth.sessionVersion();
      untracked(() => this.auth.refreshProfile().subscribe());
    });
  }

}
