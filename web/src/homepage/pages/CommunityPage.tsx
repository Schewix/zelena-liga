import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
deleteCommunity,
fetchCommunity,
LOAN_KIND_LABELS,
submitCommunity,
type LoanKind,
type LoanOffer,
type LodgingTip,
} from '../../data/community';
import {
getCommunitySession,
onCommunitySessionChange,
sendCommunityCode,
signOutCommunity,
verifyCommunityCode,
} from '../../data/communityAuth';
import { geocodeAddress, mapyComUrl, parseGpsInput } from '../../data/geocode';
import { SiteShell } from '../layout/SiteShell';
import { toTelHref } from '../shared/format';
import { LodgingMap } from './LodgingMap';

type Status = { kind: 'success' | 'error'; text: string } | null;

function renderStars(rating: number) {
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

function ContactLine({ name, contact }: { name: string; contact: string }) {
  const isEmail = contact.includes('@');
  const isPhone = !isEmail && /^[+\d\s()-]{7,}$/.test(contact);
  return (
    <span className="community-contact">
      {name} ·{' '}
      {isEmail ? (
        <a href={`mailto:${contact}`}>{contact}</a>
      ) : isPhone ? (
        <a href={toTelHref(contact)}>{contact}</a>
      ) : (
        contact
      )}
    </span>
  );
}

function LodgingForm({
  accessToken,
  picked,
  onPick,
  onDone,
  onCancel,
}: {
  accessToken: string;
  picked: { lat: number; lng: number } | null;
  onPick: (point: { lat: number; lng: number }) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [searching, setSearching] = useState(false);

  const handleLocate = async () => {
    const query = address.trim();
    if (!query) return;
    const gps = parseGpsInput(query);
    if (gps) {
      onPick(gps);
      setStatus(null);
      return;
    }
    setSearching(true);
    const found = await geocodeAddress(query);
    setSearching(false);
    if (found) {
      onPick(found);
      setStatus(null);
    } else {
      setStatus({ kind: 'error', text: 'Adresu se nepodařilo najít. Zkus ji upřesnit, zadat GPS, nebo klikni do mapy.' });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!picked) {
      setStatus({ kind: 'error', text: 'Zadej adresu nebo GPS a klikni na „Najít na mapě“.' });
      return;
    }
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(form.entries());
    body.place = address.trim();
    body.lat = picked.lat;
    body.lng = picked.lng;
    setSaving(true);
    const result = await submitCommunity('lodging', body, accessToken);
    setSaving(false);
    if (result.ok) {
      onDone();
    } else {
      setStatus({ kind: 'error', text: result.error });
    }
  };

  return (
    <form className="community-form" onSubmit={handleSubmit}>
      <p className="community-hint">
        {picked
          ? `Poloha nalezena (${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}). Kliknutím do mapy ji můžeš posunout.`
          : 'Zadej adresu nebo GPS souřadnice ubytování a najdi ho na mapě.'}
      </p>
      <label>
        <span>Název ubytování *</span>
        <input name="name" required maxLength={160} />
      </label>
      <div className="community-locate">
        <label>
          <span>Adresa nebo GPS *</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleLocate();
              }
            }}
            maxLength={160}
            placeholder="např. Brno, Údolní 5 nebo 49.1951N, 16.6068E"
          />
        </label>
        <button type="button" className="homepage-cta secondary" onClick={handleLocate} disabled={searching}>
          {searching ? 'Hledám…' : 'Najít na mapě'}
        </button>
      </div>
      <label>
        <span>Odkaz na web</span>
        <input name="url" maxLength={300} placeholder="https://" />
      </label>
      <div className="community-form-row">
        <label>
          <span>Kolik nás tam bylo</span>
          <input name="groupSize" type="number" min={1} max={500} inputMode="numeric" />
        </label>
        <label>
          <span>Hodnocení</span>
          <select name="rating" defaultValue="">
            <option value="">Bez hodnocení</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} – {renderStars(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>Jaká byla komunikace</span>
        <textarea name="communication" rows={2} maxLength={1000} />
      </label>
      <label>
        <span>Slovní hodnocení</span>
        <textarea name="review" rows={3} maxLength={2000} />
      </label>
      <div className="community-form-row">
        <label>
          <span>Jméno vedoucího *</span>
          <input name="leaderName" required maxLength={120} autoComplete="name" />
        </label>
        <label>
          <span>Kontakt (telefon nebo e-mail) *</span>
          <input name="leaderContact" required maxLength={160} autoComplete="email" />
        </label>
      </div>
      <input name="company" className="community-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {status ? <p className={`community-status community-status--${status.kind}`}>{status.text}</p> : null}
      <div className="community-form-actions">
        <button type="submit" className="homepage-cta primary" disabled={saving}>
          {saving ? 'Ukládám…' : 'Přidat tip'}
        </button>
        <button type="button" className="homepage-cta secondary" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function LoanForm({ accessToken, onDone, onCancel }: { accessToken: string; onDone: () => void; onCancel: () => void }) {
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    const result = await submitCommunity('loans', body, accessToken);
    setSaving(false);
    if (result.ok) {
      onDone();
    } else {
      setStatus({ kind: 'error', text: result.error });
    }
  };

  return (
    <form className="community-form" onSubmit={handleSubmit}>
      <div className="community-form-row">
        <label>
          <span>Typ</span>
          <select name="kind" defaultValue="games">
            {(Object.keys(LOAN_KIND_LABELS) as LoanKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {LOAN_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Co nabízíš *</span>
          <input name="title" required maxLength={160} />
        </label>
      </div>
      <label>
        <span>Popis (množství, podmínky půjčení…)</span>
        <textarea name="description" rows={3} maxLength={1000} />
      </label>
      <label>
        <span>Kde si to lze vyzvednout</span>
        <input name="place" maxLength={160} />
      </label>
      <div className="community-form-row">
        <label>
          <span>Jméno vedoucího *</span>
          <input name="leaderName" required maxLength={120} autoComplete="name" />
        </label>
        <label>
          <span>Kontakt (telefon nebo e-mail) *</span>
          <input name="leaderContact" required maxLength={160} autoComplete="email" />
        </label>
      </div>
      <input name="company" className="community-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {status ? <p className={`community-status community-status--${status.kind}`}>{status.text}</p> : null}
      <div className="community-form-actions">
        <button type="submit" className="homepage-cta primary" disabled={saving}>
          {saving ? 'Ukládám…' : 'Nabídnout k půjčení'}
        </button>
        <button type="button" className="homepage-cta secondary" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function LoginPanel({ onCancel }: { onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await sendCommunityCode(email.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
    } else {
      setCodeSent(true);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await verifyCommunityCode(email.trim(), code);
    setBusy(false);
    if (failure) {
      setError(failure);
    }
  };

  return (
    <form className="community-form" onSubmit={codeSent ? handleVerify : handleSend}>
      <p className="community-hint">
        {codeSent
          ? `Poslali jsme ti kód na ${email.trim()}. Opiš ho sem.`
          : 'Pro přidání tipu se přihlas e-mailem. Pošleme ti jednorázový kód, heslo nepotřebuješ.'}
      </p>
      {codeSent ? (
        <label>
          <span>Kód z e-mailu</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
          />
        </label>
      ) : (
        <label>
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
      )}
      {error ? <p className="community-status community-status--error">{error}</p> : null}
      <div className="community-form-actions">
        <button type="submit" className="homepage-cta primary" disabled={busy}>
          {busy ? 'Chvilku…' : codeSent ? 'Přihlásit' : 'Poslat kód'}
        </button>
        <button type="button" className="homepage-cta secondary" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

export function CommunityPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loginOpen, setLoginOpen] = useState<'lodging' | 'loan' | null>(null);
  const [lodgings, setLodgings] = useState<LodgingTip[]>([]);
  const [loans, setLoans] = useState<LoanOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingLodging, setAddingLodging] = useState(false);
  const [addingLoan, setAddingLoan] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    const data = await fetchCommunity();
    if (data) {
      setLodgings(data.lodgings);
      setLoans(data.loans);
    }
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    void getCommunitySession().then(setSession);
    return onCommunitySessionChange(setSession);
  }, []);

  // Po přihlášení rovnou otevřít formulář, který vedoucí chtěl.
  useEffect(() => {
    if (session && loginOpen) {
      if (loginOpen === 'lodging') setAddingLodging(true);
      else setAddingLoan(true);
      setLoginOpen(null);
    }
  }, [session, loginOpen]);

  const handleDelete = async (kind: 'lodging' | 'loans', id: string) => {
    if (!session || !window.confirm('Opravdu smazat?')) return;
    const result = await deleteCommunity(kind, id, session.access_token);
    if (result.ok) {
      setNotice('Smazáno.');
      if (kind === 'lodging') setSelectedId(null);
      void reload();
    } else {
      setNotice(result.error);
    }
  };

  const startAdding = (kind: 'lodging' | 'loan') => {
    setNotice(null);
    if (!session) {
      setLoginOpen(kind);
    } else if (kind === 'lodging') {
      setAddingLodging(true);
    } else {
      setAddingLoan(true);
    }
  };

  const selected = useMemo(() => lodgings.find((item) => item.id === selectedId) ?? null, [lodgings, selectedId]);

  return (
    <SiteShell>
      <main className="homepage-main homepage-single community-page" aria-labelledby="community-heading">
        <h1 id="community-heading">Tipy od vedoucích</h1>
        {notice ? <p className="community-status community-status--success">{notice}</p> : null}
        {session ? (
          <p className="community-hint">
            Přihlášen jako {session.user.email}.{' '}
            <button type="button" className="community-link-button" onClick={() => void signOutCommunity()}>
              Odhlásit
            </button>
          </p>
        ) : null}

        <section className="homepage-card" aria-labelledby="lodging-heading">
          <div className="community-section-header">
            <div>
              <h2 id="lodging-heading">Tipy na ubytování</h2>
              <p>Kde jsme přespali a jak se nám tam líbilo. Vyplnit stačí jen to, co chceš sdílet.</p>
            </div>
            {!addingLodging && loginOpen !== 'lodging' ? (
              <button type="button" className="homepage-cta primary" onClick={() => startAdding('lodging')}>
                Přidat tip
              </button>
            ) : null}
          </div>

          <LodgingMap
            lodgings={lodgings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            picked={picked}
            picking={addingLodging}
            onPick={setPicked}
          />

          {loginOpen === 'lodging' ? <LoginPanel onCancel={() => setLoginOpen(null)} /> : null}

          {addingLodging && session ? (
            <LodgingForm
              accessToken={session.access_token}
              picked={picked}
              onPick={setPicked}
              onCancel={() => {
                setAddingLodging(false);
                setPicked(null);
              }}
              onDone={() => {
                setAddingLodging(false);
                setPicked(null);
                setNotice('Díky, tip na ubytování je přidaný.');
                void reload();
              }}
            />
          ) : null}

          {selected ? (
            <article className="community-detail">
              <h3>{selected.name}</h3>
              {selected.place ? <p>{selected.place}</p> : null}
              {selected.rating ? (
                <p className="community-rating" aria-label={`Hodnocení ${selected.rating} z 5`}>
                  {renderStars(selected.rating)}
                </p>
              ) : null}
              {selected.groupSize ? <p>Bylo nás tam: {selected.groupSize}</p> : null}
              {selected.communication ? <p>Komunikace: {selected.communication}</p> : null}
              {selected.review ? <p>{selected.review}</p> : null}
              <p>
                <a href={mapyComUrl(selected)} target="_blank" rel="noreferrer noopener">
                  Otevřít v Mapy.com
                </a>
              </p>
              {selected.url ? (
                <p>
                  <a href={selected.url} target="_blank" rel="noreferrer noopener nofollow">
                    Web ubytování
                  </a>
                </p>
              ) : null}
              <ContactLine name={selected.leaderName} contact={selected.leaderContact} />
              {session && selected.ownerId === session.user.id ? (
                <button
                  type="button"
                  className="homepage-cta secondary community-delete"
                  onClick={() => void handleDelete('lodging', selected.id)}
                >
                  Smazat můj tip
                </button>
              ) : null}
            </article>
          ) : null}

          {loading ? (
            <p className="community-hint">Načítám tipy…</p>
          ) : lodgings.length === 0 ? (
            <p className="community-hint">Zatím tu nejsou žádné tipy. Buď první!</p>
          ) : (
            <ul className="community-list">
              {lodgings.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`community-list-item${item.id === selectedId ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {[item.place, item.rating ? renderStars(item.rating) : null].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="homepage-card" aria-labelledby="loans-heading">
          <div className="community-section-header">
            <div>
              <h2 id="loans-heading">Půjčování her a materiálu</h2>
              <p>Co můžeš půjčit ostatním oddílům. Domluva probíhá napřímo s vedoucím.</p>
            </div>
            {!addingLoan && loginOpen !== 'loan' ? (
              <button type="button" className="homepage-cta primary" onClick={() => startAdding('loan')}>
                Nabídnout
              </button>
            ) : null}
          </div>

          {loginOpen === 'loan' ? <LoginPanel onCancel={() => setLoginOpen(null)} /> : null}

          {addingLoan && session ? (
            <LoanForm
              accessToken={session.access_token}
              onCancel={() => setAddingLoan(false)}
              onDone={() => {
                setAddingLoan(false);
                setNotice('Díky, nabídka je přidaná.');
                void reload();
              }}
            />
          ) : null}

          {loading ? null : loans.length === 0 ? (
            <p className="community-hint">Zatím nikdo nic nenabídl.</p>
          ) : (
            <div className="contacts-grid">
              {loans.map((loan) => (
                <div key={loan.id} className="contact-card">
                  <div className="contact-card-header">
                    <strong>{loan.title}</strong>
                    <span>
                      {LOAN_KIND_LABELS[loan.kind] ?? loan.kind}
                      {loan.place ? ` · ${loan.place}` : ''}
                    </span>
                  </div>
                  {loan.description ? <p>{loan.description}</p> : null}
                  <ContactLine name={loan.leaderName} contact={loan.leaderContact} />
                  {session && loan.ownerId === session.user.id ? (
                    <button
                      type="button"
                      className="homepage-cta secondary community-delete"
                      onClick={() => void handleDelete('loans', loan.id)}
                    >
                      Smazat moji nabídku
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
