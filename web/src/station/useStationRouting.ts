import { useEffect } from 'react';
import type { AuthStatus } from '../auth/types';
import {
ROUTE_PREFIX,
getStationPath,
isChangePasswordPathname,
isStationAppPath
} from '../routing';
import { getStationDisplayName } from './scoreReview';

export function useStationRouting(status: AuthStatus) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const pathname = window.location.pathname;
    const search = window.location.search ?? '';
    const hash = window.location.hash ?? '';

    if (status.state === 'authenticated') {
      if (isChangePasswordPathname(pathname)) {
        return;
      }
      const station = status.manifest.station;
      const stationDisplayName = getStationDisplayName(station.name, station.code);
      if (!stationDisplayName) {
        return;
      }

      const canonicalPath = getStationPath(stationDisplayName);

      if (pathname !== canonicalPath) {
        window.history.replaceState(window.history.state, '', `${canonicalPath}${search}${hash}`);
      }
      return;
    }

    if (
      status.state === 'unauthenticated' ||
      status.state === 'locked' ||
      status.state === 'password-change-required' ||
      status.state === 'error'
    ) {
      if (isStationAppPath(pathname) || isChangePasswordPathname(pathname)) {
        window.history.replaceState(window.history.state, '', ROUTE_PREFIX);
      }
    }
  }, [status]);
}
