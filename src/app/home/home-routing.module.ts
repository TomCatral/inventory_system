import { NgModule, Type } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomePage } from './home.page';
import { DASHBOARD01_NAV_GROUPS } from '../shared/blocks/dashboard-01/dashboard-01-nav-main.component';
import { superadminGuard } from '../Auth/superadmin.guard';
import { adminGuard } from '../Auth/admin.guard';

type PageLoader = () => Promise<Type<unknown>>;

const PAGE_LOADERS: Record<string, PageLoader> = {
  'transactions/stock-in': () => import('../stock-in/stock-in-page.component').then((module) => module.StockInPageComponent),
  'reports/inventory-summary': () => import('../stock-in/stock-in-page.component').then((module) => module.StockInPageComponent),
  'transactions/stock-out': () => import('../stock-out/stock-out-page.component').then((module) => module.StockOutPageComponent),
  'transactions/request-supply': () => import('../stock-request/stock-request-page.component').then((module) => module.StockRequestPageComponent),
  'transactions/manage-requests': () => import('../admin-requests/admin-requests-page.component').then((module) => module.AdminRequestsPageComponent),
  'transactions/my-supplies': () => import('../my-supplies/my-supplies-page.component').then((module) => module.MySuppliesPageComponent),
  'transactions/borrowed-supply': () => import('../borrowed-supply/borrowed-supply-page.component').then((module) => module.BorrowedSupplyPageComponent),
  'notifications': () => import('../notifications/notifications-page.component').then((module) => module.NotificationsPageComponent),
  'setup/items': () => import('../items/item-setup-page.component').then((module) => module.ItemSetupPageComponent),
  'setup/user-roles': () => import('../user-roles/inventory-roles-page.component').then((module) => module.InventoryRolesPageComponent),
};

const WORKFLOW_KIND: Record<string, 'return'> = {
  'transactions/return-of-items': 'return',
};

function loaderFor(route: string): PageLoader {
  if (PAGE_LOADERS[route]) {
    return PAGE_LOADERS[route];
  }
  if (route.startsWith('reports/')) {
    return () => import('../reports/inventory-report-page.component').then((module) => module.InventoryReportPageComponent);
  }
  if (WORKFLOW_KIND[route]) {
    return () => import('../workflow/inventory-workflow-page.component').then((module) => module.InventoryWorkflowPageComponent);
  }
  throw new Error(`No page component configured for ${route}.`);
}

export const HOME_ROUTES: Routes = [
  {
    path: '',
    component: HomePage,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('../shared/blocks/dashboard-01/dashboard-01-overview.component').then((module) => module.Dashboard01OverviewComponent),
      },
      { path: 'account', loadComponent: () => import('../account/account-page.component').then((module) => module.AccountPageComponent) },
      { path: 'notifications', loadComponent: () => import('../notifications/notifications-page.component').then((module) => module.NotificationsPageComponent) },
      ...DASHBOARD01_NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => {
          const routeName = item.route.split('/').at(-1) ?? '';
          const route = {
            // Keep the route identical to the sidebar routerLink. Group titles
            // are display labels and must never be used as URL segments.
            path: item.route,
            loadComponent: loaderFor(item.route),
            data: {
              title: item.title,
              section: group.title,
              ...(WORKFLOW_KIND[item.route]
                ? { workflow: WORKFLOW_KIND[item.route] }
                : {}),
              ...(item.route.startsWith('reports/')
                ? {
                    report:
                      routeName === 'inventory-summary' ? 'summary' : routeName,
                  }
                : {}),
              ...(item.route === 'reports/inventory-summary'
                ? { stockOnHandOnly: true }
                : {}),
            },
          };
          if (item.route === 'setup/user-roles') {
            return { ...route, canActivate: [superadminGuard] };
          }
          // Staff (USER) can open My Supplies, Request Supply, and Borrowed Supplies.
          // Reports and every other management/setup screen are restricted to admins.
          if (
            item.route !== 'transactions/my-supplies' &&
            item.route !== 'transactions/request-supply' &&
            item.route !== 'transactions/borrowed-supply'
          ) {
            return { ...route, canActivate: [adminGuard] };
          }
          return route;
        }),
      ),
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(HOME_ROUTES)],
  exports: [RouterModule],
})
export class HomePageRoutingModule {}
