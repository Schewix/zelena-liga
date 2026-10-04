import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/context';
import {
  MENU_CATEGORY_LABELS,
  MENU_CATEGORY_ORDER,
  MENU_ITEM_BY_ID,
  MENU_ITEMS,
  type MenuCategory,
  type MenuItem,
} from '../data/menuItems';
import {
  addConsumedItem,
  createEmptySecretMenuState,
  createStateFromApprovedOrders,
  getProgressToNextLevel,
  getStatistics,
  getUserLevel,
  normalizeSecretMenuState,
  removeConsumedItem,
  type SecretMenuState,
} from './gamification';
import type { AfterpartyOrderRow } from '../homepage/afterparty/model';
import SecretMenuLeague, { getLeagueDraftSummary, type LeagueDraft } from './SecretMenuLeague';
import './SecretMenuGame.css';

type SecretMenuMode = 'play' | 'league';

const SECRET_MENU_STORAGE_PREFIX = 'zl-secret-menu-game-v1';
const ANONYMOUS_SECRET_MENU_STORAGE_ID = 'anonymous';
const LEAGUE_DRAFT_STORAGE_KEY = 'zl-secret-menu-league-draft-v1';

function loadLeagueDraft(): LeagueDraft {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEAGUE_DRAFT_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([itemId, quantity]) => MENU_ITEM_BY_ID.has(itemId) && typeof quantity === 'number' && quantity > 0,
      ),
    ) as LeagueDraft;
  } catch {
    return {};
  }
}

