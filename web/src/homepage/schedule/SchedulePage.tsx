import {
useEffect,
useMemo,
useState
} from 'react';
import {
fetchDocuments,
type SptoDocument
} from '../../data/documents';
import {
fetchScheduleEvents,
sortScheduleEvents,
type ScheduleEvent,
type ScheduleEventKind,
} from '../../data/schedule';
import { ScheduleDocumentLinks,eventDocuments,groupDocumentsByEvent } from '../documents/components';
import { SiteShell } from '../layout/SiteShell';
import { FALLBACK_SCHEDULE_EVENTS,SCHEDULE_KIND_LABELS,buildScheduleMonths,eventOccursOn,formatScheduleDate,parseScheduleDate,resolveCurrentMonthIndex,resolveSchoolYearStart,scheduleDateKey,scheduleEventEnd,startOfDay } from './model';
import { ScheduleEventList } from './ScheduleEventList';
import { ScheduleMonth } from './ScheduleMonth';

export function SchedulePage() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const schoolYearStart = resolveSchoolYearStart(today);
  const months = useMemo(() => buildScheduleMonths(schoolYearStart), [schoolYearStart]);
  const [events, setEvents] = useState<ScheduleEvent[]>(() => sortScheduleEvents(FALLBACK_SCHEDULE_EVENTS));
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => resolveCurrentMonthIndex(months, today));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [documents, setDocuments] = useState<SptoDocument[]>([]);

  useEffect(() => {
    let active = true;
    fetchScheduleEvents().then((remote) => {
      if (active && remote) {
        setEvents(remote);
      }
    });
    fetchDocuments().then((remote) => {
      if (active) {
        setDocuments(remote);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const documentsByEvent = useMemo(() => groupDocumentsByEvent(documents), [documents]);

  // Akce trvající víc dní patří mezi nadcházející až do svého posledního dne.
  const upcomingEvents = events.filter((event) => scheduleEventEnd(event).getTime() >= today.getTime());
  const pastEvents = events
    .filter((event) => scheduleEventEnd(event).getTime() < today.getTime())
    .reverse();

  const selectedMonth = months[selectedMonthIndex];
  const selectedCalendarEvents = selectedCalendarDate
    ? events.filter((event) => eventOccursOn(event, parseScheduleDate(selectedCalendarDate)))
    : [];
  const changeMonth = (nextIndex: number) => {
    setSelectedMonthIndex(nextIndex);
    setSelectedCalendarDate(null);
  };

  return (
    <SiteShell>
      <main className="homepage-main homepage-single schedule-page" aria-labelledby="schedule-heading">
        <div className="schedule-intro">
          <span className="schedule-eyebrow">Školní rok {schoolYearStart}/{schoolYearStart + 1}</span>
          <h1 id="schedule-heading">Kalendář SPTO</h1>
          <p className="homepage-lead">
            Přehled akcí Zelené ligy, sněmů a štábů od září {schoolYearStart} do června {schoolYearStart + 1}.
          </p>
        </div>

        <div className="schedule-legend" aria-label="Legenda kalendáře">
          {(Object.keys(SCHEDULE_KIND_LABELS) as ScheduleEventKind[]).map((kind) => (
            <span className={`schedule-legend-item schedule-legend-item--${kind}`} key={kind}>{SCHEDULE_KIND_LABELS[kind]}</span>
          ))}
        </div>

        <section className="homepage-card schedule-overview" aria-labelledby="schedule-list-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="schedule-list-heading">Nejbližší termíny</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          {upcomingEvents.length > 0 ? (
            <ScheduleEventList events={upcomingEvents} documentsByEvent={documentsByEvent} highlightFirst />
          ) : (
            <p className="schedule-empty">Do konce školního roku už nemáme naplánovaný žádný další termín.</p>
          )}
        </section>

        {pastEvents.length > 0 ? (
          <details className="homepage-card schedule-past">
            <summary className="schedule-past-summary">
              <span>Co už proběhlo</span>
              <span className="schedule-past-count">{pastEvents.length}</span>
            </summary>
            <ScheduleEventList events={pastEvents} documentsByEvent={documentsByEvent} muted />
          </details>
        ) : null}

        <section className="schedule-calendar-section" aria-labelledby="schedule-calendar-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="schedule-calendar-heading">Kalendář školního roku</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          <div className="schedule-calendar-browser">
            <div className="schedule-calendar-controls">
              <button
                type="button"
                className="schedule-calendar-button"
                onClick={() => changeMonth(selectedMonthIndex - 1)}
                disabled={selectedMonthIndex === 0}
                aria-label="Předchozí měsíc"
              >
                <span aria-hidden="true">←</span> Předchozí
              </button>
              <label className="schedule-month-select-label">
                <span className="schedule-visually-hidden">Vyber měsíc</span>
                <select
                  className="schedule-month-select"
                  value={selectedMonthIndex}
                  onChange={(event) => changeMonth(Number(event.target.value))}
                >
                  {months.map((month, index) => (
                    <option value={index} key={`${month.year}-${month.month}`}>
                      {month.label} {month.year}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="schedule-calendar-button"
                onClick={() => changeMonth(selectedMonthIndex + 1)}
                disabled={selectedMonthIndex === months.length - 1}
                aria-label="Následující měsíc"
              >
                Další <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="schedule-calendar-stage" aria-live="polite">
              <ScheduleMonth
                year={selectedMonth.year}
                month={selectedMonth.month}
                events={events}
                selectedDate={selectedCalendarDate}
                todayKey={scheduleDateKey(today)}
                onSelectDate={setSelectedCalendarDate}
              />
            </div>
            {selectedCalendarEvents.length > 0 ? (
              <div className="schedule-selected-events" aria-live="polite">
                {selectedCalendarEvents.map((event) => (
                  <article className={`schedule-selected-event schedule-selected-event--${event.kind}`} key={`${event.name}-${event.start}`}>
                    <span className="schedule-list-kind">{SCHEDULE_KIND_LABELS[event.kind]}</span>
                    <strong>{event.name}</strong>
                    <time dateTime={event.start}>{formatScheduleDate(event)}</time>
                    {event.note ? <small>{event.note}</small> : null}
                    <ScheduleDocumentLinks documents={eventDocuments(documentsByEvent, event)} />
                    {event.href ? <a className="schedule-event-link" href={event.href}>Detail soutěže →</a> : null}
                  </article>
                ))}
              </div>
            ) : null}
            <div className="schedule-month-dots" aria-label="Rychlý výběr měsíce">
              {months.map((month, index) => (
                <button
                  type="button"
                  key={`${month.year}-${month.month}`}
                  className={`schedule-month-dot${index === selectedMonthIndex ? ' is-active' : ''}`}
                  onClick={() => changeMonth(index)}
                  aria-label={`${month.label} ${month.year}`}
                  aria-current={index === selectedMonthIndex ? 'true' : undefined}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
