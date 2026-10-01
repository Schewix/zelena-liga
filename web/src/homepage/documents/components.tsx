import {
Fragment
} from 'react';
import {
documentExtraLinks,
documentLink,
splitTextLinks,
type SptoDocument,
type SptoDocumentLink
} from '../../data/documents';
import {
type ScheduleEvent
} from '../../data/schedule';
import { DOCUMENT_KIND_LABELS } from './model';

export function PdfEmbedCard({ title, url }: { title: string; url: string }) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const zoom = isMobile ? 140 : 120;
  const pdfUrl = `${url}#view=FitH&zoom=${zoom}&toolbar=1&navpanes=0&scrollbar=1`;

  return (
    <div className="homepage-pdf-card">
      <div className="homepage-pdf-frame">
        <iframe src={pdfUrl} title={title} loading="lazy" allowFullScreen scrolling="yes" />
      </div>
      <div className="homepage-pdf-footer">
        <span className="homepage-pdf-title">{title}</span>
        <a className="homepage-cta secondary homepage-pdf-open" href={url} target="_blank" rel="noreferrer">
          Otevřít PDF
        </a>
        <a className="homepage-cta secondary homepage-pdf-download" href={url} download>
          Stáhnout
        </a>
      </div>
      {isMobile ? (
        <p className="homepage-pdf-note">
          Na telefonu doporučujeme PDF otevřít na celou obrazovku – bude se lépe listovat.
        </p>
      ) : null}
    </div>
  );
}

