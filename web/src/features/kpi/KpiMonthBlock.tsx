import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, Package, Settings2, Store, Trophy, Upload, UserCheck, Users, Wallet } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { can } from '../auth/roles';
import { formatDate } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import type { MenuItem } from '../../ui/ActionMenu';
import { PageLoader } from '../../ui/Spinner';
import { dayMonth, monthKey, monthTitle, money, number, reportPeriod, shiftMonth } from './format';
import { KpiCard } from './KpiCard';
import { useKpiMonth } from './queries';
import { RuleDialog } from './RuleDialog';
import type { KpiMonth, KpiTarget, SalesStats, SalesTarget } from './types';
import s from './kpiMonth.module.css';
import k from './kpi.module.css';

/** Показатель считается и оплачивается по правилам (из файла KPI или с правилом выплаты) — он в блоке KPI, а не в «Моих целях». */
export const isKpi = (t: Pick<SalesTarget, 'source' | 'calc' | 'payout_rule'>) =>
  t.source === 'kpi_file' || !!t.calc?.tracked || t.calc?.source === 'report' || (!!t.payout_rule && t.payout_rule.type !== 'none');

/**
 * Месяц экрана статистики: сотрудник видит только текущий месяц, руководитель
 * и директор переключают месяцы (?month=ГГГГ-ММ). Квадратики продаж и блок KPI
 * берут данные из одного запроса.
 */
export function useKpiMonthView(userId: number) {
  const [params, setParams] = useSearchParams();
  const requested = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month')! : monthKey();
  const query = useKpiMonth(userId, requested);
  // Сервер отдаёт текущий месяц, если переключать нельзя.
  const month = query.data?.month ?? requested;
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params);
    if (m === monthKey()) next.delete('month');
    else next.set('month', m);
    setParams(next, { replace: true });
  };
  return { userId, month, setMonth, query, canSwitch: !!query.data?.canSwitchMonth };
}

export type KpiMonthView = ReturnType<typeof useKpiMonthView>;

function MonthSwitch({ view }: { view: KpiMonthView }) {
  const { month, setMonth, query } = view;
  return (
    <div className={s.monthSwitch} data-busy={query.isFetching || undefined}>
      <IconButton label="Предыдущий месяц" size={32} onClick={() => setMonth(shiftMonth(month, -1))}>
        <ChevronLeft size={18} />
      </IconButton>
      <span>{monthTitle(month)}</span>
      <IconButton label="Следующий месяц" size={32} onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= shiftMonth(monthKey(), 1)}>
        <ChevronRight size={18} />
      </IconButton>
    </div>
  );
}

const monthName = (month: string) => monthTitle(month).split(' ')[0];

