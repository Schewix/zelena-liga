import {
useEffect,
useRef,
useState
} from 'react';
import logo from '../../assets/znak_SPTO_transparent.png';
import SecretMenuGame from '../../secretMenu/SecretMenuGame';
import { AFTERPARTY_TRIGGER_CLICK_COUNT,AFTERPARTY_TRIGGER_WINDOW_MS } from '../afterparty/model';
import { HEADER_SUBTITLE } from '../data/about';
import { NAV_ITEMS } from './navigation';

export function SiteHeader({
  activeSection,
  title,
  subtitle,
  lead,
}: {
  activeSection?: string;
  title?: string;
  subtitle?: string;
  lead?: string;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [secretMenuOpen, setSecretMenuOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 901px)').matches : true,
  );
  const [isDesktopCompact, setIsDesktopCompact] = useState(false);
  const titleTapTimestampsRef = useRef<number[]>([]);
  const navPanelId = 'homepage-nav-panel';
  const useCompactNav = !isDesktopViewport || isDesktopCompact;
  const isNavPanelOpen = useCompactNav ? navOpen : true;
  const resolvedTitle = title ?? 'SPTO a Zelená liga';
  const resolvedSubtitle = subtitle ?? HEADER_SUBTITLE;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mediaQuery = window.matchMedia('(min-width: 901px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsDesktopViewport(event.matches);
    };
    setIsDesktopViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => {
      mediaQuery.removeEventListener('change', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDesktopViewport) {
      setIsDesktopCompact(false);
      return;
    }
    const handleScroll = () => {
      setIsDesktopCompact(window.scrollY > 140);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isDesktopViewport]);

  useEffect(() => {
    if (!useCompactNav) {
      setNavOpen(false);
    }
  }, [useCompactNav]);

  const handleNavToggle = () => {
    setNavOpen((prev) => !prev);
  };
  const handleNavLinkClick = () => {
    if (useCompactNav) {
      setNavOpen(false);
    }
  };

  const handleHeaderTitleClick = () => {
    const now = Date.now();
    const recent = titleTapTimestampsRef.current.filter((timestamp) => now - timestamp <= AFTERPARTY_TRIGGER_WINDOW_MS);
    recent.push(now);
    titleTapTimestampsRef.current = recent;
    if (recent.length >= AFTERPARTY_TRIGGER_CLICK_COUNT) {
      titleTapTimestampsRef.current = [];
      setSecretMenuOpen(true);
    }
  };

  return (
    <>
      <header className="homepage-header">
        <div className="homepage-header-inner">
          <a className="homepage-hero-logo" href="https://zelenaliga.cz">
            <img src={logo} alt="Logo Zelená liga" />
            <span className="homepage-logo-caption">SPTO Brno</span>
          </a>
          <div className="homepage-header-copy">
            <h1 onClick={handleHeaderTitleClick}>{resolvedTitle}</h1>
            <p className="homepage-subtitle">{resolvedSubtitle}</p>
            {lead ? <p className="homepage-lead homepage-hero-lead">{lead}</p> : null}
          </div>
        </div>
      </header>

      <nav
        className={`homepage-nav${useCompactNav ? ' is-compact' : ''}${isDesktopCompact ? ' is-desktop-compact' : ''}`}
        aria-label="Hlavní navigace"
      >
        <div className="homepage-nav-bar">
          <span className="homepage-nav-title">Navigace</span>
          <button
            className={`homepage-nav-toggle${isNavPanelOpen ? ' is-open' : ''}`}
            type="button"
            aria-expanded={isNavPanelOpen}
            aria-controls={navPanelId}
            onClick={handleNavToggle}
          >
            <span className="homepage-nav-toggle-text">Menu</span>
            <span className="homepage-nav-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
        <div className={`homepage-nav-panel${isNavPanelOpen ? ' is-open' : ''}`} id={navPanelId}>
          <div className="homepage-nav-inner">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={handleNavLinkClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={`homepage-nav-link${isActive ? ' is-active' : ''}`}
                >
                  <span className="homepage-nav-dot" aria-hidden="true" />
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      </nav>
      <SecretMenuGame open={secretMenuOpen} onClose={() => setSecretMenuOpen(false)} />
    </>
  );
}
