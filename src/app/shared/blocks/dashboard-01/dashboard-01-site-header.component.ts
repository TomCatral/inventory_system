import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ZardSeparatorComponent } from '@/shared/components/separator/separator.component';
import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';

@Component({
  selector: 'lib-dashboard-01-site-header',
  standalone: true,
  imports: [...ZardSidebarImports, ZardSeparatorComponent],
  templateUrl: './dashboard-01-site-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class Dashboard01SiteHeaderComponent {}