/** Четыре квадратика продаж по отчётам о продажах: выручка, АКБ, средняя продажа в день, проданные штуки. */
export function SalesTiles({ stats }: { stats: SalesStats | null | undefined }) {
  const tiles = [
    { key: 'sum', label: 'Выручка', value: stats ? money(stats.revenue) : '—', icon: <Wallet size={20} />, tone: 'accent' },
    { key: 'akb', label: 'АКБ, точек', value: stats ? number(stats.akb) : '—', icon: <Store size={20} />, tone: 'info' },
    { key: 'day', label: 'В среднем за рабочий день', value: stats ? money(stats.perDay) : '—', icon: <CalendarDays size={20} />, tone: 'warning' },
    { key: 'qty', label: 'Продано, шт', value: stats ? number(stats.quantity) : '—', icon: <Package size={20} />, tone: 'violet' },
  ];
  return (
    <div className={k.tiles}>
      {tiles.map((t) => (
        <div key={t.key} className={k.tile}>
          <span className={k.tileIcon} data-tone={t.tone}>
            {t.icon}
          </span>
          <b className={k.tileValue} title={t.value}>
            {t.value}
          </b>
          <span className={k.tileLabel}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Подпись под квадратиками: по какое число учтены продажи. */
export function statsCaption(stats: SalesStats | null | undefined, month: string): string {
  if (!stats) return `Отчётов о продажах за ${monthName(month).toLowerCase()} пока нет — квадратики заполнятся после загрузки отчёта.`;
  const work = stats.workElapsed != null ? `рабочих дней: ${stats.workElapsed} из ${stats.workDays}` : `${stats.elapsed} из ${stats.days} дн.`;
  return `По отчёту о продажах на ${dayMonth(stats.asOf)} · ${work} (вс — выходной) · АКБ без «Есть повод»`;
}

/** Продажи за месяц (квадратики) — наверху экрана статистики; руководителю — переключение месяцев. */
export function SalesSection({ view, title }: { view: KpiMonthView; title?: string }) {
  const data = view.query.data;
  return (
    <section className={s.block}>
      <div className={s.blockHead}>
        <h2>{title ?? `Продажи за ${monthName(view.month).toLowerCase()}`}</h2>
        {view.canSwitch && <MonthSwitch view={view} />}
      </div>
      <SalesTiles stats={data?.stats} />
      {data && <p className={s.note}>{statsCaption(data.stats, view.month)}</p>}
    </section>
  );
}

interface Props {
  view: KpiMonthView;
  /** Свой KPI («Мой KPI за май») или сотрудника. */
  self: boolean;
  /** Меню цели (изменить план, удалить) — из useTargetActions. */
  itemsFor: (t: SalesTarget) => MenuItem[];
  /** «Назначить KPI» этому сотруднику (кнопка — тем, кому это можно). */
  onAssign?: () => void;
}

/**
 * KPI за месяц: показатели из файла KPI (факт, процент и выплаты — как в файле)
 * и цели, которые считаются по отчётам о продажах. Кнопки загрузки — тем, кому
 * включены эти функции.
 */
export function KpiMonthBlock({ view, self, itemsFor, onAssign }: Props) {
  const navigate = useNavigate();
  const me = useMe();
  const { month, userId } = view;
  const { data, isLoading, error, refetch } = view.query;
  const [ruleFor, setRuleFor] = useState<KpiTarget | null>(null);

  const kpis = useMemo(() => (data?.targets ?? []).filter(isKpi), [data]);
  const fixed = kpis.filter((t) => t.payout_rule.type === 'fixed');
  const cards = kpis.filter((t) => t.payout_rule.type !== 'fixed');
  const fromFile = kpis.some((t) => t.source === 'kpi_file');
  const fileDate = kpis.map((t) => t.calc.source === 'file' && t.calc.asOf).filter(Boolean).sort().pop() as string | undefined;
  const [y, m] = month.split('-').map(Number);
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const cov = data?.coverage ?? null;
  const open = month >= monthKey();
  const rights = rightsOf(data, self, me);

  const assign = !self && !!onAssign && !!data?.can?.assign;
  const manage =
    rights.reports || rights.kpiFile || assign ? (
      <div className={s.tools}>
        {assign && (
          <Button size="sm" variant="soft" icon={<UserCheck size={16} />} onClick={onAssign}>
            Назначить KPI
          </Button>
        )}
        {rights.reports && (
          <Button size="sm" variant="soft" icon={<Upload size={16} />} onClick={() => navigate('/import?type=report')}>
            Отчёт о продажах
          </Button>
        )}
        {rights.kpiFile && (
          <Button size="sm" variant="soft" icon={<FileSpreadsheet size={16} />} onClick={() => navigate(`/import?type=kpi${self ? '' : `&user=${userId}`}`)}>
            Файл KPI
          </Button>
        )}
        {rights.reports && (
          <Button size="sm" variant="ghost" icon={<Users size={16} />} onClick={() => navigate('/stats/clients')}>
            Клиенты ЕП
          </Button>
        )}
      </div>
    ) : null;

  const menuFor = (t: KpiTarget): MenuItem[] => {
    // Факт из отчётов и из файла KPI вручную не пишем.
    const base = itemsFor(t).filter((i) => !((t.calc.tracked || t.source === 'kpi_file') && i.key === 'sale'));
    return data?.canEdit ? [{ key: 'rule', label: 'Правило расчёта', icon: <Settings2 size={18} />, onSelect: () => setRuleFor(t) }, ...base] : base;
  };

  let body;
  if (isLoading) body = <PageLoader />;
  else if (error || !data) {
    body = (
      <div className={s.empty}>
        <p>Не удалось загрузить KPI.</p>
        <Button size="sm" variant="soft" onClick={() => refetch()}>
          Повторить
        </Button>
      </div>
    );
  } else {
    const hasEp = kpis.some((t) => t.kpi_kind === 'ep' || t.kpi_kind === 'no_ep');
    body = (
      <>
        {fromFile && (
          <div className={s.banner}>
            <span className={s.bannerIcon}>
              <FileSpreadsheet size={20} />
            </span>
            <div>
              <b>KPI по файлу{fileDate ? ` от ${dayMonth(fileDate)}` : ''}</b>
              <span>Факт, выполнение и выплаты — из файла KPI. Обновляются, когда руководитель загружает новый файл.</span>
            </div>
          </div>
        )}

        {hasEp && rights.reports && data.lists.ep === 0 && (
          <div className={s.warn}>
            <AlertTriangle size={18} />
            <span>
              Список клиентов «Есть повод» пуст — АКБ считается вместе с точками сети.{' '}
              <button type="button" onClick={() => navigate('/stats/clients')}>
                Заполнить список
              </button>
            </span>
          </div>
        )}

        {kpis.length === 0 ? (
          <div className={s.empty}>
            <p>
              {self ? 'KPI' : 'KPI сотрудника'} за {monthTitle(month)} пока нет.
              {rights.kpiFile ? ' Загрузите файл KPI — показатели и выплаты появятся здесь.' : self ? ' KPI загружает руководитель.' : ''}
            </p>
          </div>
        ) : (
          <>
            <div className={s.summary}>
              <div className={s.head}>
                <span className={s.icon} data-tone="accent">
                  <Trophy size={21} />
                </span>
                <div className={s.titles}>
                  <b>
                    {self ? 'Мой KPI' : 'KPI'} за {monthName(month).toLowerCase()}
                  </b>
                  <span>
                    {fixed.length
                      ? `${fixed.map((t) => `${(t.product_name || '').trim()} ${money(t.calc.now)}`).join(' · ')} — включены`
                      : `показателей: ${cards.length}`}
                  </span>
                </div>
              </div>
              <div className={s.cells}>
                <div className={s.cell}>
                  <span>{open ? 'Заработано на сегодня' : 'Заработано за месяц'}</span>
                  <b className={s.big}>{money(data.totals.now)}</b>
                </div>
                <div className={s.cell} data-accent>
                  <span>При выполнении плана</span>
                  <b className={s.big}>{money(data.totals.max)}</b>
                </div>
              </div>
              {data.totals.file != null && (
                <p className={s.rule}>
                  К выплате по файлу KPI: <b>{money(data.totals.file)}</b>
                </p>
              )}
            </div>
            <div className={s.grid}>
              {cards.map((t) => (
                <KpiCard key={t.id} target={t} monthEnd={open && cov ? lastDay : null} actions={menuFor(t)} />
              ))}
            </div>
            <p className={s.note}>
              KPI обновляется из файла KPI. Цели, назначенные вручную «по отчёту», считаются по отчётам о продажах.
              {data.reports.length > 0 && ` Отчёты: ${data.reports.map((r) => reportPeriod(r.period_start, r.period_end)).join(', ')}.`}
              {cov && ` Последний загружен ${formatDate(cov.uploadedAt, true)}.`}
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <section className={s.block}>
      <div className={s.blockHead}>
        <h2>KPI</h2>
      </div>
      {manage}
      {body}
      <RuleDialog target={ruleFor} month={month} onClose={() => setRuleFor(null)} />
    </section>
  );
}

/** Что можно делать на этом экране: на своём — по включённым функциям, на странице сотрудника — по ответу сервера. */
function rightsOf(data: KpiMonth | undefined, self: boolean, me: Parameters<typeof can>[0]) {
  if (self) return { reports: can(me, 'sales_reports'), kpiFile: can(me, 'kpi_files') };
  const c = data?.can;
  return { reports: c ? c.reports : !!data?.canUpload, kpiFile: c ? c.kpiFile : !!data?.canUpload };
}
