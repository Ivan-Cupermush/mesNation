import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, HandHeart, CalendarClock, ChartColumn, ListTodo, Moon, Quote, Sun, Sunrise, Sunset, Target, TrendingUp, Trophy, UsersRound } from 'lucide-react';
import { api } from '../../lib/http';
import { formatTime, plural } from '../../lib/format';
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
import ShellActions from '../inbox/ShellActions';
import { firstNameOf } from '../../lib/names';

interface HomeTask {
  id: number;
  kind?: 'task' | 'request';
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
  /** Как обратиться: имя без фамилии. */
  first_name?: string;
  phrase: { id: number; text: string };
  month: string;
  /** company — продажи и KPI суммарно по всей компании (у директора). */
  scope?: 'company' | 'me';
  stats: (SalesStats & { people?: number }) | null;
  kpi: { count: number; people?: number; totals: KpiTotals | null; focus: (KpiTarget & { user_name?: string })[] };
  tasks: HomeTask[];
}

const PHRASE_KEY = 'offix.home.phrase';

/** «Понедельник, 12 октября». */
const today = () => {
  const text = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Значок времени суток рядом с датой. */
function DayIcon({ greeting }: { greeting: string }) {
  const Icon = /утро/i.test(greeting) ? Sunrise : /день/i.test(greeting) ? Sun : /вечер/i.test(greeting) ? Sunset : Moon;
  return (
    <span className={s.dayIcon} aria-hidden>
      <Icon size={17} strokeWidth={2.2} />
    </span>
  );
}

/**
 * Приветственная страница — встречает при входе на сайт, а после перехода в
 * любой раздел исчезает (пункта в меню у неё нет, см. welcome.ts). Элементы —
 * как предложил заказчик: приветствие и напутствие (каждый раз новое), продажи
 * за месяц — те же 4 квадратика, что в статистике, KPI, на которые стоит
 * обратить внимание, и задачи на сегодня. У директора продажи и KPI — по всей
 * компании.
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
        <EmptyState title="Не удалось загрузить приветствие" text="Проверьте подключение и попробуйте ещё раз." action={<Button onClick={() => refetch()}>Повторить</Button>} />
      </Page>
    );
  }

  const company = data.scope === 'company';
  const overdue = data.tasks.filter((t) => t.is_overdue).length;
  const dueToday = data.tasks.filter((t) => t.due_today).length;
  const totals = data.kpi.totals;
  const kpiPct = totals && totals.max > 0 ? Math.min(100, Math.round((totals.now / totals.max) * 100)) : null;
  const people = data.stats?.people ?? data.kpi.people ?? 0;

  return (
    <Page>
      <PageBody>
        <div className={s.stack}>
          <section className={[s.hero, s.rise].join(' ')}>
            <span className={s.heroTop}>
              <DayIcon greeting={data.greeting} />
              <span className={s.date}>{today()}</span>
              <ShellActions />
            </span>
            <h1>
              <span className={s.hello}>{data.greeting},</span>
              <span className={s.name}>{data.first_name || firstNameOf(data.name)}!</span>
            </h1>
            <p className={s.phrase}>
              <Quote size={16} aria-hidden />
              <span>{data.phrase.text}</span>
            </p>
            <div className={s.chips}>
              <button type="button" className={s.chip} onClick={() => navigate('/tasks')}>
                <ListTodo size={14} />
                {dueToday ? `${dueToday} ${plural(dueToday, ['задача', 'задачи', 'задач'])} на сегодня` : 'На сегодня свободно'}
              </button>
              {overdue > 0 && (
                <button type="button" className={[s.chip, s.chipDanger].join(' ')} onClick={() => navigate('/tasks')}>
                  <AlertCircle size={14} />
                  {overdue} {plural(overdue, ['просрочена', 'просрочены', 'просрочено'])}
                </button>
              )}
              {kpiPct != null && (
                <button type="button" className={[s.chip, s.chipKpi].join(' ')} onClick={() => navigate('/stats')}>
                  <Trophy size={14} />
                  KPI {kpiPct}%
                </button>
              )}
            </div>
          </section>

          <section className={[s.section, s.rise].join(' ')} style={{ animationDelay: '70ms' }}>
            <div className={s.head}>
              <div className={s.headText}>
                <h2>{company ? 'Продажи компании' : 'Продажи за месяц'}</h2>
                {company && people > 0 && (
                  <span className={s.sub}>
                    <UsersRound size={13} /> сумма по {people} {plural(people, ['сотруднику', 'сотрудникам', 'сотрудникам'])}
                  </span>
                )}
              </div>
              <Button size="sm" variant="ghost" icon={<ChartColumn size={16} />} onClick={() => navigate('/stats')}>
                Статистика
              </Button>
            </div>
            <SalesTiles stats={data.stats} />
            <p className={s.note}>{statsCaption(data.stats, data.month)}</p>
          </section>

          <div className={s.columns}>
            <section className={[s.section, s.rise].join(' ')} style={{ animationDelay: '140ms' }}>
              <div className={s.head}>
                <h2>Обратите внимание</h2>
              </div>
              {totals && (
                <button type="button" className={s.earned} onClick={() => navigate('/stats')}>
                  <span className={s.earnedIcon}>
                    <Trophy size={18} />
                  </span>
                  <span className={s.earnedBody}>
                    <small>{company ? 'KPI компании: начислено' : 'Заработано по KPI'}</small>
                    <b>
                      {money(totals.now)} <em>из {money(totals.max)}</em>
                    </b>
                    <span className={[s.bar, s.barGood].join(' ')}>
                      <span style={{ width: `${Math.max(2, kpiPct ?? 0)}%` }} />
                    </span>
                  </span>
                </button>
              )}
              {data.kpi.focus.length ? (
                <div className={s.list}>
                  {data.kpi.focus.map((t) => (
                    <button key={t.id} type="button" className={s.kpi} onClick={() => navigate('/stats')}>
                      <span className={s.kpiIcon}>
                        <Target size={18} />
                      </span>
                      <span className={s.kpiBody}>
                        <b title={t.product_name || undefined}>{kpiTitle(t)}</b>
                        {company && t.user_name && <span className={s.who}>{t.user_name}</span>}
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
                  <span>
                    {data.kpi.count
                      ? company
                        ? 'Все показатели KPI в компании выполнены — отличная работа команды!'
                        : 'Все показатели KPI выполнены — так держать!'
                      : company
                        ? 'KPI на этот месяц ещё не загружены.'
                        : 'KPI за этот месяц пока нет — его загружает руководитель.'}
                  </span>
                </div>
              )}
            </section>

            <section className={[s.section, s.rise].join(' ')} style={{ animationDelay: '210ms' }}>
              <div className={s.head}>
                <h2>Задачи на сегодня</h2>
                <Button size="sm" variant="ghost" icon={<ListTodo size={16} />} onClick={() => navigate('/tasks')}>
                  Все задачи
                </Button>
              </div>
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
                        {t.kind === 'request' ? (
                          <span className={s.reqIcon} title="Просьба">
                            <HandHeart size={15} />
                          </span>
                        ) : (
                          <span className={s.prio} style={{ background: priorityOf(t.importance).color }} title={priorityOf(t.importance).long} />
                        )}
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
