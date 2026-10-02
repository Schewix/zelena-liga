import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MENU_CATEGORY_LABELS, MENU_ITEM_BY_ID } from '../data/menuItems';
import {
  AFTERPARTY_PARTICIPANT_STORAGE_KEY,
  AFTERPARTY_RECEIPTS_BUCKET,
  AFTERPARTY_TROOP_OPTIONS,
  createAfterpartyReceiptPath,
  formatAfterpartyDate,
  formatAfterpartyStatus,
  normalizeAfterpartyTroopName,
  type AfterpartyIndividualLeaderboardRow,
  type AfterpartyOrderRow,
  type AfterpartyParticipant,
  type AfterpartyTroopLeaderboardRow,
} from '../homepage/afterparty/model';
import { supabase } from '../supabaseClient';

export type LeagueDraft = Record<string, number>;

export function getLeagueDraftSummary(draft: LeagueDraft) {
  return Object.entries(draft).reduce(
    (summary, [itemId, quantity]) => {
      const menuItem = MENU_ITEM_BY_ID.get(itemId);
      if (!menuItem || quantity <= 0) {
        return summary;
      }
      return {
        items: summary.items + quantity,
        points: summary.points + quantity * menuItem.points,
      };
    },
    { items: 0, points: 0 },
  );
}