function createStorageKey(userId: string) {
  return `${SECRET_MENU_STORAGE_PREFIX}:${userId}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCategoryItems(category: MenuCategory) {
  return MENU_ITEMS.filter((menuItem) => menuItem.category === category);
}

function categoryLabel(category: MenuCategory) {
  return MENU_CATEGORY_LABELS[category];
}

function SecretMenuItemButton({
  item,
  consumedCount,
  showFirstTimeBonus,
  onAdd,
  onRemove,
}: {
  item: MenuItem;
  consumedCount: number;
  showFirstTimeBonus: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="secret-menu-item-wrap">
      <button type="button" className="secret-menu-item" onClick={onAdd}>
        <span>
          <strong>{item.name}</strong>
          <small>
            {item.points} bodů{showFirstTimeBonus && consumedCount === 0 ? ' · první ochutnání +20' : ''}
          </small>
        </span>
        <span className={consumedCount > 0 ? 'secret-menu-count is-active' : 'secret-menu-count'}>
          ×{consumedCount}
        </span>
      </button>
      {consumedCount > 0 ? (
        <button
          type="button"
          className="secret-menu-item-minus"
          aria-label={`Ubrat ${item.name}`}
          onClick={onRemove}
        >
          −
        </button>
      ) : null}
    </div>
  );
}

export default function SecretMenuGame({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status } = useAuth();
  const [activeCategory, setActiveCategory] = useState<MenuCategory>('draft-beer');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SecretMenuState>(() => createEmptySecretMenuState());
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [mode, setMode] = useState<SecretMenuMode>('play');
  const [leagueOrders, setLeagueOrders] = useState<AfterpartyOrderRow[]>([]);
  const [leagueDraft, setLeagueDraft] = useState<LeagueDraft>(() => loadLeagueDraft());

  const storageKey =
    status.state === 'authenticated'
      ? createStorageKey(status.manifest.judge.id || status.manifest.judge.email)
      : createStorageKey(ANONYMOUS_SECRET_MENU_STORAGE_ID);

  useEffect(() => {
    if (!open || !storageKey || loadedStorageKey === storageKey) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      setState(raw ? normalizeSecretMenuState(JSON.parse(raw)) : createEmptySecretMenuState());
    } catch {
      setState(createEmptySecretMenuState());
    }
    setLoadedStorageKey(storageKey);
  }, [loadedStorageKey, open, storageKey]);

  useEffect(() => {
    if (!open || !storageKey || loadedStorageKey !== storageKey) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [loadedStorageKey, open, state, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEAGUE_DRAFT_STORAGE_KEY, JSON.stringify(leagueDraft));
    } catch {
      // Ignore localStorage write errors in private browsing or blocked contexts.
    }
  }, [leagueDraft]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  const leagueState = useMemo(
    () =>
      createStateFromApprovedOrders(
        leagueOrders
          .filter((order) => order.status === 'approved')
          .map((order) => ({
            orderId: order.id,
            at: order.reviewed_at ?? order.submitted_at,
            items: (order.afterparty_order_items ?? []).map((item) => ({
              drinkKey: item.drink_key,
              quantity: item.approved_quantity,
            })),
          })),
      ),
    [leagueOrders],
  );
  const leagueApprovedPoints = useMemo(
    () =>
      leagueOrders
        .filter((order) => order.status === 'approved')
        .reduce((sum, order) => sum + order.total_points, 0),
    [leagueOrders],
  );
  const statistics = useMemo(() => {
    const base = getStatistics(mode === 'league' ? leagueState : state);
    if (mode !== 'league') {
      return base;
    }
    const totalPoints =
      leagueApprovedPoints + base.unlockedAchievements.reduce((sum, achievement) => sum + achievement.bonusPoints, 0);
    return {
      ...base,
      totalPoints,
      currentLevel: getUserLevel(totalPoints),
      progressToNextLevel: getProgressToNextLevel(totalPoints),
    };
  }, [leagueApprovedPoints, leagueState, mode, state]);
  const handleLeagueOrdersChange = useCallback((orders: AfterpartyOrderRow[]) => setLeagueOrders(orders), []);
  const consumedCounts = useMemo(() => {
    return state.consumedItems.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.itemId] = (acc[entry.itemId] ?? 0) + 1;
      return acc;
    }, {});
  }, [state.consumedItems]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('cs');
    return getCategoryItems(activeCategory).filter((item) => {
      if (!normalizedQuery) {
        return true;
      }
      return item.name.toLocaleLowerCase('cs').includes(normalizedQuery);
    });
  }, [activeCategory, query]);

  if (!open) {
    return null;
  }

  const removeLatestEntries = (current: SecretMenuState, itemId: string, count: number): SecretMenuState => {
    let next = current;
    for (let i = 0; i < count; i += 1) {
      const entry = [...next.consumedItems].reverse().find((candidate) => candidate.itemId === itemId);
      if (!entry) {
        break;
      }
      next = removeConsumedItem(next, entry.id);
    }
    return next;
  };

  const adjustDraft = (itemId: string, delta: number) => {
    setLeagueDraft((current) => {
      const quantity = Math.max(0, (current[itemId] ?? 0) + delta);
      const next = { ...current };
      if (quantity > 0) {
        next[itemId] = quantity;
      } else {
        delete next[itemId];
      }
      return next;
    });
  };

  const handleAddItem = (itemId: string) => {
    if (mode === 'league') {
      adjustDraft(itemId, 1);
      return;
    }
    setState((current) => addConsumedItem(current, itemId));
  };

  const handleRemoveItem = (itemId: string) => {
    if (mode === 'league' && !(leagueDraft[itemId] > 0)) {
      return;
    }
    if (mode === 'league') {
      adjustDraft(itemId, -1);
      return;
    }
    setState((current) => removeLatestEntries(current, itemId, 1));
  };

  const handleDraftChange = (itemId: string, delta: number) => {
    if (delta > 0) {
      handleAddItem(itemId);
    } else {
      handleRemoveItem(itemId);
    }
  };

  const handleDraftDiscard = () => {
    setLeagueDraft({});
  };

  const leagueDraftSummary = getLeagueDraftSummary(leagueDraft);

  const handleRemoveEntry = (entryId: string) => {
    setState((current) => removeConsumedItem(current, entryId));
  };

  const profile =
    status.state === 'authenticated'
      ? {
          name: status.manifest.judge.displayName,
          email: status.manifest.judge.email,
          station: `${status.manifest.station.name} (${status.manifest.station.code})`,
          event: status.manifest.event.name,
        }
      : {
          name: 'Anonymní host',
          email: 'Progres se ukládá jen v tomto prohlížeči.',
          station: 'Bez přihlášení',
          event: '"Zelená" liga',
        };

  return (
    <div className="secret-menu-overlay" role="dialog" aria-modal="true" aria-labelledby="secret-menu-title">
      <div className="secret-menu-panel">
        <header className="secret-menu-header">
          <div>
            <p className="secret-menu-kicker">Secret section</p>
            <h2 id="secret-menu-title">&quot;Zelená&quot; liga</h2>
          </div>
          <button type="button" className="secret-menu-close" onClick={onClose}>
            Zavřít
          </button>
        </header>

        <div className="secret-menu-mode-switch" role="tablist" aria-label="Režim">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'play'}
            className={mode === 'play' ? 'is-active' : ''}
            onClick={() => setMode('play')}
          >
            Jen počítat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'league'}
            className={mode === 'league' ? 'is-active' : ''}
            onClick={() => setMode('league')}
          >
            Soutěžit
            {leagueDraftSummary.items > 0 ? ` (${leagueDraftSummary.items})` : ''}
          </button>
        </div>

        {mode === 'league' ? (
          <SecretMenuLeague
            draft={leagueDraft}
            onDraftChange={handleDraftChange}
            onDraftDiscard={handleDraftDiscard}
            onDraftSubmitted={() => setLeagueDraft({})}
            onOrdersChange={handleLeagueOrdersChange}
          />
        ) : null}

        <section className="secret-menu-hero">
          <article className="secret-menu-card secret-menu-profile">
            <p className="secret-menu-kicker">Profil</p>
            <h3>{profile.name}</h3>
            <p>{profile.email}</p>
            <p>{profile.station}</p>
            <p>{profile.event}</p>
          </article>

          <article className="secret-menu-card secret-menu-score">
            <p className="secret-menu-kicker">Body a level</p>
            <div className="secret-menu-score-main">
              <strong>{statistics.totalPoints}</strong>
              <span>bodů</span>
            </div>
            <h3>{statistics.progressToNextLevel.currentLevel.name}</h3>
            <div className="secret-menu-progress">
              <span style={{ width: `${statistics.progressToNextLevel.progressPercent}%` }} />
            </div>
            {statistics.progressToNextLevel.nextLevel ? (
              <p>
                Do levelu {statistics.progressToNextLevel.nextLevel.name} zbývá{' '}
                <strong>{statistics.progressToNextLevel.pointsNeededForNextLevel}</strong> bodů.
              </p>
            ) : (
              <p>Jsi na nejvyšším levelu. To už není tajné menu, to je životní styl.</p>
            )}
          </article>

          <article className="secret-menu-card secret-menu-score">
            <p className="secret-menu-kicker">Dokončení menu</p>
            <div className="secret-menu-score-main">
              <strong>{statistics.menuCompletion.percent}%</strong>
            </div>
            <p>
              {statistics.menuCompletion.consumedItems} z {statistics.menuCompletion.totalItems} položek
              {mode === 'league' ? ` · ${statistics.unlockedAchievements.length} achievementů odemčeno` : ''}
            </p>
          </article>
        </section>

        <section className="secret-menu-card">
          <div className="secret-menu-section-head">
            <div>
              <p className="secret-menu-kicker">{mode === 'league' ? 'Účtenka' : 'Sbírka'}</p>
              <h3>Přidat položku</h3>
            </div>
            <label className="secret-menu-search">
              <span>Hledat</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Název položky"
              />
            </label>
          </div>

          <div className="secret-menu-tabs" role="tablist" aria-label="Kategorie tajného menu">
            {MENU_CATEGORY_ORDER.map((category) => (
              <button
                key={category}
                type="button"
                className={category === activeCategory ? 'is-active' : ''}
                onClick={() => setActiveCategory(category)}
              >
                {categoryLabel(category)}
              </button>
            ))}
          </div>

          <div className="secret-menu-items">
            {visibleItems.map((item) => (
              <SecretMenuItemButton
                key={item.id}
                item={item}
                consumedCount={mode === 'league' ? (leagueDraft[item.id] ?? 0) : (consumedCounts[item.id] ?? 0)}
                showFirstTimeBonus={mode === 'play'}
                onAdd={() => handleAddItem(item.id)}
                onRemove={() => handleRemoveItem(item.id)}
              />
            ))}
          </div>
        </section>

        {mode === 'league' ? (
        <section className="secret-menu-grid">
          <article className="secret-menu-card">
            <p className="secret-menu-kicker">Achievementy</p>
            <h3>Odměny a postup</h3>
            <div className="secret-menu-achievements">
              {statistics.achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={achievement.unlocked ? 'secret-menu-achievement is-unlocked' : 'secret-menu-achievement'}
                >
                  <div>
                    <strong>{achievement.title}</strong>
                    <span>
                      {achievement.current}/{achievement.target} · +{achievement.bonusPoints} bodů
                    </span>
                  </div>
                  <p>{achievement.description}</p>
                  <div className="secret-menu-progress is-small">
                    <span style={{ width: `${achievement.progressPercent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="secret-menu-card">
            <p className="secret-menu-kicker">Statistiky</p>
            <h3>Kategorie</h3>
            <div className="secret-menu-category-stats">
              {statistics.categoryProgress.map((category) => (
                <div key={category.category} className="secret-menu-category-stat">
                  <strong>{category.label}</strong>
                  <span>
                    {category.consumedItems}/{category.totalItems} položek · {category.totalConsumed}× ·{' '}
                    {category.points} bodů
                  </span>
                  <div className="secret-menu-progress is-small">
                    <span style={{ width: `${category.completionPercent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        ) : null}

        {mode === 'play' ? (
        <section className="secret-menu-card">
          <div className="secret-menu-section-head">
            <div>
              <p className="secret-menu-kicker">Historie</p>
              <h3>Poslední položky</h3>
            </div>
            <p className="secret-menu-muted">
              {statistics.totalConsumed} zápisů · {statistics.visitDays} dní
            </p>
          </div>
          {statistics.history.length === 0 ? (
            <p className="secret-menu-muted">Zatím nic. Tajné menu čeká na první stopu.</p>
          ) : (
            <div className="secret-menu-history">
              {statistics.history.slice(0, 24).map((entry) => (
                <div key={entry.id} className="secret-menu-history-row">
                  <span>
                    <strong>{entry.item?.name}</strong>
                    <small>
                      {entry.item ? categoryLabel(entry.item.category) : 'Neznámá položka'} ·{' '}
                      {formatDateTime(entry.consumedAt)}
                    </small>
                  </span>
                  <button type="button" onClick={() => handleRemoveEntry(entry.id)}>
                    Odebrat
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        ) : null}
      </div>
    </div>
  );
}
