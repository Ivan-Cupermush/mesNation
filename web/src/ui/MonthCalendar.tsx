import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS, WEEKDAYS, toDateKey } from '../lib/format';
import s from './MonthCalendar.module.css';

interface Props {
  /** Любой день показываемого месяца. */
  month: Date;
  /** Выбранный день YYYY-MM-DD. */
  selected?: string | null;
  /** Дни с отметкой (например, количество заметок). */
  marks?: Record<string, number>;
  onSelect: (dateKey: string) => void;
  onMonthChange: (month: Date) => void;
}

/** Компактный календарь месяца с точками у дней, где что-то есть (как в приложении). */
export function MonthCalendar({ month, selected, marks = {}, onSelect, onMonthChange }: Props) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const shift = (new Date(year, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array.from({ length: shift }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const todayKey = toDateKey(new Date());
  const isCurrent = year === new Date().getFullYear() && m === new Date().getMonth();

  return (
    <div className={s.calendar}>
      <div className={s.head}>
        <button type="button" className={s.nav} onClick={() => onMonthChange(new Date(year, m - 1, 1))} aria-label="Предыдущий месяц">
          <ChevronLeft size={19} />
        </button>
        <div className={s.title}>
          {MONTHS[m]} {year}
        </div>
        <button type="button" className={s.nav} onClick={() => onMonthChange(new Date(year, m + 1, 1))} aria-label="Следующий месяц">
          <ChevronRight size={19} />
        </button>
        {!isCurrent && (
          <button
            type="button"
            className={s.today}
            onClick={() => {
              onMonthChange(new Date());
              onSelect(todayKey);
            }}
          >
            Сегодня
          </button>
        )}
      </div>
      <div className={s.grid}>
        {WEEKDAYS.map((d) => (
          <span key={d} className={s.weekday}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const key = toDateKey(d);
          const count = marks[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={[s.day, key === selected && s.selected, key === todayKey && s.today2].filter(Boolean).join(' ')}
              onClick={() => onSelect(key)}
              aria-label={`${d.getDate()} ${MONTHS[m]}${count ? `, записей: ${count}` : ''}`}
              aria-pressed={key === selected}
            >
              {d.getDate()}
              {count > 0 && <span className={s.dot} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
