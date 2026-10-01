import {
type TargetAnswerOptionCount
} from '../../utils/targetAnswers';

export const DEFAULT_TARGET_ANSWER_OPTION_COUNT: TargetAnswerOptionCount = 4;

export function toNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toPositiveInt(value: unknown, fallback: number, max = 1000): number {
  const parsed = toNumeric(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

export function toTargetAnswerOptionCount(value: unknown, fallback: TargetAnswerOptionCount = DEFAULT_TARGET_ANSWER_OPTION_COUNT): TargetAnswerOptionCount {
  if (value === 3 || value === '3') {
    return 3;
  }
  if (value === 4 || value === '4') {
    return 4;
  }
  return fallback;
}

export function formatMinutesAsTimeInput(totalMinutes: number): string {
  const safeMinutes = Math.max(1, Math.min(24 * 60, Math.round(totalMinutes)));
  const normalizedMinutes = Math.min(23 * 60 + 59, safeMinutes);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseTimeInputToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return Math.max(1, hours * 60 + minutes);
}