export default function SecretMenuLeague({
  draft,
  onDraftChange,
  onDraftDiscard,
  onDraftSubmitted,
}: {
  draft: LeagueDraft;
  onDraftChange: (itemId: string, delta: number) => void;
  onDraftDiscard: () => void;
  onDraftSubmitted: () => void;
}) {
  const [participant, setParticipant] = useState<AfterpartyParticipant | null>(null);
  const [profileForm, setProfileForm] = useState({ displayName: '', troopName: '' });
  const [profileEditing, setProfileEditing] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<AfterpartyOrderRow[]>([]);
  const [individualLeaderboard, setIndividualLeaderboard] = useState<AfterpartyIndividualLeaderboardRow[]>([]);
  const [troopLeaderboard, setTroopLeaderboard] = useState<AfterpartyTroopLeaderboardRow[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<'individuals' | 'troops'>('individuals');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const draftEntries = Object.entries(draft)
    .map(([itemId, quantity]) => ({ menuItem: MENU_ITEM_BY_ID.get(itemId), quantity }))
    .filter((entry) => entry.menuItem && entry.quantity > 0);
  const draftSummary = getLeagueDraftSummary(draft);

  const loadLeaderboards = useCallback(async () => {
    const [individualRes, troopRes] = await Promise.all([
      supabase
        .from('afterparty_individual_leaderboard')
        .select('participant_id, display_name, troop_name, total_points, approved_orders')
        .gt('total_points', 0)
        .order('total_points', { ascending: false })
        .order('display_name', { ascending: true })
        .limit(50),
      supabase
        .from('afterparty_troop_leaderboard')
        .select('troop_name, total_points, participants, approved_orders')
        .gt('total_points', 0)
        .order('total_points', { ascending: false })
        .order('troop_name', { ascending: true })
        .limit(50),
    ]);
    if (individualRes.error) {
      throw individualRes.error;
    }
    if (troopRes.error) {
      throw troopRes.error;
    }
    setIndividualLeaderboard((individualRes.data ?? []) as AfterpartyIndividualLeaderboardRow[]);
    setTroopLeaderboard((troopRes.data ?? []) as AfterpartyTroopLeaderboardRow[]);
  }, []);

  const loadOrders = useCallback(async (participantId: string) => {
    const { data, error: ordersError } = await supabase
      .from('afterparty_orders')
      .select(
        'id, participant_id, status, receipt_path, total_points, review_note, submitted_at, reviewed_at, afterparty_order_items(id, drink_key, label, category, quantity, approved_quantity, points_each, points_total)',
      )
      .eq('participant_id', participantId)
      .order('submitted_at', { ascending: false })
      .limit(20);
    if (ordersError) {
      throw ordersError;
    }
    setOrders((data ?? []) as AfterpartyOrderRow[]);
  }, []);

  const loadOnlineState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let participantId: string | null = null;
      try {
        participantId = window.localStorage.getItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY);
      } catch {
        participantId = null;
      }

      let loaded: AfterpartyParticipant | null = null;
      if (participantId) {
        const { data, error: participantError } = await supabase
          .from('afterparty_participants')
          .select('id, display_name, troop_name')
          .eq('id', participantId)
          .maybeSingle();
        if (participantError) {
          throw participantError;
        }
        loaded = (data as AfterpartyParticipant | null) ?? null;
      }

      if (loaded) {
        setParticipant(loaded);
        setProfileForm({
          displayName: loaded.display_name,
          troopName: normalizeAfterpartyTroopName(loaded.troop_name),
        });
        setProfileEditing(false);
        await loadOrders(loaded.id);
      } else {
        try {
          window.localStorage.removeItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY);
        } catch {
          // Ignore blocked localStorage.
        }
        setParticipant(null);
        setOrders([]);
        setProfileEditing(true);
      }
      await loadLeaderboards();
    } catch (loadError) {
      console.error('Failed to load afterparty league', loadError);
      setError('Online liga se nepodařila načíst. Zkontroluj připojení a zkus to znovu.');
    } finally {
      setLoading(false);
    }
  }, [loadLeaderboards, loadOrders]);

  useEffect(() => {
    void loadOnlineState();
  }, [loadOnlineState]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = profileForm.displayName.trim();
    const troopName = profileForm.troopName.trim();
    if (!displayName || !troopName) {
      setError('Vyplň jméno nebo přezdívku i oddíl.');
      return;
    }

    setProfileSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { display_name: displayName, troop_name: troopName };
      const result = participant
        ? await supabase
            .from('afterparty_participants')
            .update(payload)
            .eq('id', participant.id)
            .select('id, display_name, troop_name')
            .single()
        : await supabase
            .from('afterparty_participants')
            .insert(payload)
            .select('id, display_name, troop_name')
            .single();
      if (result.error) {
        throw result.error;
      }
      const saved = result.data as AfterpartyParticipant;
      setParticipant(saved);
      setProfileForm({
        displayName: saved.display_name,
        troopName: normalizeAfterpartyTroopName(saved.troop_name),
      });
      setProfileEditing(false);
      try {
        window.localStorage.setItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY, saved.id);
      } catch {
        // Profile still works for this session without localStorage.
      }
      setSuccess('Profil je uložený.');
      await loadOrders(saved.id);
      await loadLeaderboards();
    } catch (saveError) {
      console.error('Failed to save afterparty participant', saveError);
      setError('Profil se nepodařilo uložit.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!participant) {
      setError('Nejdřív ulož jméno a oddíl.');
      setProfileEditing(true);
      return;
    }
    if (draftEntries.length === 0) {
      setError('Přidej aspoň jednu položku.');
      return;
    }
    if (!receiptFile) {
      setError('Vyfoť nebo nahraj účtenku.');
      return;
    }
    if (!receiptFile.type.startsWith('image/') && receiptFile.type !== 'application/pdf') {
      setError('Účtenka musí být obrázek nebo PDF.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const receiptPath = createAfterpartyReceiptPath(participant.id, receiptFile);
      const { error: uploadError } = await supabase.storage
        .from(AFTERPARTY_RECEIPTS_BUCKET)
        .upload(receiptPath, receiptFile, { contentType: receiptFile.type || undefined, upsert: false });
      if (uploadError) {
        throw uploadError;
      }

      const { data: order, error: orderError } = await supabase
        .from('afterparty_orders')
        .insert({ participant_id: participant.id, receipt_path: receiptPath, status: 'pending', total_points: 0 })
        .select('id')
        .single();
      if (orderError) {
        throw orderError;
      }

      const orderId = (order as { id: string }).id;
      const rows = draftEntries.map(({ menuItem, quantity }) => ({
        order_id: orderId,
        drink_key: menuItem!.id,
        label: menuItem!.name,
        category: MENU_CATEGORY_LABELS[menuItem!.category],
        quantity,
        approved_quantity: quantity,
        points_each: menuItem!.points,
        points_total: quantity * menuItem!.points,
      }));
      const { error: itemsError } = await supabase.from('afterparty_order_items').insert(rows);
      if (itemsError) {
        throw itemsError;
      }

      onDraftSubmitted();
      setReceiptFile(null);
      setSuccess('Účtenka je odeslaná ke kontrole. Body se připíšou po schválení.');
      await loadOrders(participant.id);
      await loadLeaderboards();
    } catch (submitError) {
      console.error('Failed to submit afterparty order', submitError);
      setError('Účtenku se nepodařilo odeslat.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeLeaderboard = leaderboardMode === 'individuals' ? individualLeaderboard : troopLeaderboard;

  return (
    <>
      {error ? <p className="secret-menu-alert is-error">{error}</p> : null}
      {success ? <p className="secret-menu-alert is-success">{success}</p> : null}

      <section className="secret-menu-card">
        <div className="secret-menu-section-head">
          <div>
            <p className="secret-menu-kicker">Soutěž</p>
            <h3>Můj profil</h3>
          </div>
          {participant && !profileEditing ? (
            <button type="button" className="secret-menu-secondary" onClick={() => setProfileEditing(true)}>
              Upravit
            </button>
          ) : null}
        </div>
        {participant && !profileEditing ? (
          <div className="secret-menu-league-profile">
            <strong>{participant.display_name}</strong>
            <span>{participant.troop_name}</span>
          </div>
        ) : (
          <form className="secret-menu-league-form" onSubmit={handleProfileSubmit}>
            <label className="secret-menu-field">
              <span>Jméno nebo přezdívka</span>
              <input
                type="text"
                value={profileForm.displayName}
                maxLength={80}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </label>
            <label className="secret-menu-field">
              <span>Oddíl</span>
              <select
                value={profileForm.troopName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, troopName: event.target.value }))}
              >
                <option value="">Vyber oddíl</option>
                {AFTERPARTY_TROOP_OPTIONS.map((troopName) => (
                  <option key={troopName} value={troopName}>
                    {troopName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="secret-menu-primary" disabled={profileSaving}>
              {profileSaving ? 'Ukládám…' : 'Uložit profil'}
            </button>
          </form>
        )}
      </section>

      <section className="secret-menu-card">
        <p className="secret-menu-kicker">Účtenka</p>
        <h3>Co jsem si dal</h3>
        {draftEntries.length === 0 ? (
          <p className="secret-menu-muted">Vyber položky níže v sekci „Přidat položku“ a pak nahraj účtenku.</p>
        ) : (
          <div className="secret-menu-history">
            {draftEntries.map(({ menuItem, quantity }) => (
              <div key={menuItem!.id} className="secret-menu-history-row">
                <span>
                  <strong>{menuItem!.name}</strong>
                  <small>
                    {MENU_CATEGORY_LABELS[menuItem!.category]} · {menuItem!.points} bodů za kus
                  </small>
                </span>
                <span className="secret-menu-stepper">
                  <button type="button" aria-label="Ubrat" onClick={() => onDraftChange(menuItem!.id, -1)}>
                    −
                  </button>
                  <strong>{quantity}</strong>
                  <button type="button" aria-label="Přidat" onClick={() => onDraftChange(menuItem!.id, 1)}>
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        {draftEntries.length > 0 ? (
          <div className="secret-menu-submit-box">
            <p>
              {draftSummary.items} položek za <strong>{draftSummary.points} bodů</strong>
            </p>
            <label className="secret-menu-field">
              <span>Fotka účtenky</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {receiptFile ? <p className="secret-menu-muted">Vybráno: {receiptFile.name}</p> : null}
            <button type="button" className="secret-menu-primary" onClick={handleSubmitOrder} disabled={submitting}>
              {submitting ? 'Odesílám…' : 'Odeslat ke kontrole'}
            </button>
            <button type="button" className="secret-menu-secondary" onClick={onDraftDiscard} disabled={submitting}>
              Vyprázdnit
            </button>
          </div>
        ) : null}
      </section>

      <section className="secret-menu-card">
        <div className="secret-menu-section-head">
          <div>
            <p className="secret-menu-kicker">Historie</p>
            <h3>Moje účtenky</h3>
          </div>
          <button type="button" className="secret-menu-secondary" onClick={() => void loadOnlineState()} disabled={loading}>
            {loading ? 'Načítám…' : 'Obnovit'}
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="secret-menu-muted">Zatím nemáš žádnou odeslanou účtenku.</p>
        ) : (
          <div className="secret-menu-history">
            {orders.map((order) => (
              <div key={order.id} className={`secret-menu-order is-${order.status}`}>
                <div className="secret-menu-order-head">
                  <strong>{formatAfterpartyStatus(order.status)}</strong>
                  <small>{formatAfterpartyDate(order.submitted_at)}</small>
                </div>
                <p>
                  {order.status === 'approved'
                    ? `${order.total_points} bodů`
                    : order.status === 'rejected'
                      ? 'Bez bodů'
                      : 'Body se připíšou po kontrole'}
                </p>
                <small>
                  {(order.afterparty_order_items ?? [])
                    .map((item) => `${item.label} × ${order.status === 'approved' ? item.approved_quantity : item.quantity}`)
                    .join(', ')}
                </small>
                {order.review_note ? <p className="secret-menu-muted">{order.review_note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="secret-menu-card">
        <div className="secret-menu-section-head">
          <div>
            <p className="secret-menu-kicker">Leaderboard</p>
            <h3>Pořadí</h3>
          </div>
          <div className="secret-menu-tabs secret-menu-segmented">
            <button
              type="button"
              className={leaderboardMode === 'individuals' ? 'is-active' : ''}
              onClick={() => setLeaderboardMode('individuals')}
            >
              Lidi
            </button>
            <button
              type="button"
              className={leaderboardMode === 'troops' ? 'is-active' : ''}
              onClick={() => setLeaderboardMode('troops')}
            >
              Oddíly
            </button>
          </div>
        </div>
        {activeLeaderboard.length === 0 ? (
          <p className="secret-menu-muted">Zatím nejsou potvrzené žádné body.</p>
        ) : (
          <ol className="secret-menu-leaderboard">
            {leaderboardMode === 'individuals'
              ? (activeLeaderboard as AfterpartyIndividualLeaderboardRow[]).map((row) => (
                  <li key={row.participant_id} className={row.participant_id === participant?.id ? 'is-me' : ''}>
                    <span>
                      <strong>{row.display_name}</strong>
                      <small>{row.troop_name}</small>
                    </span>
                    <strong>{row.total_points}</strong>
                  </li>
                ))
              : (activeLeaderboard as AfterpartyTroopLeaderboardRow[]).map((row) => (
                  <li key={row.troop_name} className={row.troop_name === participant?.troop_name ? 'is-me' : ''}>
                    <span>
                      <strong>{row.troop_name}</strong>
                      <small>{row.participants} lidí</small>
                    </span>
                    <strong>{row.total_points}</strong>
                  </li>
                ))}
          </ol>
        )}
      </section>
    </>
  );
}
