import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomePage } from './home.page';
import { InventorySectionPageComponent } from './inventory-section-page.component';
import { StockInPageComponent } from './stock-in-page.component';
import { StockOutPageComponent } from './stock-out-page.component';
import { ItemSetupPageComponent } from './item-setup-page.component';
import { InventoryRolesPageComponent } from './inventory-roles-page.component';
import { InventoryWorkflowPageComponent } from './inventory-workflow-page.component';
import { InventoryReportPageComponent } from './inventory-report-page.component';
import { AccountPageComponent } from './account-page.component';
import { SettingsPageComponent } from './settings-page.component';
import { NotificationsPageComponent } from './notifications-page.component';
import { Dashboard01OverviewComponent } from '../shared/blocks/dashboard-01/dashboard-01-overview.component';
import { DASHBOARD01_NAV_GROUPS } from '../shared/blocks/dashboard-01/dashboard-01-nav-main.component';
import { superadminGuard } from '../Auth/superadmin.guard';

const routes: Routes = [
  {
    path: '',
    component: HomePage,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: Dashboard01OverviewComponent,
      },
      { path: 'account', component: AccountPageComponent },
      { path: 'settings', component: SettingsPageComponent },
      { path: 'notifications', component: NotificationsPageComponent },
      ...DASHBOARD01_NAV_GROUPS.map((group) => ({
        path: group.title.toLocaleLowerCase(),
        children: group.items.map((item) => {
          const routeName = item.route.split('/').at(-1) ?? '';
          const route = {
            path: routeName,
            component:
              item.route === 'transactions/stock-in'
                ? StockInPageComponent
                : item.route === 'transactions/stock-out'
                  ? StockOutPageComponent
                  : item.route === 'setup/items'
                    ? ItemSetupPageComponent
                    : item.route === 'setup/user-roles'
                      ? InventoryRolesPageComponent
                      : group.title === 'Transactions'
                        ? InventoryWorkflowPageComponent
                        : group.title === 'Reports'
                          ? InventoryReportPageComponent
                          : InventorySectionPageComponent,
            data: {
              title: item.title,
              section: group.title,
              ...(group.title === 'Transactions'
                ? {
                    workflow:
                      routeName === 'return-of-items'
                        ? 'return'
                        : routeName === 'stock-adjustment'
                          ? 'adjustment'
                          : routeName === 'physical-inventory'
                            ? 'physical-count'
                            : 'history',
                  }
                : {}),
              ...(group.title === 'Reports'
                ? {
                    report:
                      routeName === 'inventory-summary'
                        ? 'summary'
                        : routeName,
                  }
                : {}),
            },
          };
          return item.route === 'setup/user-roles'
            ? { ...route, canActivate: [superadminGuard] }
            : route;
        }),
      })),
    ],
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomePageRoutingModule {}
