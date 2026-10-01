import {
DESKOVKY_ADMIN_ROUTE,
DESKOVKY_MATCH_NEW_ROUTE,
DESKOVKY_ROUTE_PREFIX,
DESKOVKY_RULES_ROUTE,
DESKOVKY_STANDINGS_ROUTE,
LEGACY_DESKOVKY_ROUTE_PREFIX,
} from '../../routing';
import { DeskovkyPage } from './pageTypes';

export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function buildCanonicalPath(page: DeskovkyPage): string {
  switch (page) {
    case 'new-match':
      return DESKOVKY_MATCH_NEW_ROUTE;
    case 'standings':
      return DESKOVKY_STANDINGS_ROUTE;
    case 'rules':
      return DESKOVKY_RULES_ROUTE;
    case 'admin':
      return DESKOVKY_ADMIN_ROUTE;
    default:
      return DESKOVKY_ROUTE_PREFIX;
  }
}

export function resolvePage(pathname: string): DeskovkyPage {
  const path = normalizePath(pathname);

  if (
    path === DESKOVKY_ADMIN_ROUTE ||
    path === `${LEGACY_DESKOVKY_ROUTE_PREFIX}/admin` ||
    path.endsWith('/deskovky/admin')
  ) {
    return 'admin';
  }
  if (
    path === DESKOVKY_MATCH_NEW_ROUTE ||
    path === `${LEGACY_DESKOVKY_ROUTE_PREFIX}/match/new` ||
    path.endsWith('/deskovky/match/new')
  ) {
    return 'new-match';
  }
  if (
    path === DESKOVKY_STANDINGS_ROUTE ||
    path === `${LEGACY_DESKOVKY_ROUTE_PREFIX}/standings` ||
    path.endsWith('/deskovky/standings')
  ) {
    return 'standings';
  }
  if (
    path === DESKOVKY_RULES_ROUTE ||
    path === `${LEGACY_DESKOVKY_ROUTE_PREFIX}/pravidla` ||
    path.endsWith('/deskovky/pravidla')
  ) {
    return 'rules';
  }
  return 'home';
}

export function resolveAllowedPage(page: DeskovkyPage, isAdmin: boolean): DeskovkyPage {
  if (!isAdmin) {
    if (page === 'admin' || page === 'standings') {
      return 'home';
    }
    return page;
  }
  if (page === 'home' || page === 'new-match') {
    return 'admin';
  }
  return page;
}
