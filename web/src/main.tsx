import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './auth/fetch';
import { AuthProvider } from './auth/context';
import ErrorBoundary from './components/ErrorBoundary';
import AppErrorScreen from './components/AppErrorScreen';
import { registerSW } from 'virtual:pwa-register';
import {
  DESKOVKY_ROUTE_PREFIX,
  FORGOT_PASSWORD_ROUTE,
  LEGACY_FORGOT_PASSWORD_ROUTE,
  LEGACY_FORGOT_PASSWORD_ROUTE_ALT,
  LEGACY_ROUTE_PREFIX,
  MAPA_PROCHODU_ROUTE,
  ROUTE_PREFIX,
  isChangePasswordPathname,
  isAdminPathname,
  isDeskovkyPathname,
  isSetonMapAdminPathname,
  isSetonMapPathname,
  isScoreboardPathname,
  isStationAppPath,
} from './routing';

import { DEFAULT_SEO, ROUTE_SEO, SITE_URL } from './seo/routeSeo';

type IconLinkConfig = {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
};

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
};

const ICON_LINKS: IconLinkConfig[] = [
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: '/favicon-32.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '192x192',
    href: '/icon-192.png',
  },
  {
    rel: 'shortcut icon',
    type: 'image/png',
    sizes: '32x32',
    href: '/favicon-32.png',
  },
  {
    rel: 'apple-touch-icon',
    sizes: '180x180',
    href: '/apple-touch-icon.png',
  },
];

