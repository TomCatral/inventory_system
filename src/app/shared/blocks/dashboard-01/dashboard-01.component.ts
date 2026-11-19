import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

import { Dashboard01AppSidebarComponent } from './dashboard-01-app-sidebar.component';
import { Dashboard01SiteHeaderComponent } from './dashboard-01-site-header.component';

@Component({
  selector: 'lib-dashboard-01',
  standalone: true,
  imports: [
    ...ZardSidebarImports,
    RouterOutlet,
    Dashboard01AppSidebarComponent,
    Dashboard01SiteHeaderComponent,
  ],
  templateUrl: './dashboard-01.component.html',
  styleUrl: './dashboard-01.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard01Component {}

