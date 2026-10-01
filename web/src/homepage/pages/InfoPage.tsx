import { SiteShell } from '../layout/SiteShell';

export type InfoLink = {
  label: string;
  description?: string;
  href: string;
};

export function InfoPage({
  title,
  lead,
  links,
  backHref = '/',
  listClassName,
}: {
  title: string;
  lead: string;
  links?: InfoLink[];
  backHref?: string;
  listClassName?: string;
}) {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="info-heading">
        <h1 id="info-heading">{title}</h1>
        <p className="homepage-lead">{lead}</p>
        <div className="homepage-card">
          {links && links.length > 0 ? (
            <ul className={listClassName ? `homepage-list ${listClassName}` : 'homepage-list'}>
              {links.map((link) => (
                <li key={link.href}>
                  <a className="homepage-inline-link" href={link.href}>
                    {link.label}
                  </a>
                  {link.description ? <p>{link.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>Obsah stránky připravujeme. Sleduj novinky na hlavní stránce.</p>
          )}
        </div>
        <a className="homepage-back-link" href={backHref}>
          Zpět na hlavní stránku
        </a>
      </main>
    </SiteShell>
  );
}
