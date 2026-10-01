import {
type SptoDocument
} from '../../data/documents';
import {
type ScheduleEvent
} from '../../data/schedule';
import { ScheduleDocumentLinks,eventDocuments } from '../documents/components';
import { SCHEDULE_KIND_LABELS,formatScheduleDate,formatScheduleDateParts } from './model';

export function ScheduleEventList({
  events,
  documentsByEvent,
  highlightFirst = false,
  muted = false,
}: {
  events: ScheduleEvent[];
  documentsByEvent: Map<string, SptoDocument[]>;
  highlightFirst?: boolean;
  muted?: boolean;
}) {
  return (
    <ol className={`schedule-list${muted ? ' schedule-list--muted' : ''}`}>
      {events.map((event, index) => {
        const parts = formatScheduleDateParts(event);
        const meta = [parts.weekday, event.note].filter(Boolean).join(' · ');
        return (
          <li
            className={`schedule-list-item schedule-list-item--${event.kind}${highlightFirst && index === 0 ? ' is-next' : ''}`}
            key={`${event.name}-${event.start}`}
          >
            <time className="schedule-list-date" dateTime={event.start} title={formatScheduleDate(event)}>
              <span className="schedule-list-day">{parts.day}</span>
              <span className="schedule-list-month">{parts.month}</span>
            </time>
            <div className="schedule-list-copy">
              <span className="schedule-list-kind">{SCHEDULE_KIND_LABELS[event.kind]}</span>
              {event.href ? (
                <a className="schedule-event-link" href={event.href}>{event.name}</a>
              ) : (
                <strong>{event.name}</strong>
              )}
              {meta ? <small>{meta}</small> : null}
              <ScheduleDocumentLinks documents={eventDocuments(documentsByEvent, event)} />
            </div>
            {highlightFirst && index === 0 ? <span className="schedule-list-next">Nejbližší</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
