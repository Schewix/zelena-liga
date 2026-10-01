import { useCallback,useEffect,useMemo,useState } from 'react';
import AppFooter from '../../components/AppFooter';
import { AdminPage } from './admin/AdminPage';
import { ErrorState,LoadingState } from './components/PageState';
import { RulesLinks } from './components/RulesLinks';
import { loadJudgeContext } from './data';
import { buildCanonicalPath,resolveAllowedPage,resolvePage } from './navigation';
import { AssignedTableMatchesPage } from './pages/AssignedTableMatchesPage';
import { JudgeHomePage } from './pages/JudgeHomePage';
import { StandingsPage } from './pages/StandingsPage';
import { AuthenticatedState,DeskovkyPage } from './pageTypes';
import type {
BoardJudgeContext
} from './types';
import { useIsMobileBreakpoint } from './useIsMobileBreakpoint';

export function DeskovkyDashboard({
  auth,
  logout,
}: {
  auth: AuthenticatedState;
  logout: () => Promise<void>;
}) {
  const isMobile = useIsMobileBreakpoint(640);
  const judgeId = auth.manifest.judge.id;
  const isAdmin = (auth.manifest.station.code || '').trim().toUpperCase() === 'T';
  const [page, setPage] = useState<DeskovkyPage>(() => resolveAllowedPage(resolvePage(window.location.pathname), isAdmin));
  const [context, setContext] = useState<BoardJudgeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const navigate = useCallback((nextPage: DeskovkyPage, options?: { replace?: boolean }) => {
    const resolvedNextPage = resolveAllowedPage(nextPage, isAdmin);
    const nextPath = buildCanonicalPath(resolvedNextPage);
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextPath);
    } else {
      window.history.pushState(window.history.state, '', nextPath);
    }
    setPage(resolvedNextPage);
  }, [isAdmin]);

  useEffect(() => {
    const resolvedPage = resolvePage(window.location.pathname);
    const allowedPage = resolveAllowedPage(resolvedPage, isAdmin);
    if (resolvedPage !== allowedPage) {
      window.history.replaceState(window.history.state, '', buildCanonicalPath(allowedPage));
    }
    setPage(allowedPage);
  }, [isAdmin]);

  useEffect(() => {
    const handlePopState = () => {
      const resolvedPage = resolvePage(window.location.pathname);
      const allowedPage = resolveAllowedPage(resolvedPage, isAdmin);
      if (resolvedPage !== allowedPage) {
        window.history.replaceState(window.history.state, '', buildCanonicalPath(allowedPage));
      }
      setPage(allowedPage);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isAdmin]);

  const navItems = useMemo<ReadonlyArray<{ page: DeskovkyPage; label: string; ariaLabel: string }>>(() => {
    if (isAdmin) {
      return [
        { page: 'admin', label: 'Admin', ariaLabel: 'Přejít na administraci' },
        { page: 'standings', label: 'Pořadí', ariaLabel: 'Přejít na Pořadí' },
        { page: 'rules', label: 'Pravidla', ariaLabel: 'Přejít na Pravidla' },
      ];
    }
    return [
      { page: 'home', label: 'Přehled', ariaLabel: 'Přejít na Přehled' },
      { page: 'new-match', label: 'Nový zápas', ariaLabel: 'Přejít na Nový zápas' },
      { page: 'rules', label: 'Pravidla', ariaLabel: 'Přejít na Pravidla' },
    ];
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const loaded = await loadJudgeContext(judgeId, { includeAllEvents: isAdmin });
        if (cancelled) return;

        setContext(loaded);
        if (loaded.events.length > 0) {
          setSelectedEventId((current) => current ?? loaded.events[0].id);
        } else {
          setSelectedEventId(null);
        }
      } catch (loadError) {
        console.error('Failed to load deskovky context', loadError);
        if (!cancelled) {
          setError('Nepodařilo se načíst přiřazení Deskovek.');
          setContext(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, judgeId]);

  const pageTitle = useMemo(() => {
    switch (page) {
      case 'new-match':
        return 'Partie u stolu';
      case 'standings':
        return 'Průběžné pořadí';
      case 'rules':
        return 'Pravidla';
      case 'admin':
        return 'Administrace';
      default:
        return '';
    }
  }, [page]);

  if (loading) {
    return <LoadingState />;
  }

  if (error || !context) {
    return <ErrorState message={error ?? 'Nepodařilo se načíst data.'} />;
  }

  return (
    <div className="admin-shell deskovky-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div>
            <h1>Deskové hry</h1>
            {pageTitle ? <p className="admin-subtitle">{pageTitle}</p> : null}
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              className="admin-button admin-button--secondary admin-button--pill"
              onClick={() => logout()}
              aria-label="Odhlásit se"
            >
              Odhlásit se
            </button>
          </div>
        </div>
      </header>

      <main className="admin-content">
        <section className="admin-card deskovky-nav-card">
          <div className="deskovky-nav-grid" role="tablist" aria-label="Sekce Deskovek">
            {navItems.map((item) => (
              <button
                key={item.page}
                type="button"
                className={`admin-button ${page === item.page ? 'admin-button--primary' : 'admin-button--secondary'}`}
                onClick={() => navigate(item.page)}
                aria-label={item.ariaLabel}
              >
                {item.label}
              </button>
            ))}
          </div>
          {page === 'rules' ? (
            <div className="deskovky-nav-rules">
              <p className="admin-card-subtitle">Dokumenty se otevřou v nové kartě.</p>
              <RulesLinks className="deskovky-rules-links deskovky-rules-links--inline" />
            </div>
          ) : null}
        </section>

        {page === 'home' ? (
          <JudgeHomePage
            judgeId={judgeId}
            context={context}
            selectedEventId={selectedEventId}
          />
        ) : null}

        {page === 'new-match' ? (
          <AssignedTableMatchesPage
            judgeId={judgeId}
            context={context}
            selectedEventId={selectedEventId}
            isMobile={isMobile}
          />
        ) : null}

        {page === 'standings' ? (
          <StandingsPage
            context={context}
            selectedEventId={selectedEventId}
            onSelectEventId={setSelectedEventId}
            isMobile={isMobile}
          />
        ) : null}

        {page === 'admin' ? (
          isAdmin ? (
            <AdminPage selectedEventId={selectedEventId} onSelectEventId={setSelectedEventId} isMobile={isMobile} />
          ) : (
            <section className="admin-card">
              <h2>Přístup zamítnut</h2>
              <p className="admin-card-subtitle">
                Administrace Deskovek je dostupná pouze pro kancelář (stanoviště T).
              </p>
            </section>
          )
        ) : null}
      </main>

      <AppFooter variant="minimal" />
    </div>
  );
}
