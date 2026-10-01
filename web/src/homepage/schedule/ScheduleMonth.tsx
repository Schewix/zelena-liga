import {
type ScheduleEvent
} from '../../data/schedule';
import { eventOccursOn,scheduleDateKey } from './model';

export function ScheduleMonth({
  year,
  month,
  events: monthEvents,
  selectedDate,
  todayKey,
  onSelectDate,
}: {
  year: number;
  month: number;
  events: ScheduleEvent[];
  selectedDate: string | null;
  todayKey: string;
  onSelectDate: (date: string) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const cells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    const day = index - leadingDays + 1;
    return day > 0 ? new Date(year, month, day) : null;
  });
  const monthName = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(firstDay);

  return (
    <section className="schedule-month" aria-label={monthName}>
      <h3>{monthName}</h3>
      <div className="schedule-weekdays" aria-hidden="true">
        {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="schedule-days">
        {cells.map((date, index) => {
          if (!date) return <span className="schedule-day schedule-day--empty" key={`empty-${index}`} aria-hidden="true" />;
          const events = monthEvents.filter((event) => eventOccursOn(event, date));
          const dateKey = scheduleDateKey(date);
          const isToday = dateKey === todayKey;
          const todayClass = isToday ? ' schedule-day--today' : '';
          const content = (
            <>
              <span className="schedule-day-number">{date.getDate()}</span>
              {events.map((event) => (
                <span className={`schedule-calendar-event schedule-calendar-event--${event.kind}`} key={`${event.name}-${event.start}`}>
                  {event.name}
                </span>
              ))}
            </>
          );
          return events.length > 0 ? (
            <button
              type="button"
              className={`schedule-day schedule-day--active schedule-day--button${todayClass}${selectedDate === dateKey ? ' is-selected' : ''}`}
              key={dateKey}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${date.getDate()}. ${monthName}${isToday ? ' (dnes)' : ''}: ${events.map((event) => event.name).join(', ')}`}
              aria-pressed={selectedDate === dateKey}
              aria-current={isToday ? 'date' : undefined}
            >
              {content}
            </button>
          ) : (
            <div className={`schedule-day${todayClass}`} key={dateKey} aria-current={isToday ? 'date' : undefined}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
