import { CONTACTS } from '../data/contacts';
import { SiteShell } from '../layout/SiteShell';
import { toTelHref } from '../shared/format';

export function ContactsPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single contacts-page" aria-labelledby="contacts-heading">
        <h1 id="contacts-heading">Kontakty</h1>
        <div className="homepage-card">
          <div className="contacts-grid">
            {CONTACTS.map((contact) => (
              <div key={contact.id} className="contact-card">
                <div className="contact-card-header">
                  <strong>{contact.role}</strong>
                  <span>{contact.name || 'Informace budou doplněny'}</span>
                </div>
                {contact.phone || contact.email ? (
                  <div className="contact-card-meta">
                    {contact.phone ? (
                      <span>
                        Telefon:{' '}
                        <a href={toTelHref(contact.phone)} className="contact-card-link">
                          {contact.phone}
                        </a>
                      </span>
                    ) : null}
                    {contact.email ? (
                      <span>
                        E-mail:{' '}
                        <a href={`mailto:${contact.email}`} className="contact-card-link">
                          {contact.email}
                        </a>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="contacts-extra">
            <a
              className="homepage-cta secondary"
              href="https://drive.google.com/drive/u/2/folders/1i10O0d2Z5fW-bI1U6ZzW6KjuhcdwIk3N"
              target="_blank"
              rel="noreferrer"
            >
              Google Drive SPTO
            </a>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
