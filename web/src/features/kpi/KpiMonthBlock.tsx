import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Settings2, Trophy, Upload, Users } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import type { MenuItem } from '../../ui/ActionMenu';
import { PageLoader } from '../../ui/Spinner';
import { dayMonth, monthKey, monthTitle, money, reportPeriod, shiftMonth } from './format';
import { KpiCard } from './KpiCard';
import { useKpiMonth } from './queries';
import { RuleDialog } from './RuleDialog';
import type { KpiTarget, SalesTarget } from './types';
import s from './kpiMonth.module.css';

interface Props {
  userId: number;
  /** Свой KPI («Мой KPI за май») или сотрудника. */
  self: boolean;
  /** Меню цели (изменить план, удалить) — из useTargetActions. */
  itemsFor: (t: SalesTarget) => MenuItem[];
}

/** Показатель считается и оплачивается по правилам (из файла KPI или с правилом выплаты) — он в блоке KPI, а не в «Моих целях». */
export const isKpi = (t: Pick<SalesTarget, 'source' | 'calc' | 'payout_rule'>) =>
  t.source === 'kpi_file' || !!t.calc?.tracked || (!!t.payout_rule && t.payout_rule.type !== 'none');

/**
 * KPI за месяц (вариант 2): что заработано по последнему отчёту о продажах,
 * прогноз на конец месяца, карточки показателей. Руководителю — кнопки загрузки
 * отчёта и файла KPI, правка правил расчёта.
 */
export function KpiMonthBlock({ userId, self, itemsFor }: Props) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month')! : monthKey();
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params);
    if (m === monthKey()) next.delete('month');
    else next.set('month', m);
    setParams(next, { replace: true });
  };
  const { data, isLoading, error, refetch, isFetching } = useKpiMonth(userId, month);
  const [ruleFor, setRuleFor] = useState<KpiTarget | null>(null);

  const kpis = useMemo(() => (data?.targets ?? []).filter(isKpi), [data]);
  const fixed = kpis.filter((t) => t.payout_rule.type === 'fixed');
  const cards = kpis.filter((t) => t.payout_rule.type !== 'fixed');
  const hasEp = kpis.some((t) => t.kpi_kind === 'ep' || t.kpi_kind === 'no_ep');
  const cov = data?.coverage ?? null;
  const [y, m] = month.split('-').map(Number);
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const open = cov ? cov.elapsed < cov.days : month >= monthKey();

  const manage = data?.canUpload ? (
    <div className={s.tools}>
      <Button size="sm" variant="soft" icon={<Upload size={16} />} onClick={() => navigate('/import?type=report')}>
        Отчёт о продажах
      </Button>
      <Button size="sm" variant="soft" icon={<FileSpreadsheet size={16} />} onClick={() => navigate(`/import?type=kpi${self ? '' : `&user=${userId}`}`)}>
        Файл KPI
      </Button>
      <Button size="sm" variant="ghost" icon={<Users size={16} />} onClick={() => navigate('/stats/clients')}>
        Клиенты ЕП
      </Button>
    </div>
  ) : null;

  const menuFor = (t: KpiTarget): MenuItem[] => {
    // Факт из отчётов перезапишется следующим отчётом — продажу вручную к нему не пишем.
    const base = itemsFor(t).filter((i) => !(t.calc.tracked && i.key === 'sale'));
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
    body = (
      <>
        {cov ? (
          <div className={s.banner}>
            <span className={s.bannerIcon}>
              <FileSpreadsheet size={20} />
            </span>
            <div>
              <b>Отчёт о продажах за {reportPeriod(`${month}-01`, cov.asOf)}</b>
              <span>
                загружен {formatDate(cov.uploadedAt, true)}
                {cov.reports > 1 ? ` · отчётов за месяц: ${cov.reports}` : ''}
              </span>
            </div>
          </div>
        ) : (
          kpis.length > 0 && (
            <div className={s.banner} data-muted>
              <span className={s.bannerIcon}>
                <FileSpreadsheet size={20} />
              </span>
              <div>
                <b>Отчётов о продажах за {monthTitle(month).split(' ')[0]} нет</b>
                <span>Факт — по файлу KPI. После загрузки отчёта показатели обновятся сами.</span>
              </div>
            </div>
          )
        )}

        {hasEp && data.canUpload && data.lists.ep === 0 && (
          <div className={s.warn}>
            <AlertTriangle size={18} />
            <span>
              Список клиентов «Есть повод» пуст — вся выручка считается в «без ЕП».{' '}
              <button type="button" onClick={() => navigate('/stats/clients')}>
                Заполнить список
              </button>
            </span>
          </div>
        )}

        {kpis.length === 0 ? (
          <div className={s.empty}>
            <p>
              {self ? 'KPI' : 'KPI сотрудника'} за {monthTitle(month)} не загружены.
              {data.canUpload ? ' Загрузите файл KPI — показатели будут обновляться по отчётам о продажах.' : ''}
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
                  <b>{self ? 'Мой KPI' : 'KPI'} за {monthTitle(month).split(' ')[0]}</b>
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
                {cov && open ? (
                  <div className={s.cell} data-accent>
                    <span>Прогноз на {dayMonth(lastDay)}</span>
                    <b className={s.big}>≈{money(Math.round(data.totals.forecast / 100) * 100)}</b>
                  </div>
                ) : (
                  <div className={s.cell} data-accent>
                    <span>При выполнении плана</span>
                    <b className={s.big}>{money(data.totals.max)}</b>
                  </div>
                )}
              </div>
              {cov && (
                <>
                  <div className={s.days}>
                    <span>
                      Продажи учтены по {dayMonth(cov.asOf)} — {cov.elapsed} из {cov.days} дн.
                    </span>
                    <span>при выполнении плана {money(data.totals.max)}</span>
                  </div>
                  <div className={s.bar}>
                    <span className={s.fill} data-tone="neutral" style={{ width: `${(cov.elapsed / cov.days) * 100}%` }} />
                  </div>
                </>
              )}
              {data.totals.file != null && (
                <p className={s.rule}>
                  К выплате по итоговому файлу KPI: <b>{money(data.totals.file)}</b>
                </p>
              )}
            </div>
            <div className={s.grid}>
              {cards.map((t) => (
                <KpiCard key={t.id} target={t} monthEnd={open && cov ? lastDay : null} actions={menuFor(t)} />
              ))}
            </div>
            <p className={s.note}>
              Факт обновляется после каждой загрузки отчёта о продажах. «Прогноз» — если продажи пойдут в том же темпе до конца месяца.
              {data.reports.length > 0 && ` Отчёты: ${data.reports.map((r) => reportPeriod(r.period_start, r.period_end)).join(', ')}.`}
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
        <div className={s.monthSwitch} data-busy={isFetching || undefined}>
          <IconButton label="Предыдущий месяц" size={32} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <span>{monthTitle(month)}</span>
          <IconButton label="Следующий месяц" size={32} onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= shiftMonth(monthKey(), 1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      {manage}
      {body}
      <RuleDialog target={ruleFor} month={month} onClose={() => setRuleFor(null)} />
    </section>
  );
}
