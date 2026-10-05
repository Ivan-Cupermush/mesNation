import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { MONTHS, WEEKDAYS } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import TaskCard from './TaskCard';
import { useFilteredTasks, type TaskFilterState } from './filters';
import { finalDeadline, priorityOf } from './status';
import type { Task } from './types';
import s from './TaskCalendar.module.css';

const DAY = 86_400_000;
const VISIBLE = 4;
const THICKNESS = { red: 8, yellow: 6, green: 4 } as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Отрезок задачи: от создания до срока; без срока — неделя от создания (как в приложении). */
function span(t: Task): [Date, Date] {
  const start = startOfDay(new Date(t.created_at));
  const dl = finalDeadline(t);
  const end = dl ? startOfDay(new Date(dl)) : new Date(start.getTime() + 7 * DAY);
  return end < start ? [end, start] : [start, end];
}

function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // понедельник — первый день
  const start = new Date(year, month, 1 - shift);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i));
    if (w > 3 && days[0].getMonth() !== month) break;
    weeks.push(days);
  }
  return weeks;
}

/**
 * Календарь задач: по неделям — полосы от постановки до срока.
 * Толщина полосы — приоритет, точка — дедлайн. Можно листать месяцы,
 * разворачивать загруженные недели и открывать задачи дня.
 */
export default function TaskCalendar({ state }: { state: TaskFilterState }) {
  const navigate = useNavigate();
  const { tasks, isLoading } = useFilteredTasks(state);
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [day, setDay] = useState<Date | null>(null);
  const today = startOfDay(now).getTime();

  const weeks = useMemo(() => {
    const spans = tasks.map((t) => ({ t, range: span(t) }));
    return monthWeeks(cursor.year, cursor.month).map((days) => {
      const ws = days[0];
      const we = days[6];
      const list = spans
        .filter(({ range: [a, b] }) => a <= we && b >= ws)
        .sort((x, y) => priorityOf(x.t.importance).rank - priorityOf(y.t.importance).rank || x.range[1].getTime() - y.range[1].getTime())
        .map(({ t, range: [a, b] }) => {
          const from = Math.max(0, Math.round((Math.max(a.getTime(), ws.getTime()) - ws.getTime()) / DAY));
          const to = Math.min(6, Math.round((Math.min(b.getTime(), we.getTime()) - ws.getTime()) / DAY));
          return { t, from, to, endsHere: b <= we && b >= ws };
        });
      return { days, list };
    });
  }, [tasks, cursor]);

  const shiftMonth = (delta: number) => {
    setExpanded(new Set());
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const dayTasks = useMemo(() => {
    if (!day) return [];
    const t0 = day.getTime();
    return tasks.filter((t) => {
      const [a, b] = span(t);
      return a.getTime() <= t0 && b.getTime() >= t0;
    });
  }, [day, tasks]);

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <button type="button" className={s.nav} onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
          <ChevronLeft size={20} />
        </button>
        <div className={s.month}>
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <button type="button" className={s.nav} onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
          <ChevronRight size={20} />
        </button>
        {(cursor.year !== now.getFullYear() || cursor.month !== now.getMonth()) && (
          <button type="button" className={s.today} onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>
            Сегодня
          </button>
        )}
        {isLoading && <Spinner size={18} />}
      </div>

      <div className={s.weekdays}>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className={s.scroll}>
        {weeks.map(({ days, list }, wi) => {
          const open = expanded.has(wi);
          const shown = open ? list : list.slice(0, VISIBLE);
          const hidden = list.length - VISIBLE;
          return (
            <div key={wi} className={s.week}>
              <div className={s.days}>
                {days.map((d) => (
                  <button
                    key={d.getTime()}
                    type="button"
                    className={[s.day, d.getMonth() !== cursor.month && s.otherMonth, d.getTime() === today && s.isToday].filter(Boolean).join(' ')}
                    onClick={() => setDay(d)}
                    aria-label={d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                  >
                    <span className={s.dayNum}>{d.getDate()}</span>
                  </button>
                ))}
              </div>
              <div className={s.bars} style={{ height: Math.max(56, shown.length * 22 + 8) }}>
                {shown.map(({ t, from, to, endsHere }, i) => {
                  const p = priorityOf(t.importance);
                  const h = THICKNESS[t.importance] ?? 6;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={[s.bar, t.status_new === 'done' && s.barDone, t.status_new === 'archived' && s.barDone].filter(Boolean).join(' ')}
                      style={{ left: `calc(${(from / 7) * 100}% + 3px)`, width: `calc(${((to - from + 1) / 7) * 100}% - 6px)`, top: 4 + i * 22, color: p.color }}
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      title={`${t.title} · ${p.long}`}
                    >
                      <span className={s.barLine} style={{ height: h, background: p.color }} />
                      {endsHere && <span className={s.barDot} style={{ width: h + 4, height: h + 4, background: p.color }} />}
                      <span className={s.barTitle}>{t.title}</span>
                    </button>
                  );
                })}
              </div>
              {hidden > 0 && (
                <button
                  type="button"
                  className={s.expand}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(wi)) next.delete(wi);
                      else next.add(wi);
                      return next;
                    })
                  }
                >
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {open ? 'Свернуть' : `Ещё ${hidden}`}
                </button>
              )}
            </div>
          );
        })}
        <div className={s.legend}>Толщина линии — приоритет · точка — дедлайн · нажмите на день, чтобы увидеть его задачи</div>
      </div>

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : ''} size="md">
        {dayTasks.length === 0 ? (
          <p className={s.empty}>В этот день задач нет.</p>
        ) : (
          <div className={s.dayList}>
            {dayTasks.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={(task) => (setDay(null), navigate(`/tasks/${task.id}`))} />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
