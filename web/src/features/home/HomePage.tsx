import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CalendarClock, ChartColumn, ListTodo, Quote, Target, TrendingUp } from 'lucide-react';
import { api } from '../../lib/http';
import { formatTime } from '../../lib/format';
import { storage } from '../../lib/storage';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody } from '../../ui/Page';
import { PageLoader } from '../../ui/Spinner';
import { kpiTitle } from '../kpi/KpiCard';
import { SalesTiles, statsCaption } from '../kpi/KpiMonthBlock';
import { money } from '../kpi/format';
import type { KpiTarget, KpiTotals, SalesStats } from '../kpi/types';
import { priorityOf, statusMeta } from '../tasks/status';
import s from './HomePage.module.css';

interface HomeTask {
  id: number;
  title: string;
  status: string;
  importance: string;
  deadline: string | null;
  is_overdue: boolean | null;
  due_today: boolean;
}

export interface HomeData {
  greeting: string;
  name: string;
  phrase: { id: number; text: string };
  month: string;
  stats: SalesStats | null;
  kpi: { count: number; totals: KpiTotals | null; focus: KpiTarget[] };
  tasks: HomeTask[];
}

const PHRASE_KEY = 'offix.home.phrase';

/** Имя для приветствия: «Роман Иванов» → «Роман». */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** «Понедельник, 12 октября». */
const today = () => {
  const text = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Стартовая страница: приветствие и напутствие (каждый раз новое), продажи за
 * месяц — те же 4 квадратика, что в статистике, KPI, на которые стоит
 * обратить внимание, и задачи на сегодня и в работе.
 */
export default function HomePage() {
  const navigate = useNavigate();
  // Напутствие меняется при каждом заходе: прошлое передаём, чтобы не повторилось.
  const prev = useRef(storage.get(PHRASE_KEY));
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/api/home', { tz_offset: new Date().getTimezoneOffset(), prev: prev.current ?? undefined }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (data) storage.set(PHRASE_KEY, String(data.phrase.id));
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <Page>
        <EmptyState title="Не удалось загрузить главную" text="Проверьте подключение и попробуйте ещё раз." action={<Button onClick={() => refetch()}>Повторить</Button>} />
      </Page>
    );
  }

  const overdue = data.tasks.filter((t) => t.is_overdue).length;
  return (
    <Page>
      <PageBody>
        <div className={s.stack}>
          <section className={s.hero}>
            <span className={s.date}>{today()}</span>
            <h1>
              {data.greeting}, {firstName(data.name)}!
            </h1>
            <p className={s.phrase}>
              <Quote size={18} aria-hidden />
              <span>{data.phrase.text}</span>
            </p>
          </section>

          <section className={s.section}>
            <div className={s.head}>
              <h2>Продажи за месяц</h2>
              <Button size="sm" variant="ghost" icon={<ChartColumn size={16} />} onClick={() => navigate('/stats')}>
                Статистика
              </Button>
            </div>
            <SalesTiles stats={data.stats} />
            <p className={s.note}>{statsCaption(data.stats, data.month)}</p>
          </section>

          <div className={s.columns}>
            <section className={s.section}>
              <div className={s.head}>
                <h2>Обратите внимание</h2>
                {data.kpi.totals && (
                  <span className={s.earned}>
                    заработано {money(data.kpi.totals.now)} из {money(data.kpi.totals.max)}
                  </span>
                )}
              </div>
              {data.kpi.focus.length ? (
                <div className={s.list}>
                  {data.kpi.focus.map((t) => (
                    <button key={t.id} type="button" className={s.kpi} onClick={() => navigate('/stats')}>
                      <span className={s.kpiIcon}>
                        <Target size={18} />
                      </span>
                      <span className={s.kpiBody}>
                        <b title={t.product_name || undefined}>{kpiTitle(t)}</b>
                        <span className={s.bar}>
                          <span style={{ width: `${Math.max(2, Math.min(100, t.calc.percent))}%` }} />
                        </span>
                        {t.calc.hint && (
                          <small>
                            <TrendingUp size={13} /> {t.calc.hint}
                          </small>
                        )}
                      </span>
                      <span className={s.pct}>{Math.round(t.calc.percent)}%</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={s.empty}>
                  <Target size={22} />
                  <span>{data.kpi.count ? 'Все показатели KPI выполнены — так держать!' : 'KPI за этот месяц пока нет — его загружает руководитель.'}</span>
                </div>
              )}
            </section>

            <section className={s.section}>
              <div className={s.head}>
                <h2>Задачи на сегодня</h2>
                <Button size="sm" variant="ghost" icon={<ListTodo size={16} />} onClick={() => navigate('/tasks')}>
                  Все задачи
                </Button>
              </div>
              {overdue > 0 && (
                <p className={s.alert}>
                  <AlertCircle size={16} /> Просрочено: {overdue}
                </p>
              )}
              {data.tasks.length ? (
                <div className={s.list}>
                  {data.tasks.map((t) => {
                    const meta = statusMeta(t.status);
                    const Icon = meta.icon;
                    return (
                      <button key={t.id} type="button" className={s.task} onClick={() => navigate(`/tasks/${t.id}`)}>
                        <span className={s.taskIcon} style={{ background: meta.soft, color: meta.color }}>
                          <Icon size={16} />
                        </span>
                        <span className={s.taskBody}>
                          <b>{t.title}</b>
                          <span data-late={t.is_overdue || undefined}>
                            {meta.label}
                            {t.deadline &&
                              (t.is_overdue ? ' · просрочена' : t.due_today ? ` · сегодня до ${formatTime(t.deadline)}` : '')}
                          </span>
                        </span>
                        <span className={s.prio} style={{ background: priorityOf(t.importance).color }} title={priorityOf(t.importance).long} />
                        <ArrowRight size={16} className={s.chevron} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={s.empty}>
                  <CalendarClock size={22} />
                  <span>На сегодня задач нет, в работе тоже ничего. Хороший момент взяться за новое!</span>
                </div>
              )}
            </section>
          </div>
        </div>
      </PageBody>
    </Page>
  );
}
