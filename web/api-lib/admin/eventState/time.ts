

export const PRAGUE_TIME_ZONE = 'Europe/Prague';

export function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function zonedTimeToUtcIso(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
) {
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const zoned = getDatePartsInTimeZone(utcGuess, timeZone);
  const zonedAsUtcMs = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  const shiftMs = zonedAsUtcMs - utcGuess.getTime();
  return new Date(utcGuess.getTime() - shiftMs).toISOString();
}

export function buildDefaultLockAtIso(now = new Date()) {
  const dayParts = getDatePartsInTimeZone(now, PRAGUE_TIME_ZONE);
  const closingAtIso = zonedTimeToUtcIso(PRAGUE_TIME_ZONE, {
    year: dayParts.year,
    month: dayParts.month,
    day: dayParts.day,
    hour: 16,
    minute: 0,
    second: 0,
  });
  const closingAtMs = Date.parse(closingAtIso);
  const lockAtMs = Number.isFinite(closingAtMs) ? Math.min(now.getTime(), closingAtMs) : now.getTime();
  return new Date(lockAtMs).toISOString();
}
