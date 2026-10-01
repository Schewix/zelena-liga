import {
useEffect,
useState
} from 'react';
import {
fetchDocuments,
type SptoDocument
} from '../../data/documents';
import { COMPETITIONS } from '../data/competitions';
import { CompetitionDocumentCard,PdfEmbedCard } from '../documents/components';
import { getCompetitionRules } from '../documents/model';
import { SiteShell } from '../layout/SiteShell';
import { formatRuleLabel } from '../shared/format';
import { NotFoundPage } from './NotFoundPage';

export interface CompetitionRulesPageProps {
  slug: string;
}

export function CompetitionRulesPage({ slug }: CompetitionRulesPageProps) {
  const competition = COMPETITIONS.find((item) => item.slug === slug);
  // Pravidla nahraná z redakce jsou aktuálnější než PDF přibalená v repu, proto jdou na stránce první.
  const [uploaded, setUploaded] = useState<SptoDocument[]>([]);

  useEffect(() => {
    let active = true;
    fetchDocuments().then((documents) => {
      if (!active) {
        return;
      }
      setUploaded(
        documents
          .filter((document) => document.competitionSlug === slug)
          .sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title, 'cs')),
      );
    });
    return () => {
      active = false;
    };
  }, [slug]);

  if (!competition) {
    return <NotFoundPage />;
  }

  const rules = getCompetitionRules(competition);

  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="rules-heading">
        <h1 id="rules-heading">{competition.name}</h1>
        <p className="homepage-lead">{competition.description ?? 'Pravidla a dokumenty k soutěži.'}</p>
        {uploaded.length > 0 || rules.length > 0 ? (
          <div className="homepage-pdf-stack">
            {uploaded.map((document) => (
              <CompetitionDocumentCard document={document} key={document.id} />
            ))}
            {rules.map((rule) => {
              const label = formatRuleLabel(rule.filename);
              return (
                <div key={rule.filename} className="homepage-card">
                  <h2>{label}</h2>
                  <PdfEmbedCard title={label} url={rule.url} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="homepage-card">
            <p>Pravidla pro tuto soutěž připravujeme.</p>
          </div>
        )}
        <a className="homepage-back-link" href="/souteze">
          Zpět na soutěže
        </a>
      </main>
    </SiteShell>
  );
}
