import {
useState
} from 'react';
import AppFooter from '../../components/AppFooter';
import { AfterpartyAdminManager } from '../afterparty/AfterpartyAdminManager';
import { resolveActiveNav } from './navigation';
import { SiteHeader } from './SiteHeader';

export function SiteShell({
  children,
  activeSection,
  headerTitle,
  headerSubtitle,
  headerLead,
}: {
  children: React.ReactNode;
  activeSection?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  headerLead?: string;
}) {
  const [afterpartyAdminOpen, setAfterpartyAdminOpen] = useState(false);
  const resolvedActiveSection =
    activeSection ?? (typeof window !== 'undefined' ? resolveActiveNav(window.location.pathname) : undefined);
  return (
    <div className="homepage-shell" style={{ scrollBehavior: 'smooth' }}>
      <SiteHeader
        activeSection={resolvedActiveSection}
        title={headerTitle}
        subtitle={headerSubtitle}
        lead={headerLead}
      />
      {children}
      <AppFooter className="homepage-footer" onSecretTrigger={() => setAfterpartyAdminOpen(true)} />
      <AfterpartyAdminManager open={afterpartyAdminOpen} onClose={() => setAfterpartyAdminOpen(false)} />
    </div>
  );
}