// Dlaždice sborníčku: obálka, když je nahraná, jinak aspoň ročník na barevném podkladu.
export function SbornicekGrid({ documents }: { documents: SptoDocument[] }) {
  return (
    <ul className="sbornicek-grid">
      {documents.map((document) => {
        const link = documentLink(document);
        const cover = document.coverUrl ? (
          <img src={document.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="sbornicek-cover-fallback" aria-hidden="true">
            {document.year ?? 'SPTO'}
          </span>
        );
        const body = (
          <>
            <span className="sbornicek-cover">{cover}</span>
            <span className="sbornicek-meta">
              <strong>{document.title}</strong>
              {document.description ? <small>{document.description}</small> : null}
            </span>
          </>
        );
        return (
          <li className="sbornicek-item" key={document.id}>
            {link ? (
              <a className="sbornicek-link" href={link} target="_blank" rel="noreferrer">
                {body}
              </a>
            ) : (
              <span className="sbornicek-link sbornicek-link--locked">
                {body}
                <span className="sbornicek-locked-note">Jen pro vedoucí</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function documentParagraphs(document: SptoDocument) {
  return (document.description ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

// V mailu od pořadatele jsou odkazy holé, na webu z nich děláme klikatelné.
export function DocumentParagraph({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {splitTextLinks(text).map((segment, index) =>
        segment.kind === 'link' ? (
          <a href={segment.url} target="_blank" rel="noreferrer" key={index}>
            {segment.value}
          </a>
        ) : (
          <Fragment key={index}>{segment.value}</Fragment>
        ),
      )}
    </p>
  );
}

// Pojmenované odkazy zadané v redakci – tabulka na odjezd, přihlašovna a podobně.
export function DocumentLinkList({ links }: { links: SptoDocumentLink[] }) {
  if (links.length === 0) {
    return null;
  }
  return (
    <ul className="document-link-list">
      {links.map((link, index) => (
        <li key={index}>
          <a href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

// Doplňující informace bývají celý zvací e-mail, takže je schováme pod rozklikávátko a seznam termínů zůstane přehledný.
export function ScheduleDocumentNote({ document }: { document: SptoDocument }) {
  const paragraphs = documentParagraphs(document);
  // Odkazy se ukazují nahoře mezi dlaždicemi, tady zůstává jen doprovodný text.
  if (paragraphs.length === 0) {
    return null;
  }
  const label = DOCUMENT_KIND_LABELS[document.kind];
  return (
    <details className="schedule-doc-note">
      <summary>{document.kind === 'ostatni' ? document.title : `${label} – podrobnosti`}</summary>
      {paragraphs.map((paragraph, index) => (
        <DocumentParagraph text={paragraph} key={index} />
      ))}
    </details>
  );
}

// Dokumenty navázané na termín – u akce v Plánu akcí stačí drobné odkazy a k nim rozbalovací text.
export function ScheduleDocumentLinks({ documents }: { documents: SptoDocument[] }) {
  if (documents.length === 0) {
    return null;
  }
  return (
    <div className="schedule-docs">
      <span className="schedule-doc-links">
        {documents.map((document) => {
          const link = documentLink(document);
          const label = `${DOCUMENT_KIND_LABELS[document.kind]}${document.kind === 'ostatni' ? `: ${document.title}` : ''}`;
          return (
            <Fragment key={document.id}>
              {link ? (
                <a className="schedule-doc-link" href={link} target="_blank" rel="noreferrer">
                  {label}
                </a>
              ) : (
                <span className="schedule-doc-link schedule-doc-link--locked">{label} · jen pro vedoucí</span>
              )}
              {/* Přihlašovna nebo tabulka na odjezd patří k termínu stejně jako propozice, ne pod rozklikávátko. */}
              {documentExtraLinks(document).map((extra, index) => (
                <a
                  className="schedule-doc-link schedule-doc-link--extra"
                  href={extra.url}
                  target="_blank"
                  rel="noreferrer"
                  key={index}
                >
                  {extra.label}
                </a>
              ))}
            </Fragment>
          );
        })}
      </span>
      {documents.map((document) => (
        <ScheduleDocumentNote document={document} key={document.id} />
      ))}
    </div>
  );
}

// Do bucketu se vejdou i obrázky, takže prohlížeč PDF nasazujeme jen tam, kde to opravdu PDF je.
export function isPdfDocument(document: SptoDocument) {
  const source = document.fileName ?? document.fileUrl ?? '';
  return /\.pdf(\?|#|$)/i.test(source);
}

// Dokument navázaný na soutěž – na stránce soutěže vypadá stejně jako přibalená pravidla.
export function CompetitionDocumentCard({ document }: { document: SptoDocument }) {
  const link = documentLink(document);
  const paragraphs = documentParagraphs(document);
  const label =
    document.kind === 'pravidla' || document.kind === 'ostatni'
      ? document.title
      : `${DOCUMENT_KIND_LABELS[document.kind]}: ${document.title}`;

  return (
    <div className="homepage-card">
      <h2>{label}</h2>
      {paragraphs.map((paragraph, index) => (
        <DocumentParagraph className="homepage-doc-text" text={paragraph} key={index} />
      ))}
      <DocumentLinkList links={documentExtraLinks(document)} />
      {link === null ? (
        <p className="homepage-doc-text">Dokument je jen pro vedoucí.</p>
      ) : document.fileUrl && isPdfDocument(document) ? (
        <PdfEmbedCard title={label} url={link} />
      ) : (
        <a className="homepage-cta secondary" href={link} target="_blank" rel="noreferrer">
          Otevřít dokument
        </a>
      )}
    </div>
  );
}

// Dokumenty se k termínu váží přes id, které má jen záznam z databáze.
export function groupDocumentsByEvent(documents: SptoDocument[]) {
  const grouped = new Map<string, SptoDocument[]>();
  documents.forEach((document) => {
    if (!document.scheduleEventId) {
      return;
    }
    const current = grouped.get(document.scheduleEventId);
    if (current) {
      current.push(document);
    } else {
      grouped.set(document.scheduleEventId, [document]);
    }
  });
  return grouped;
}

export function eventDocuments(grouped: Map<string, SptoDocument[]>, event: ScheduleEvent) {
  return event.id ? grouped.get(event.id) ?? [] : [];
}
