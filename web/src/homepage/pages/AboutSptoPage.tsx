import {
useEffect,
useState
} from 'react';
import {
fetchDocuments,
sortDocumentsByYearDesc,
type SptoDocument
} from '../../data/documents';
import { SPTO_CHIEFS,SPTO_FOUNDING_HIGHLIGHTS,SPTO_FOUNDING_TROOPS,SPTO_HISTORY_HIGHLIGHTS,SPTO_HONORARY_MEMBERS } from '../data/about';
import { PdfEmbedCard,SbornicekGrid } from '../documents/components';
import { SPTO_POLICY_PDF } from '../documents/model';
import { SiteShell } from '../layout/SiteShell';

export function AboutSptoPage() {
  const [sbornicky, setSbornicky] = useState<SptoDocument[]>([]);

  useEffect(() => {
    let active = true;
    fetchDocuments().then((documents) => {
      if (active) {
        setSbornicky(sortDocumentsByYearDesc(documents.filter((document) => document.kind === 'sbornicek')));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="about-spto-heading">
        <h1 id="about-spto-heading">O SPTO</h1>

        <div className="homepage-card">
          <div className="homepage-about-grid">
            <div className="homepage-about-card">
              <h2>Z historie SPTO</h2>
              <ul className="homepage-about-list">
                {SPTO_HISTORY_HIGHLIGHTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="homepage-about-card">
              <h2>Založení SPTO – novodobé</h2>
              <ul className="homepage-about-list">
                {SPTO_FOUNDING_HIGHLIGHTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="homepage-about-card">
              <h2>Zakládající oddíly roku 1990</h2>
              <ul className="homepage-about-list homepage-about-list--columns">
                {SPTO_FOUNDING_TROOPS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="homepage-about-card">
              <h2>Čestné členství v SPTO</h2>
              <ul className="homepage-about-list">
                {SPTO_HONORARY_MEMBERS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="homepage-card">
          <h2>Náčelníci SPTO Brno</h2>
          <ul className="homepage-about-list homepage-about-list--chiefs">
            {SPTO_CHIEFS.map((chief) => (
              <li key={`${chief.name}-${chief.term}`}>
                <strong>{chief.name}</strong>
                <span>{chief.troop}</span>
                <span>{chief.term}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="homepage-card">
          <h2>Zásady činnosti SPTO (únor 2016)</h2>
          {SPTO_POLICY_PDF ? (
            <PdfEmbedCard title="Zásady činnosti SPTO (únor 2016)" url={SPTO_POLICY_PDF.url} />
          ) : (
            <p>Soubor zásad se nepodařilo načíst. Zkus prosím obnovit stránku.</p>
          )}
        </div>

        {sbornicky.length > 0 ? (
          <div className="homepage-card sbornicky-card">
            <h2>Sborníčky SPTO</h2>
            <p className="sbornicky-lead">Ročenky z činnosti oddílů. Klikni na dlaždici a sborníček se otevře.</p>
            <SbornicekGrid documents={sbornicky} />
          </div>
        ) : null}
      </main>
    </SiteShell>
  );
}
