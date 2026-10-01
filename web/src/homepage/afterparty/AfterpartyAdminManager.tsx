import {
useCallback,
useEffect,
useState,
type FormEvent
} from 'react';
import { AfterpartyAdminOrderRow,AfterpartyAdminSessionState,afterpartyDraftKey,formatAfterpartyDate,formatAfterpartyStatus,getAfterpartyAdminDraftQuantity } from './model';

export function AfterpartyAdminManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sessionState, setSessionState] = useState<AfterpartyAdminSessionState>('checking');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState<AfterpartyAdminOrderRow[]>([]);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const applyOrders = useCallback((nextOrders: AfterpartyAdminOrderRow[]) => {
    setOrders(nextOrders);
    const nextQuantities: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    nextOrders.forEach((order) => {
      nextNotes[order.id] = order.review_note ?? '';
      (order.afterparty_order_items ?? []).forEach((item) => {
        nextQuantities[afterpartyDraftKey(order.id, item.id)] = String(item.approved_quantity ?? item.quantity ?? 0);
      });
    });
    setDraftQuantities(nextQuantities);
    setReviewNotes(nextNotes);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/content/admin/afterparty/orders', {
        credentials: 'include',
      });
      if (response.status === 401) {
        setSessionState('unauthorized');
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        orders?: AfterpartyAdminOrderRow[];
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || 'Nepodařilo se načíst účtenky.');
      }
      applyOrders(body?.orders ?? []);
      setSessionState('authorized');
    } catch (loadError) {
      console.error('Failed to load afterparty admin orders', loadError);
      setError(loadError instanceof Error && loadError.message ? loadError.message : 'Nepodařilo se načíst účtenky.');
    } finally {
      setLoading(false);
    }
  }, [applyOrders]);

  const checkSession = useCallback(async () => {
    setSessionState('checking');
    setError(null);
    try {
      const response = await fetch('/api/content/admin/session', { credentials: 'include' });
      if (!response.ok) {
        setSessionState('unauthorized');
        return;
      }
      setSessionState('authorized');
      await loadOrders();
    } catch (sessionError) {
      console.error('Failed to check content admin session', sessionError);
      setSessionState('unauthorized');
    }
  }, [loadOrders]);

  useEffect(() => {
    if (open) {
      setSuccess(null);
      void checkSession();
    }
  }, [checkSession, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/content/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || 'Přihlášení se nepodařilo.');
      }
      setPassword('');
      setSessionState('authorized');
      await loadOrders();
    } catch (loginError) {
      console.error('Failed to log in to afterparty manager', loginError);
      setSessionState('unauthorized');
      setError(loginError instanceof Error && loginError.message ? loginError.message : 'Přihlášení se nepodařilo.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (orderId: string, itemId: string, value: string) => {
    setDraftQuantities((prev) => ({
      ...prev,
      [afterpartyDraftKey(orderId, itemId)]: value,
    }));
  };

  const reviewOrder = async (order: AfterpartyAdminOrderRow, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm('Opravdu zamítnout tuto účtenku?')) {
      return;
    }

    setSavingOrderId(order.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/content/admin/afterparty/orders/${order.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          review_note: reviewNotes[order.id] ?? '',
          items: (order.afterparty_order_items ?? []).map((item) => ({
            id: item.id,
            approved_quantity: getAfterpartyAdminDraftQuantity(draftQuantities, order.id, item),
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 401) {
        setSessionState('unauthorized');
        throw new Error('Přihlášení vypršelo.');
      }
      if (!response.ok) {
        throw new Error(body?.error || 'Uložení kontroly se nepodařilo.');
      }
      setSuccess(action === 'approve' ? 'Účtenka byla potvrzena.' : 'Účtenka byla zamítnuta.');
      await loadOrders();
    } catch (reviewError) {
      console.error('Failed to review afterparty order', reviewError);
      setError(
        reviewError instanceof Error && reviewError.message
          ? reviewError.message
          : 'Uložení kontroly se nepodařilo.',
      );
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleResetLeague = async () => {
    const confirmed = window.confirm(
      'Opravdu resetovat celou pivečko ligu? Smaže se pořadí, účastníci, účtenky i nahrané soubory.',
    );
    if (!confirmed) {
      return;
    }

    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/content/admin/afterparty/reset', {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 401) {
        setSessionState('unauthorized');
        throw new Error('Přihlášení vypršelo.');
      }
      if (!response.ok) {
        throw new Error(body?.error || 'Reset ligy se nepodařil.');
      }
      applyOrders([]);
      setSuccess('Pivečko liga byla resetována.');
    } catch (resetError) {
      console.error('Failed to reset afterparty league', resetError);
      setError(resetError instanceof Error && resetError.message ? resetError.message : 'Reset ligy se nepodařil.');
    } finally {
      setResetting(false);
    }
  };

  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const reviewedOrders = orders
    .filter((order) => order.status !== 'pending')
    .sort((a, b) => {
      const dateA = Date.parse(a.reviewed_at ?? a.submitted_at);
      const dateB = Date.parse(b.reviewed_at ?? b.submitted_at);
      return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
    });

  const renderAdminReceipt = (order: AfterpartyAdminOrderRow) => {
    const signedUrl = order.receipt_signed_url ?? '';
    const receiptLooksLikeImage = /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(signedUrl || order.receipt_path);

    if (signedUrl && receiptLooksLikeImage) {
      return (
        <a href={signedUrl} target="_blank" rel="noreferrer">
          <img src={signedUrl} alt="Nahraná účtenka" />
        </a>
      );
    }
    if (signedUrl) {
      return (
        <a className="homepage-afterparty-inline-button" href={signedUrl} target="_blank" rel="noreferrer">
          Otevřít účtenku
        </a>
      );
    }
    return <span className="homepage-afterparty-empty">Náhled účtenky není dostupný.</span>;
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="homepage-afterparty-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="afterparty-admin-title"
      onClick={onClose}
    >
      <div className="homepage-afterparty-panel" onClick={(event) => event.stopPropagation()}>
        <div className="homepage-afterparty-header">
          <h2 id="afterparty-admin-title">Správa pivečko ligy</h2>
          <button type="button" className="homepage-afterparty-close" onClick={onClose}>
            Zavřít
          </button>
        </div>

        {error ? <p className="homepage-afterparty-alert is-error">{error}</p> : null}
        {success ? <p className="homepage-afterparty-alert is-success">{success}</p> : null}

        {sessionState === 'checking' ? (
          <section className="homepage-afterparty-section">
            <p className="homepage-afterparty-empty">Ověřuji přihlášení…</p>
          </section>
        ) : null}

        {sessionState === 'unauthorized' ? (
          <section className="homepage-afterparty-section">
            <h3>Přihlášení</h3>
            <form className="homepage-afterparty-profile-form" onSubmit={handleLogin}>
              <label>
                <span>Heslo do redakce</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button type="submit" className="homepage-afterparty-add-order" disabled={loading}>
                {loading ? 'Přihlašuji…' : 'Přihlásit'}
              </button>
            </form>
          </section>
        ) : null}

        {sessionState === 'authorized' ? (
          <>
            <section className="homepage-afterparty-section">
              <div className="homepage-afterparty-admin-toolbar">
                <button type="button" className="homepage-afterparty-inline-button" onClick={loadOrders} disabled={loading}>
                  {loading ? 'Načítám…' : 'Obnovit účtenky'}
                </button>
                <button
                  type="button"
                  className="homepage-afterparty-reset"
                  onClick={handleResetLeague}
                  disabled={resetting}
                >
                  {resetting ? 'Resetuji…' : 'Resetovat ligu'}
                </button>
              </div>
            </section>

            <section className="homepage-afterparty-section">
              <div className="homepage-afterparty-section-head">
                <h3>Ke kontrole</h3>
              </div>
              {pendingOrders.length === 0 && !loading ? (
                <p className="homepage-afterparty-empty">Žádné účtenky ke kontrole.</p>
              ) : null}
              {pendingOrders.length > 0 ? (
                <div className="homepage-afterparty-admin-list">
                  {pendingOrders.map((order) => {
                    const participant = order.afterparty_participants ?? null;
                    const items = order.afterparty_order_items ?? [];
                    const isSaving = savingOrderId === order.id;
                    const previewPoints = items.reduce(
                      (sum, item) =>
                        sum
                        + getAfterpartyAdminDraftQuantity(draftQuantities, order.id, item)
                        * Math.max(0, Math.round(item.points_each ?? 0)),
                      0,
                    );

                    return (
                      <article key={order.id} className={`homepage-afterparty-admin-order is-${order.status}`}>
                        <div className="homepage-afterparty-admin-order-head">
                          <div>
                            <h3>{participant?.display_name ?? 'Neznámý účastník'}</h3>
                            <p>
                              {participant?.troop_name ?? 'Bez oddílu'} · {formatAfterpartyDate(order.submitted_at)}
                            </p>
                          </div>
                          <span className={`homepage-afterparty-admin-status is-${order.status}`}>
                            {formatAfterpartyStatus(order.status)}
                          </span>
                        </div>

                        <div className="homepage-afterparty-admin-receipt">
                          {renderAdminReceipt(order)}
                        </div>

                        <div className="homepage-afterparty-admin-items">
                          {items.map((item) => {
                            const inputId = `afterparty-admin-${order.id}-${item.id}`;
                            return (
                              <label key={item.id} className="homepage-afterparty-admin-item" htmlFor={inputId}>
                                <span>
                                  <strong>{item.label}</strong>
                                  <small>
                                    {item.category} · nahlášeno {item.quantity} · {item.points_each} bodů za kus
                                  </small>
                                </span>
                                <input
                                  id={inputId}
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  value={draftQuantities[afterpartyDraftKey(order.id, item.id)] ?? String(item.quantity)}
                                  onChange={(event) => handleQuantityChange(order.id, item.id, event.target.value)}
                                />
                              </label>
                            );
                          })}
                        </div>

                        <label className="homepage-afterparty-admin-note" htmlFor={`afterparty-admin-note-${order.id}`}>
                          <span>Poznámka pro účastníka</span>
                          <textarea
                            id={`afterparty-admin-note-${order.id}`}
                            value={reviewNotes[order.id] ?? ''}
                            onChange={(event) =>
                              setReviewNotes((prev) => ({
                                ...prev,
                                [order.id]: event.target.value,
                              }))
                            }
                            placeholder="Volitelné, např. upraven počet podle účtenky"
                          />
                        </label>

                        <div className="homepage-afterparty-admin-total">
                          <span>
                            Body po kontrole: <strong>{previewPoints}</strong>
                          </span>
                          <span>
                            Aktuálně uloženo: <strong>{order.total_points}</strong>
                          </span>
                        </div>

                        <div className="homepage-afterparty-admin-actions">
                          <button
                            type="button"
                            className="homepage-afterparty-inline-button"
                            onClick={() => reviewOrder(order, 'reject')}
                            disabled={isSaving}
                          >
                            {isSaving ? 'Ukládám…' : 'Zamítnout'}
                          </button>
                          <button
                            type="button"
                            className="homepage-afterparty-add-order"
                            onClick={() => reviewOrder(order, 'approve')}
                            disabled={isSaving}
                          >
                            {isSaving ? 'Ukládám…' : 'Potvrdit body'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>

            {reviewedOrders.length > 0 ? (
              <section className="homepage-afterparty-section">
                <div className="homepage-afterparty-section-head">
                  <h3>Historie</h3>
                </div>
                <div className="homepage-afterparty-admin-list">
                  {reviewedOrders.map((order) => {
                    const participant = order.afterparty_participants ?? null;
                    const items = order.afterparty_order_items ?? [];

                    return (
                      <article
                        key={order.id}
                        className={`homepage-afterparty-admin-order homepage-afterparty-admin-order--history is-${order.status}`}
                      >
                        <div className="homepage-afterparty-admin-order-head">
                          <div>
                            <h3>{participant?.display_name ?? 'Neznámý účastník'}</h3>
                            <p>
                              {participant?.troop_name ?? 'Bez oddílu'} · {formatAfterpartyDate(order.submitted_at)}
                            </p>
                          </div>
                          <span className={`homepage-afterparty-admin-status is-${order.status}`}>
                            {formatAfterpartyStatus(order.status)}
                          </span>
                        </div>

                        <div className="homepage-afterparty-admin-receipt">
                          {renderAdminReceipt(order)}
                        </div>

                        <div className="homepage-afterparty-admin-history-items">
                          {items.map((item) => (
                            <span key={item.id}>
                              <strong>{item.label}</strong>
                              <small>
                                nahlášeno {item.quantity} · uznáno {item.approved_quantity} · {item.points_total} bodů
                              </small>
                            </span>
                          ))}
                        </div>

                        {order.review_note ? (
                          <p className="homepage-afterparty-admin-history-note">{order.review_note}</p>
                        ) : null}

                        <div className="homepage-afterparty-admin-total">
                          <span>
                            Uloženo: <strong>{order.total_points} bodů</strong>
                          </span>
                          {order.reviewed_at ? (
                            <span>
                              Zkontrolováno: <strong>{formatAfterpartyDate(order.reviewed_at)}</strong>
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
