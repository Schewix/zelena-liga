import {
useCallback,
useEffect,
useMemo,
useState,
type FormEvent
} from 'react';
import {
AFTERPARTY_DRINK_ITEMS,
AFTERPARTY_DRINK_MENU,
calculateAfterpartyPoints
} from '../../afterparty';
import { supabase } from '../../supabaseClient';
import { AFTERPARTY_PARTICIPANT_STORAGE_KEY,AFTERPARTY_RECEIPTS_BUCKET,AFTERPARTY_STORAGE_KEY,AFTERPARTY_TROOP_OPTIONS,AfterpartyCounterMode,AfterpartyDrinkCategory,AfterpartyIndividualLeaderboardRow,AfterpartyOrderRow,AfterpartyParticipant,AfterpartyTroopLeaderboardRow,createAfterpartyReceiptPath,createEmptyPersonalDrinkCounts,formatAfterpartyDate,formatAfterpartyStatus,loadPersonalDrinkStateFromStorage,normalizeAfterpartyTroopName,PersonalDrinkCounts,PersonalDrinkKey } from './model';

export function AfterpartyCounter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const initialState = useMemo(() => loadPersonalDrinkStateFromStorage(), []);
  const [selectedDrinks, setSelectedDrinks] = useState<PersonalDrinkKey[]>(initialState.selected);
  const [counts, setCounts] = useState<PersonalDrinkCounts>(initialState.counts);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDrinkCategory, setActiveDrinkCategory] = useState<AfterpartyDrinkCategory>(
    AFTERPARTY_DRINK_MENU[0]?.category ?? 'Pivo',
  );
  const [mode, setMode] = useState<AfterpartyCounterMode>('counter');
  const [participant, setParticipant] = useState<AfterpartyParticipant | null>(null);
  const [profileForm, setProfileForm] = useState({ displayName: '', troopName: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<AfterpartyOrderRow[]>([]);
  const [individualLeaderboard, setIndividualLeaderboard] = useState<AfterpartyIndividualLeaderboardRow[]>([]);
  const [troopLeaderboard, setTroopLeaderboard] = useState<AfterpartyTroopLeaderboardRow[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<'individuals' | 'troops'>('individuals');
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [afterpartyError, setAfterpartyError] = useState<string | null>(null);
  const [afterpartySuccess, setAfterpartySuccess] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(AFTERPARTY_STORAGE_KEY, JSON.stringify({ selected: selectedDrinks, counts }));
    } catch {
      // Ignore localStorage write errors in private browsing or blocked contexts.
    }
  }, [counts, selectedDrinks]);

  useEffect(() => {
    if (!open) {
      setMode('counter');
      setMenuOpen(false);
      setAfterpartyError(null);
      setAfterpartySuccess(null);
      return;
    }
    setAfterpartyError(null);
    setAfterpartySuccess(null);
  }, [open]);

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

  const loadParticipantOrders = useCallback(async (participantId: string) => {
    const { data, error } = await supabase
      .from('afterparty_orders')
      .select(
        'id, participant_id, status, receipt_path, total_points, review_note, submitted_at, reviewed_at, afterparty_order_items(id, drink_key, label, category, quantity, approved_quantity, points_each, points_total)',
      )
      .eq('participant_id', participantId)
      .order('submitted_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }
    setOrders((data ?? []) as AfterpartyOrderRow[]);
  }, []);

  const loadAfterpartyOnlineState = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    setLoadingOnline(true);
    setAfterpartyError(null);
    try {
      const participantId = window.localStorage.getItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY);
      let loadedParticipant: AfterpartyParticipant | null = null;

      if (participantId) {
        const { data, error } = await supabase
          .from('afterparty_participants')
          .select('id, display_name, troop_name')
          .eq('id', participantId)
          .maybeSingle();

        if (error) {
          throw error;
        }
        if (data) {
          loadedParticipant = data as AfterpartyParticipant;
          setParticipant(loadedParticipant);
          setProfileForm({
            displayName: loadedParticipant.display_name,
            troopName: normalizeAfterpartyTroopName(loadedParticipant.troop_name),
          });
          setProfileEditing(false);
          await loadParticipantOrders(loadedParticipant.id);
        } else {
          window.localStorage.removeItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY);
          setParticipant(null);
          setOrders([]);
          setProfileEditing(true);
        }
      } else {
        setParticipant(null);
        setOrders([]);
        setProfileEditing(true);
      }

      await loadLeaderboards();
    } catch (error) {
      console.error('Failed to load afterparty league', error);
      setAfterpartyError('Online liga se nepodařila načíst. Zkontroluj připojení a zkus to znovu.');
    } finally {
      setLoadingOnline(false);
    }
  }, [loadLeaderboards, loadParticipantOrders]);

  useEffect(() => {
    if (open && mode === 'league') {
      void loadAfterpartyOnlineState();
    }
  }, [loadAfterpartyOnlineState, mode, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [menuOpen, open, onClose]);

  const adjustDrinkCount = (drink: PersonalDrinkKey, delta: number) => {
    if (!delta) {
      return;
    }
    setCounts((prev) => ({
      ...prev,
      [drink]: Math.max(0, (prev[drink] ?? 0) + delta),
    }));
  };

  const addDrinkOrder = (drink: PersonalDrinkKey) => {
    setSelectedDrinks((prev) => (prev.includes(drink) ? prev : [...prev, drink]));
    setCounts((prev) => ({
      ...prev,
      [drink]: Math.max(0, (prev[drink] ?? 0) + 1),
    }));
    setMenuOpen(false);
  };

  const removeDrink = (drink: PersonalDrinkKey) => {
    setSelectedDrinks((prev) => prev.filter((key) => key !== drink));
    setCounts((prev) => ({
      ...prev,
      [drink]: 0,
    }));
  };

  const handleResetAll = () => {
    const confirmed = window.confirm('Opravdu resetovat celé počítadlo?');
    if (!confirmed) {
      return;
    }
    setCounts(createEmptyPersonalDrinkCounts());
    setSelectedDrinks([]);
    setMenuOpen(false);
  };

  const handleModeChange = (nextMode: AfterpartyCounterMode) => {
    setMode(nextMode);
    setAfterpartyError(null);
    setAfterpartySuccess(null);
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = profileForm.displayName.trim();
    const troopName = profileForm.troopName.trim();
    if (!displayName || !troopName) {
      setAfterpartyError('Vyplň jméno i oddíl.');
      return;
    }

    setProfileSaving(true);
    setAfterpartyError(null);
    setAfterpartySuccess(null);
    try {
      const payload = {
        display_name: displayName,
        troop_name: troopName,
      };
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
      window.localStorage.setItem(AFTERPARTY_PARTICIPANT_STORAGE_KEY, saved.id);
      setAfterpartySuccess('Profil je uložený.');
      await loadParticipantOrders(saved.id);
      await loadLeaderboards();
    } catch (error) {
      console.error('Failed to save afterparty participant', error);
      setAfterpartyError('Profil se nepodařilo uložit.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!participant) {
      setAfterpartyError('Nejdřív ulož jméno a oddíl.');
      setProfileEditing(true);
      return;
    }
    const orderItems = AFTERPARTY_DRINK_ITEMS
      .map((drink) => ({
        drink,
        quantity: Math.max(0, counts[drink.key] ?? 0),
      }))
      .filter((item) => item.quantity > 0);
    if (!orderItems.length) {
      setAfterpartyError('Přidej aspoň jednu položku.');
      return;
    }
    if (!receiptFile) {
      setAfterpartyError('Nahraj fotku nebo PDF účtenky.');
      return;
    }
    const allowedReceipt = receiptFile.type.startsWith('image/') || receiptFile.type === 'application/pdf';
    if (!allowedReceipt) {
      setAfterpartyError('Účtenka musí být obrázek nebo PDF.');
      return;
    }

    setSubmittingOrder(true);
    setAfterpartyError(null);
    setAfterpartySuccess(null);
    try {
      const receiptPath = createAfterpartyReceiptPath(participant.id, receiptFile);
      const { error: uploadError } = await supabase.storage
        .from(AFTERPARTY_RECEIPTS_BUCKET)
        .upload(receiptPath, receiptFile, {
          contentType: receiptFile.type || undefined,
          upsert: false,
        });
      if (uploadError) {
        throw uploadError;
      }

      const { data: order, error: orderError } = await supabase
        .from('afterparty_orders')
        .insert({
          participant_id: participant.id,
          receipt_path: receiptPath,
          status: 'pending',
          total_points: 0,
        })
        .select('id')
        .single();
      if (orderError) {
        throw orderError;
      }

      const orderId = (order as { id: string }).id;
      const rows = orderItems.map(({ drink, quantity }) => ({
        order_id: orderId,
        drink_key: drink.key,
        label: drink.label,
        category: drink.category,
        quantity,
        approved_quantity: quantity,
        points_each: drink.points,
        points_total: quantity * drink.points,
      }));
      const { error: itemsError } = await supabase.from('afterparty_order_items').insert(rows);
      if (itemsError) {
        throw itemsError;
      }

      setCounts(createEmptyPersonalDrinkCounts());
      setSelectedDrinks([]);
      setReceiptFile(null);
      setAfterpartySuccess('Objednávka je odeslaná ke kontrole.');
      await loadParticipantOrders(participant.id);
      await loadLeaderboards();
    } catch (error) {
      console.error('Failed to submit afterparty order', error);
      setAfterpartyError('Objednávku se nepodařilo odeslat.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const selectedItems = AFTERPARTY_DRINK_ITEMS.filter((drink) => selectedDrinks.includes(drink.key));
  const activeCategoryItems = AFTERPARTY_DRINK_ITEMS.filter((drink) => drink.category === activeDrinkCategory);
  const draftPoints = calculateAfterpartyPoints(counts);
  const draftItemCount = selectedItems.reduce((sum, drink) => sum + Math.max(0, counts[drink.key] ?? 0), 0);
  const activeLeaderboard =
    leaderboardMode === 'individuals' ? individualLeaderboard : troopLeaderboard;

  if (!open) {
    return null;
  }

  return (
    <div
      className="homepage-afterparty-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="afterparty-counter-title"
      onClick={onClose}
    >
      <div className="homepage-afterparty-panel" onClick={(event) => event.stopPropagation()}>
        <div className="homepage-afterparty-header">
          <h2 id="afterparty-counter-title">Pivečko počítadlo</h2>
          <button type="button" className="homepage-afterparty-close" onClick={onClose}>
            Zavřít
          </button>
        </div>

        <div className="homepage-afterparty-mode-switch homepage-afterparty-segmented" aria-label="Režim počítadla">
          <button
            type="button"
            className={mode === 'counter' ? 'is-active' : ''}
            onClick={() => handleModeChange('counter')}
          >
            Jen počítat
          </button>
          <button
            type="button"
            className={mode === 'league' ? 'is-active' : ''}
            onClick={() => handleModeChange('league')}
          >
            Soutěžit
          </button>
        </div>

        {afterpartyError ? <p className="homepage-afterparty-alert is-error">{afterpartyError}</p> : null}
        {afterpartySuccess ? <p className="homepage-afterparty-alert is-success">{afterpartySuccess}</p> : null}
        {loadingOnline && mode === 'league' ? (
          <p className="homepage-afterparty-empty">Načítám online ligu…</p>
        ) : null}

        {mode === 'league' ? (
          <section className="homepage-afterparty-section">
            <div className="homepage-afterparty-section-head">
              <h3>Profil</h3>
              {participant && !profileEditing ? (
                <button type="button" className="homepage-afterparty-inline-button" onClick={() => setProfileEditing(true)}>
                  Upravit
                </button>
              ) : null}
            </div>
            {participant && !profileEditing ? (
              <div className="homepage-afterparty-profile-summary">
                <strong>{participant.display_name}</strong>
                <span>{participant.troop_name}</span>
              </div>
            ) : (
              <form className="homepage-afterparty-profile-form" onSubmit={handleProfileSubmit}>
                <label>
                  <span>Jméno</span>
                  <input
                    type="text"
                    value={profileForm.displayName}
                    maxLength={80}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  />
                </label>
                <label>
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
                <button type="submit" className="homepage-afterparty-add-order" disabled={profileSaving}>
                  {profileSaving ? 'Ukládám…' : 'Uložit profil'}
                </button>
              </form>
            )}
          </section>
        ) : null}

        <section className="homepage-afterparty-section homepage-afterparty-section-users">
          <div className="homepage-afterparty-section-head">
            <h3>Moje počítadlo</h3>
            <button type="button" className="homepage-afterparty-add-order" onClick={() => setMenuOpen(true)}>
              + Přidat položku
            </button>
          </div>
          {selectedItems.length === 0 ? (
            <p className="homepage-afterparty-empty">Zatím nic nepřidaného.</p>
          ) : (
            <div className="homepage-afterparty-drink-grid">
              {selectedItems.map((drink) => (
                <article
                  key={drink.key}
                  className="homepage-afterparty-drink-cell"
                  role="button"
                  tabIndex={0}
                  onClick={() => adjustDrinkCount(drink.key, 1)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      adjustDrinkCount(drink.key, 1);
                    }
                  }}
                >
                  <div className="homepage-afterparty-drink-top">
                    <h4>{drink.label}</h4>
                    <strong>{counts[drink.key]}</strong>
                  </div>
                  {mode === 'league' ? (
                    <p className="homepage-afterparty-card-meta">{drink.points} bodů za kus</p>
                  ) : null}
                  <div className="homepage-afterparty-drink-actions">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        adjustDrinkCount(drink.key, -1);
                      }}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        adjustDrinkCount(drink.key, 1);
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="homepage-afterparty-remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeDrink(drink.key);
                      }}
                    >
                      Odebrat položku
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="homepage-afterparty-reset-wrap">
            <button type="button" className="homepage-afterparty-reset" onClick={handleResetAll}>
              Resetovat vše
            </button>
          </div>
          {mode === 'league' && draftItemCount > 0 ? (
            <div className="homepage-afterparty-submit-box">
              <p>
                Aktuálně {draftItemCount} položek za <strong>{draftPoints} bodů</strong>.
              </p>
              <label className="homepage-afterparty-file-field">
                <span>Účtenka</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {receiptFile ? <p className="homepage-afterparty-empty">Vybráno: {receiptFile.name}</p> : null}
              <button
                type="button"
                className="homepage-afterparty-add-order"
                onClick={handleSubmitOrder}
                disabled={submittingOrder}
              >
                {submittingOrder ? 'Odesílám…' : 'Zaplaceno a odeslat ke kontrole'}
              </button>
            </div>
          ) : null}
        </section>

        {mode === 'league' ? (
          <>
            <section className="homepage-afterparty-section">
              <div className="homepage-afterparty-section-head">
                <h3>Moje účtenky</h3>
                <button
                  type="button"
                  className="homepage-afterparty-inline-button"
                  onClick={loadAfterpartyOnlineState}
                  disabled={loadingOnline}
                >
                  {loadingOnline ? 'Načítám…' : 'Obnovit'}
                </button>
              </div>
              {orders.length === 0 ? (
                <p className="homepage-afterparty-empty">Zatím nemáš žádnou odeslanou účtenku.</p>
              ) : (
                <div className="homepage-afterparty-order-list">
                  {orders.map((order) => (
                    <article key={order.id} className={`homepage-afterparty-order is-${order.status}`}>
                      <div className="homepage-afterparty-order-head">
                        <strong>{formatAfterpartyStatus(order.status)}</strong>
                        <span>{formatAfterpartyDate(order.submitted_at)}</span>
                      </div>
                      <p>
                        {order.status === 'approved'
                          ? `${order.total_points} bodů`
                          : order.status === 'rejected'
                            ? 'Bez bodů'
                            : 'Body se připíšou po kontrole'}
                      </p>
                      <div className="homepage-afterparty-order-items">
                        {(order.afterparty_order_items ?? []).map((item) => (
                          <span key={item.id}>
                            {item.label} × {order.status === 'approved' ? item.approved_quantity : item.quantity}
                          </span>
                        ))}
                      </div>
                      {order.review_note ? <p className="homepage-afterparty-empty">{order.review_note}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="homepage-afterparty-section">
              <div className="homepage-afterparty-section-head">
                <h3>Pořadí</h3>
                <div className="homepage-afterparty-segmented">
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
                <p className="homepage-afterparty-empty">Zatím nejsou potvrzené žádné body.</p>
              ) : (
                <ol className="homepage-afterparty-leaderboard">
                  {leaderboardMode === 'individuals'
                    ? (activeLeaderboard as AfterpartyIndividualLeaderboardRow[]).map((row) => (
                      <li key={row.participant_id}>
                        <span>
                          <strong>{row.display_name}</strong>
                          <small>{row.troop_name}</small>
                        </span>
                        <strong>{row.total_points}</strong>
                      </li>
                    ))
                    : (activeLeaderboard as AfterpartyTroopLeaderboardRow[]).map((row) => (
                      <li key={row.troop_name}>
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
        ) : null}

        {menuOpen ? (
          <div className="homepage-afterparty-menu-backdrop" onClick={() => setMenuOpen(false)}>
            <div
              className="homepage-afterparty-menu-panel"
              role="dialog"
              aria-label="Přidat položku"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="homepage-afterparty-menu-header">
                <h3>Přidat položku</h3>
                <button type="button" className="homepage-afterparty-close" onClick={() => setMenuOpen(false)}>
                  Zavřít
                </button>
              </div>

              <div className="homepage-afterparty-category-tabs" role="tablist" aria-label="Kategorie položek">
                {AFTERPARTY_DRINK_MENU.map((section) => {
                  const isActive = section.category === activeDrinkCategory;
                  return (
                    <button
                      key={section.category}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`homepage-afterparty-category-tab${isActive ? ' is-active' : ''}`}
                      onClick={() => setActiveDrinkCategory(section.category)}
                    >
                      {section.category}
                    </button>
                  );
                })}
              </div>

              <div className="homepage-afterparty-menu-block">
                <h4>{activeDrinkCategory}</h4>
                <div className="homepage-afterparty-menu-grid">
                  {activeCategoryItems.map((drink) => (
                    <button
                      key={drink.key}
                      type="button"
                      className="homepage-afterparty-menu-item"
                      onClick={() => addDrinkOrder(drink.key)}
                    >
                      <span>{drink.label}</span>
                      {mode === 'league' ? <small>{drink.points} bodů</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