function absoluteUrl(pathname: string) {
  return `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
}

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = create();
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertMetaName(name: string, content: string) {
  upsertMeta(
    `meta[name='${name}']`,
    () => {
      const meta = document.createElement('meta');
      meta.name = name;
      return meta;
    },
    content,
  );
}

function upsertMetaProperty(property: string, content: string) {
  upsertMeta(
    `meta[property='${property}']`,
    () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', property);
      return meta;
    },
    content,
  );
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function upsertIconLink(config: IconLinkConfig) {
  const { rel, href, sizes, type } = config;
  let selector = `link[rel='${rel}']`;
  if (sizes) {
    selector += `[sizes='${sizes}']`;
  }

  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (sizes) {
      link.sizes = sizes;
    }
    document.head.appendChild(link);
  }

  if (type) {
    link.type = type;
  } else {
    link.removeAttribute('type');
  }

  if (sizes) {
    link.sizes = sizes;
  } else {
    link.removeAttribute('sizes');
  }

  link.href = href;
}

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isPrivateOrDuplicatePath(pathname: string) {
  if (
    isAdminPathname(pathname) ||
    isSetonMapAdminPathname(pathname) ||
    isStationAppPath(pathname) ||
    isChangePasswordPathname(pathname)
  ) {
    return true;
  }
  return (
    pathname === ROUTE_PREFIX ||
    pathname.startsWith(`${ROUTE_PREFIX}/stanoviste`) ||
    pathname.startsWith(`${ROUTE_PREFIX}/station`) ||
    pathname.startsWith(`${ROUTE_PREFIX}/admin`) ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/redakce') ||
    pathname.startsWith('/stanoviste') ||
    pathname.startsWith('/stations') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/scoreboard') ||
    pathname.startsWith('/vysledky')
  );
}

function resolveSeo(pathname: string): SeoConfig {
  const normalizedPathname = normalizePathname(pathname);
  const canonicalPath = normalizedPathname === '/zelena-liga' ? '/aktualni-poradi' : normalizedPathname;
  const direct = ROUTE_SEO[canonicalPath];
  if (direct) {
    return {
      ...direct,
      canonicalPath,
      robots: isPrivateOrDuplicatePath(normalizedPathname) ? 'noindex,nofollow' : 'index,follow',
    };
  }
  if (canonicalPath.startsWith('/clanky/')) {
    return {
      title: 'Článek | Zelená liga',
      description: 'Článek a novinky ze soutěží Zelené ligy.',
      canonicalPath,
      robots: 'index,follow',
    };
  }
  if (canonicalPath.startsWith('/fotogalerie/')) {
    return {
      title: 'Fotogalerie | Zelená liga',
      description: 'Album fotografií ze soutěží a akcí Zelené ligy.',
      canonicalPath,
      robots: 'index,follow',
    };
  }
  if (canonicalPath.startsWith('/oddily/')) {
    return {
      title: 'Oddíl SPTO | Zelená liga',
      description: 'Profil oddílu zapojeného do Zelené ligy a SPTO Brno.',
      canonicalPath,
      robots: 'index,follow',
    };
  }
  return {
    ...DEFAULT_SEO,
    canonicalPath,
    robots: isPrivateOrDuplicatePath(normalizedPathname) ? 'noindex,nofollow' : 'index,follow',
  };
}

function applyBranding(pathname: string) {
  const seo = resolveSeo(pathname);
  if (document.title !== seo.title) {
    document.title = seo.title;
  }

  const canonicalUrl = absoluteUrl(seo.canonicalPath);
  upsertCanonical(canonicalUrl);
  upsertMetaName('description', seo.description);
  upsertMetaName('robots', seo.robots);
  upsertMetaProperty('og:title', seo.title);
  upsertMetaProperty('og:description', seo.description);
  upsertMetaProperty('og:url', canonicalUrl);
  ICON_LINKS.forEach(upsertIconLink);
}

async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return;
  }

  const storageManager = navigator.storage;
  if (typeof storageManager.persist !== 'function') {
    return;
  }

  try {
    const alreadyPersisted =
      typeof storageManager.persisted === 'function' ? await storageManager.persisted() : false;
    if (alreadyPersisted) {
      return;
    }
    await storageManager.persist();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('[storage] persistent storage request failed', error);
    }
  }
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
void requestPersistentStorage();

const params = new URLSearchParams(window.location.search);
const view = params.get('view');
const pathname = window.location.pathname;
const normalizedPath = pathname.replace(/\/$/, '') || '/';
applyBranding(normalizedPath);
const isScoreboardPath = isScoreboardPathname(pathname);
const isAdminPath = isAdminPathname(pathname);
const isSetonMapPath = isSetonMapPathname(pathname);
const isSetonMapAdminPath = isSetonMapAdminPathname(pathname);
const isHomepagePath = normalizedPath === '/';
const isDeskovkyPath = isDeskovkyPathname(pathname);
const isChangePasswordPath = isChangePasswordPathname(normalizedPath);
const isScoringNamespace =
  normalizedPath === ROUTE_PREFIX ||
  normalizedPath.startsWith(`${ROUTE_PREFIX}/`) ||
  normalizedPath === LEGACY_ROUTE_PREFIX ||
  normalizedPath.startsWith(`${LEGACY_ROUTE_PREFIX}/`) ||
  isStationAppPath(normalizedPath) ||
  isChangePasswordPath;
const scoreboardViews = new Set(['scoreboard', 'vysledky']);
const forgotPasswordViews = new Set(['zapomenute-heslo', 'forgot-password']);
const forgotPasswordPathnames = new Set([
  FORGOT_PASSWORD_ROUTE,
  LEGACY_FORGOT_PASSWORD_ROUTE,
  LEGACY_FORGOT_PASSWORD_ROUTE_ALT,
  '/zapomenute-heslo',
]);
const resetPasswordPathnames = new Set([
  '/auth/reset-password',
  '/auth/recovery',
  '/reset-password',
]);

function render(element: React.ReactNode) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>{element}</AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// Když se nepodaří stáhnout chunk (výpadek sítě nebo zrovna běžící deploy), ať místo bílé stránky zůstane chybová.
function renderLoadFailure(what: string, error: unknown) {
  console.error(`Failed to load ${what}`, error);
  root.render(
    <React.StrictMode>
      <AppErrorScreen
        title="Stránku se nepodařilo načíst"
        description="Nepovedlo se stáhnout část aplikace. Může za to výpadek připojení nebo právě nasazovaná nová verze webu."
        detail={error instanceof Error && error.message ? error.message : null}
      />
    </React.StrictMode>,
  );
}

if (isSetonMapAdminPath) {
  import('./liveMap/SetonMapAdminApp')
    .then(({ default: SetonMapAdminApp }) => {
      render(<SetonMapAdminApp />);
    })
    .catch((error) => {
      renderLoadFailure('seton map admin view', error);
    });
} else if (isSetonMapPath || normalizedPath === MAPA_PROCHODU_ROUTE) {
  import('./liveMap/SetonLiveMapApp')
    .then(({ default: SetonLiveMapApp }) => {
      render(<SetonLiveMapApp />);
    })
    .catch((error) => {
      renderLoadFailure('seton live map view', error);
    });
} else if (isAdminPath) {
  import('./admin/AdminApp')
    .then(({ default: AdminApp }) => {
      render(<AdminApp />);
    })
    .catch((error) => {
      renderLoadFailure('admin view', error);
    });
} else if (isDeskovkyPath || normalizedPath === DESKOVKY_ROUTE_PREFIX) {
  import('./features/deskovky/DeskovkyApp')
    .then(({ default: DeskovkyApp }) => {
      render(<DeskovkyApp />);
    })
    .catch((error) => {
      renderLoadFailure('deskovky app', error);
    });
} else if (
  (view && forgotPasswordViews.has(view)) ||
  forgotPasswordPathnames.has(normalizedPath)
) {
  import('./auth/ForgotPasswordScreen')
    .then(({ default: ForgotPasswordScreen }) => {
      render(<ForgotPasswordScreen />);
    })
    .catch((error) => {
      renderLoadFailure('forgot password view', error);
    });
} else if (resetPasswordPathnames.has(normalizedPath)) {
  const target = `${ROUTE_PREFIX}?reset=1`;
  if (`${normalizedPath}${window.location.search}` !== target) {
    window.history.replaceState(window.history.state, '', target);
  }
  import('./App')
    .then(({ default: App }) => {
      render(<App />);
    })
    .catch((error) => {
      renderLoadFailure('scoring app', error);
    });
} else if ((view && scoreboardViews.has(view)) || isScoreboardPath) {
  import('./scoreboard/ScoreboardApp')
    .then(({ default: ScoreboardApp }) => {
      render(<ScoreboardApp />);
    })
    .catch((error) => {
      renderLoadFailure('scoreboard view', error);
    });
} else if (isHomepagePath && !isScoringNamespace) {
  import('./homepage/Homepage')
    .then(({ default: Homepage }) => {
      render(<Homepage />);
    })
    .catch((error) => {
      renderLoadFailure('homepage', error);
    });
} else if (isScoringNamespace || normalizedPath === ROUTE_PREFIX) {
  import('./App')
    .then(({ default: App }) => {
      render(<App />);
    })
    .catch((error) => {
      renderLoadFailure('scoring app', error);
    });
} else {
  import('./homepage/Homepage')
    .then(({ default: Homepage }) => {
      render(<Homepage />);
    })
    .catch((error) => {
      renderLoadFailure('homepage', error);
    });
}
