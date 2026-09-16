export type ScheduleEventKind = 'event' | 'assembly' | 'staff';

export type ScheduleEvent = {
  name: string;
  start: string;
  end?: string | null;
  kind: ScheduleEventKind;
  note?: string | null;
  href?: string | null;
};

const SCHEDULE_KINDS: ScheduleEventKind[] = ['event', 'assembly', 'staff'];

function isScheduleKind(value: unknown): value is ScheduleEventKind {
  return typeof value === 'string' && (SCHEDULE_KINDS as string[]).includes(value);
}

// Ze serveru bereme jen záznamy, které mají název a datum — bez nich je termín k ničemu.
function normalizeEvent(raw: unknown): ScheduleEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name.length === 0) return null;
  if (typeof value.start !== 'string' || value.start.length === 0) return null;
  return {
    name: value.name,
    start: value.start,
    end: typeof value.end === 'string' ? value.end : null,
    kind: isScheduleKind(value.kind) ? value.kind : 'event',
    note: typeof value.note === 'string' ? value.note : null,
    href: typeof value.href === 'string' ? value.href : null,
  };
}

export function sortScheduleEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchScheduleEvents(): Promise<ScheduleEvent[] | null> {
  let response: Response;
  try {
    response = await fetch('/api/content/schedule');
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: { events?: unknown };
  try {
    payload = (await response.json()) as { events?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(payload.events)) return null;
  const events = payload.events.map(normalizeEvent).filter((event): event is ScheduleEvent => event !== null);
  // Prázdná odpověď znamená nenasazenou migraci, ne prázdný kalendář — ať zůstane vestavěný seznam.
  if (events.length === 0) return null;
  return sortScheduleEvents(events);
}
