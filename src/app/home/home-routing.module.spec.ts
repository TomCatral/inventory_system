import { DASHBOARD01_NAV_GROUPS } from '../shared/blocks/dashboard-01/dashboard-01-nav-main.component';
import { HOME_ROUTES } from './home-routing.module';

describe('Home sidebar routes', () => {
  it('provides an exact child route for every sidebar navigation item', () => {
    const homeRoute = HOME_ROUTES.find((route) => route.path === '');
    const configuredPaths = new Set(
      (homeRoute?.children ?? [])
        .map((route) => route.path)
        .filter((path): path is string => Boolean(path)),
    );
    const sidebarPaths = DASHBOARD01_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.route),
    );

    expect(configuredPaths.size).toBeGreaterThanOrEqual(sidebarPaths.length);
    for (const path of sidebarPaths) {
      expect(configuredPaths.has(path)).toBe(true);
    }
  });
});
