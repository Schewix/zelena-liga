

export const WAIT_MINUTES_MAX = 180;

export function formatWaitMinutes(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(WAIT_MINUTES_MAX, Math.round(totalMinutes)));
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (clamped % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const WAIT_TIME_ZERO = formatWaitMinutes(0);

export const WAIT_TIME_MAX = formatWaitMinutes(WAIT_MINUTES_MAX);

export function formatWaitDraft(minutes: number | null | undefined) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return WAIT_TIME_ZERO;
  }
  return formatWaitMinutes(minutes);
}

export function parseWaitDraft(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return NaN;
  }

  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return NaN;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours * 60 + minutes;
  if (!Number.isInteger(total) || total < 0 || total > WAIT_MINUTES_MAX) {
    return NaN;
  }
  return total;
}

export function normalizeWaitInput(value: string, fallback: string) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return WAIT_TIME_ZERO;
  }
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return fallback;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback;
  }
  return formatWaitMinutes(hours * 60 + minutes);
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTimeLabel(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export function formatWaitDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const totalMinutes = Math.floor(safe / 60);
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function toLocalTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parseTimeInput(value: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hStr, mStr] = value.split(':');
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return { hours, minutes };
}

export function combineDateWithTime(
  baseIso: string | null,
  value: string,
  options?: { rolloverToNextDay?: boolean },
) {
  const parsed = parseTimeInput(value);
  if (!parsed) return null;
  const { hours, minutes } = parsed;
  const baseDate = baseIso ? new Date(baseIso) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }
  const candidate = new Date(baseDate);
  candidate.setHours(hours, minutes, 0, 0);
  const rolloverToNextDay = options?.rolloverToNextDay ?? true;
  if (baseIso && rolloverToNextDay) {
    const original = new Date(baseIso);
    if (candidate.getTime() < original.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
  }
  return candidate.toISOString();
}

export function formatDurationMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hoursPrefix = hours > 0 ? `${hours}:` : ''; // omit leading hours if zero
  const minutesValue = hours > 0 ? minutes.toString().padStart(2, '0') : String(minutes);
  return `${hoursPrefix}${minutesValue}:${seconds.toString().padStart(2, '0')}`;
}

export function waitSecondsToMinutes(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  const safeSeconds = Math.floor(seconds);
  return Math.max(0, Math.floor(safeSeconds / 60));
}
