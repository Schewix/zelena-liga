import {
AFTERPARTY_DRINK_BY_KEY,
AFTERPARTY_DRINK_ITEMS,
AFTERPARTY_DRINK_MENU,
createEmptyAfterpartyCounts
} from '../../afterparty';
import { LEAGUE_TROOPS } from '../league/model';

export const AFTERPARTY_STORAGE_KEY = 'zl-afterparty-counter-v2';

export const AFTERPARTY_PARTICIPANT_STORAGE_KEY = 'zl-afterparty-participant-v1';

export const AFTERPARTY_RECEIPTS_BUCKET = 'afterparty-receipts';

export const AFTERPARTY_TRIGGER_CLICK_COUNT = 5;

export const AFTERPARTY_TRIGGER_WINDOW_MS = 2000;

export type PersonalDrinkKey = string;

export type PersonalDrinkCounts = Record<string, number>;

export type PersonalDrinkStorageState = {
  selected: PersonalDrinkKey[];
  counts: PersonalDrinkCounts;
};

export type AfterpartyParticipant = {
  id: string;
  display_name: string;
  troop_name: string;
};

export type AfterpartyOrderStatus = 'pending' | 'approved' | 'rejected';

export type AfterpartyOrderItemRow = {
  id: string;
  drink_key: string;
  label: string;
  category: string;
  quantity: number;
  approved_quantity: number;
  points_each: number;
  points_total: number;
};

export type AfterpartyOrderRow = {
  id: string;
  participant_id: string;
  status: AfterpartyOrderStatus;
  receipt_path: string;
  total_points: number;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  afterparty_order_items?: AfterpartyOrderItemRow[];
};

export type AfterpartyAdminOrderRow = AfterpartyOrderRow & {
  receipt_signed_url?: string | null;
  afterparty_participants?: AfterpartyParticipant | null;
};

export type AfterpartyIndividualLeaderboardRow = {
  participant_id: string;
  display_name: string;
  troop_name: string;
  total_points: number;
  approved_orders: number;
};

export type AfterpartyTroopLeaderboardRow = {
  troop_name: string;
  total_points: number;
  participants: number;
  approved_orders: number;
};

export type AfterpartyCounterMode = 'counter' | 'league';

export type AfterpartyAdminSessionState = 'checking' | 'unauthorized' | 'authorized';

export type AfterpartyDrinkCategory = (typeof AFTERPARTY_DRINK_MENU)[number]['category'];

export const AFTERPARTY_TROOP_OPTIONS = LEAGUE_TROOPS.map((troop) => troop.name).sort((a, b) => {
  const aMatch = a.match(/^(\d+)\./);
  const bMatch = b.match(/^(\d+)\./);
  const aNumber = aMatch ? Number.parseInt(aMatch[1], 10) : null;
  const bNumber = bMatch ? Number.parseInt(bMatch[1], 10) : null;

  if (aNumber !== null && bNumber !== null) {
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    return a.localeCompare(b, 'cs', { sensitivity: 'base' });
  }
  if (aNumber !== null) {
    return -1;
  }
  if (bNumber !== null) {
    return 1;
  }
  return a.localeCompare(b, 'cs', { sensitivity: 'base' });
});

export function createEmptyPersonalDrinkCounts(): PersonalDrinkCounts {
  return createEmptyAfterpartyCounts();
}

export function isPersonalDrinkKey(value: unknown): value is PersonalDrinkKey {
  return typeof value === 'string' && AFTERPARTY_DRINK_BY_KEY.has(value);
}

export function sanitizePersonalDrinkSelection(value: unknown): PersonalDrinkKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const selected: PersonalDrinkKey[] = [];
  for (const candidate of value) {
    if (isPersonalDrinkKey(candidate) && !selected.includes(candidate)) {
      selected.push(candidate);
    }
  }
  return selected;
}

export function parseAfterpartyNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return fallback;
}

export function normalizeAfterpartyTroopName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return AFTERPARTY_TROOP_OPTIONS.some((option) => option === trimmed) ? trimmed : '';
}

export function loadPersonalDrinkStateFromStorage(): PersonalDrinkStorageState {
  const defaults = createEmptyPersonalDrinkCounts();
  if (typeof window === 'undefined') {
    return { selected: [], counts: defaults };
  }

  try {
    const raw = window.localStorage.getItem(AFTERPARTY_STORAGE_KEY);
    if (!raw) {
      return { selected: [], counts: defaults };
    }

    const parsed = JSON.parse(raw) as unknown;
    const parsedObject =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : ({} as Record<string, unknown>);
    const parsedCounts =
      parsedObject.counts && typeof parsedObject.counts === 'object'
        ? (parsedObject.counts as Record<string, unknown>)
        : parsedObject;
    const counts: PersonalDrinkCounts = AFTERPARTY_DRINK_ITEMS.reduce<PersonalDrinkCounts>((acc, item) => {
      acc[item.key] = parseAfterpartyNonNegativeInt(parsedCounts[item.key], defaults[item.key]);
      return acc;
    }, {});
    const selected = sanitizePersonalDrinkSelection(parsedObject.selected);
    if (selected.length > 0) {
      return { selected, counts };
    }

    const selectedFromCounts = AFTERPARTY_DRINK_ITEMS.filter((item) => counts[item.key] > 0).map((item) => item.key);
    return { selected: selectedFromCounts, counts };
  } catch {
    return { selected: [], counts: defaults };
  }
}

export function formatAfterpartyDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAfterpartyStatus(status: AfterpartyOrderStatus) {
  if (status === 'approved') {
    return 'Potvrzeno';
  }
  if (status === 'rejected') {
    return 'Zamítnuto';
  }
  return 'Čeká na kontrolu';
}

export function afterpartyDraftKey(orderId: string, itemId: string): string {
  return `${orderId}:${itemId}`;
}

export function getAfterpartyAdminDraftQuantity(
  draftQuantities: Record<string, string>,
  orderId: string,
  item: AfterpartyOrderItemRow,
): number {
  return parseAfterpartyNonNegativeInt(
    draftQuantities[afterpartyDraftKey(orderId, item.id)],
    item.approved_quantity ?? item.quantity ?? 0,
  );
}

export function createAfterpartyReceiptPath(participantId: string, file: File) {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('cs').replace(/[^a-z0-9]/g, '') || 'bin';
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${participantId}/${id}.${extension}`;
}
