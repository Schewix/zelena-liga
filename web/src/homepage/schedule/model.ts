import {
type ScheduleEvent,
type ScheduleEventKind
} from '../../data/schedule';

// Záložní seznam pro případ, že se termíny z /api/content/schedule nenačtou.
export const FALLBACK_SCHEDULE_EVENTS: ScheduleEvent[] = [
  { name: 'Sněm SPTO', start: '2026-09-08', kind: 'assembly' },
  { name: 'ZaPsem', start: '2026-10-03', kind: 'event', href: '/souteze/zapsem' },
  { name: 'Štáb SPTO', start: '2026-10-13', kind: 'staff' },
  { name: 'Štáb SPTO', start: '2026-11-10', kind: 'staff' },
  { name: 'Štáb SPTO', start: '2026-12-08', kind: 'staff' },
  { name: 'Sněm SPTO', start: '2027-01-12', kind: 'assembly' },
  { name: 'Štáb SPTO', start: '2027-02-02', kind: 'staff' },
  { name: 'Deskové hry', start: '2027-02-13', kind: 'event', href: '/souteze/deskove-hry' },
  { name: 'Sněm SPTO', start: '2027-03-09', kind: 'assembly' },
  { name: 'Štáb SPTO', start: '2027-04-06', kind: 'staff' },
  { name: 'Setonův závod', start: '2027-04-24', kind: 'event', href: '/souteze/setonuv-zavod' },
  { name: 'Štáb SPTO', start: '2027-05-04', kind: 'staff' },
  { name: 'Sraz PTO', start: '2027-05-21', end: '2027-05-23', kind: 'event' },
  { name: 'Sněm SPTO', start: '2027-06-15', kind: 'assembly', note: 'Grilovací sněm' },
];

export const SCHEDULE_KIND_LABELS: Record<ScheduleEventKind, string> = {
  event: 'Akce',
  assembly: 'Sněm',
  staff: 'Štáb',
};

export function parseScheduleDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatScheduleDate(event: ScheduleEvent) {
  const formatter = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const start = parseScheduleDate(event.start);
  if (!event.end) return formatter.format(start);
  const end = parseScheduleDate(event.end);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}.–${formatter.format(end)}`;
  }
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

// Kompaktní datum do dlaždice seznamu: velké číslo dne a pod ním měsíc s rokem.
export function formatScheduleDateParts(event: ScheduleEvent) {
  const shortMonth = new Intl.DateTimeFormat('cs-CZ', { month: 'short' });
  const weekdayFormatter = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long' });
  const start = parseScheduleDate(event.start);
  const end = event.end ? parseScheduleDate(event.end) : null;
  if (!end) {
    return {
      day: `${start.getDate()}.`,
      month: `${shortMonth.format(start)} ${start.getFullYear()}`,
      weekday: weekdayFormatter.format(start),
    };
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return {
    day: sameMonth
      ? `${start.getDate()}.–${end.getDate()}.`
      : `${start.getDate()}. ${shortMonth.format(start)} – ${end.getDate()}.`,
    month: sameMonth
      ? `${shortMonth.format(start)} ${start.getFullYear()}`
      : `${shortMonth.format(end)} ${end.getFullYear()}`,
    weekday: null,
  };
}

export function eventOccursOn(event: ScheduleEvent, date: Date) {
  const timestamp = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return timestamp >= parseScheduleDate(event.start).getTime()
    && timestamp <= parseScheduleDate(event.end ?? event.start).getTime();
}

export const SCHEDULE_MONTHS_IN_SCHOOL_YEAR = 10;

// Školní rok začíná v září, takže leden až srpen ještě patří k ročníku, který začal loni.
export function resolveSchoolYearStart(today: Date) {
  return today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
}

export function buildScheduleMonths(schoolYearStart: number) {
  return Array.from({ length: SCHEDULE_MONTHS_IN_SCHOOL_YEAR }, (_, index) => {
    const date = new Date(schoolYearStart, 8 + index, 1);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      label: new Intl.DateTimeFormat('cs-CZ', { month: 'long' }).format(date),
    };
  });
}

// Prázdniny mimo rozsah kalendáře spadnou na první měsíc, jinak otevřeme aktuální.
export function resolveCurrentMonthIndex(months: { year: number; month: number }[], today: Date) {
  const index = months.findIndex(
    (entry) => entry.year === today.getFullYear() && entry.month === today.getMonth(),
  );
  return index >= 0 ? index : 0;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function scheduleEventEnd(event: ScheduleEvent) {
  return parseScheduleDate(event.end ?? event.start);
}

export function scheduleDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
