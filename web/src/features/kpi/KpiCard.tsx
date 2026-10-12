import { useState } from 'react';
import { CheckCircle2, Circle, Fuel, ListChecks, MoreHorizontal, Package, Sparkles, Store, Target, TrendingUp, Wallet, Beer, Banknote, type LucideIcon } from 'lucide-react';
import { IconButton } from '../../ui/Button';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { dayMonth, kpiValue, money, number, toNum } from './format';
import type { KpiKind, KpiTarget } from './types';
import s from './kpiMonth.module.css';

type Tone = 'accent' | 'violet' | 'warning' | 'info';

const KIND: Record<KpiKind, { icon: LucideIcon; tone: Tone; label: string }> = {
  no_ep: { icon: Wallet, tone: 'accent', label: 'сумма продаж, ₽' },
  ep: { icon: Sparkles, tone: 'violet', label: 'продажи сети «Есть повод», ₽' },
  baltika: { icon: Beer, tone: 'warning', label: 'сумма продаж, ₽' },
  oph: { icon: Package, tone: 'info', label: 'сумма продаж, ₽' },
  akb: { icon: Store, tone: 'accent', label: 'торговые точки с продажами' },
  distra: { icon: ListChecks, tone: 'warning', label: 'выполнено позиций' },
  salary: { icon: Banknote, tone: 'accent', label: 'фиксированная выплата' },
  fuel: { icon: Fuel, tone: 'info', label: 'фиксированная выплата' },
  fixed: { icon: Banknote, tone: 'accent', label: 'фиксированная выплата' },
  other: { icon: Target, tone: 'info', label: '' },
};

/** «План Балтика, руб (порог 90%, …)» → «План Балтика»; правило видно ниже, полное название — в подсказке. */
export function kpiTitle(t: Pick<KpiTarget, 'product_name' | 'kpi_kind'>): string {
  if (t.kpi_kind === 'ep') return 'Продажи «Есть повод»';
  const name = (t.product_name || 'Показатель')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[,:]?\s*(руб\.?|₽|тт)\s*$/i, '')
    .replace(/[,:]\s*$/, '')
    .trim();
  return name || t.product_name || 'Показатель';
}

const pctText = (p: number) => `${Math.round(p)}%`;

/**
 * Показатель KPI: факт и план, полоса с порогами, сколько заработано сейчас.
 * У KPI из файла всё — по файлу (и прогноз выполнения в процентах), у целей
 * по отчёту — ещё прогноз выплаты к концу месяца при текущем темпе.
 */
export function KpiCard({ target: t, monthEnd, actions }: { target: KpiTarget; monthEnd: string | null; actions?: MenuItem[] }) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const kind = KIND[t.kpi_kind ?? 'other'] ?? KIND.other;
  const Icon = kind.icon;
  const c = t.calc;
  const items = c.items;
  const title = kpiTitle(t);
  const width = Math.max(0, Math.min(100, c.percent));
  const projected = c.forecastPercent != null && c.forecastPercent > c.percent ? Math.min(100, c.forecastPercent) : 0;
  const reached = (c.now ?? 0) > 0;
  const fromFile = t.source === 'kpi_file';
  const percentOnly = t.unit === '%';
  const source = fromFile ? `по файлу KPI${c.asOf ? ` от ${dayMonth(c.asOf)}` : ''}` : c.tracked ? 'по отчёту о продажах' : 'вручную';
  const subtitle = [percentOnly ? 'выполнение, %' : kind.label || (t.metric_type === 'amount' ? 'сумма, ₽' : 'количество'), source].filter(Boolean).join(' · ');
  const filePay = fromFile && t.payment_amount != null ? toNum(t.payment_amount) : null;
  // Прогноз выплаты — у целей по отчёту; у KPI из файла — только прогноз выполнения в процентах.
  const showForecast = !fromFile && c.forecast != null && c.forecastValue != null && monthEnd;
  const fileForecast = fromFile && c.forecastPercent != null && monthEnd ? c.forecastPercent : null;

  return (
    <article className={s.kpi}>
      <div className={s.head}>
        <span className={s.icon} data-tone={kind.tone}>
          <Icon size={21} />
        </span>
        <div className={s.titles}>
          <b title={t.product_name || undefined}>{title}</b>
          <span>{subtitle}</span>
        </div>
        <span className={s.badge} data-reached={reached || undefined}>
          {items ? `${number(t.current_value)} из ${items.length}` : pctText(c.percent)}
        </span>
        {actions && actions.length > 0 && (
          <IconButton label="Действия с показателем" size={34} onClick={(e) => setAnchor(anchorFrom(e.currentTarget))}>
            <MoreHorizontal size={18} />
          </IconButton>
        )}
      </div>

      <div className={s.barWrap} data-marks={c.marks.length > 0 || undefined}>
        <div className={s.bar} role="progressbar" aria-valuenow={Math.round(c.percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`Выполнено ${pctText(c.percent)}`}>
          {projected > 0 && <span className={s.proj} data-tone={kind.tone} style={{ width: `${projected}%` }} />}
          <span className={s.fill} data-tone={kind.tone} style={{ width: `${width}%` }} />
        </div>
        {c.marks.map((m) => (
          <span key={m} className={s.mark} style={{ left: `${m}%` }} data-edge={m >= 95 || undefined}>
            <i />
            <em>{t.kpi_kind === 'ep' && c.marks.length === 1 ? 'порог' : `${m}%`}</em>
          </span>
        ))}
      </div>

      <div className={s.value}>
        {percentOnly ? (
          <>
            Выполнено <b>{pctText(c.percent)}</b>
          </>
        ) : (
          <>
            <b>{kpiValue(t, t.current_value)}</b> <i>из</i> {kpiValue(t, t.target_value)}
          </>
        )}
      </div>
      {fileForecast != null && (
        <p className={s.forecastLine}>
          При текущем темпе к {dayMonth(monthEnd!)} — ≈{pctText(fileForecast)}
        </p>
      )}

      {items && (
        <ul className={s.items}>
          {items.map((it) => (
            <li key={it.name} data-done={it.done || undefined}>
              {it.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              <span>{it.name}</span>
              <small>
                {it.count} из {it.need} ТТ
              </small>
            </li>
          ))}
        </ul>
      )}

      {c.now != null && (
        <div className={s.cells}>
          <div className={s.cell}>
            <span>Заработано сейчас</span>
            <b>{money(c.now)}</b>
          </div>
          {showForecast ? (
            <div className={s.cell} data-accent>
              <span>Прогноз на {dayMonth(monthEnd!)}</span>
              <b>{money(c.forecast)}</b>
              <small>при текущем темпе: {pctText(c.forecastPercent ?? 0)}</small>
            </div>
          ) : (
            <div className={s.cell} data-accent>
              <span>При выполнении плана</span>
              <b>{money(c.max)}</b>
            </div>
          )}
        </div>
      )}

      {c.hint && (
        <p className={s.hint}>
          <TrendingUp size={15} />
          <span>{c.hint}</span>
        </p>
      )}
      {c.condition && <p className={s.rule}>Условие: {c.condition}</p>}
      {(c.rule || filePay != null) && (
        <p className={s.rule}>
          {c.rule && <>Правило: {c.rule}</>}
          {filePay != null && (
            <>
              {c.rule ? ' · ' : ''}по итоговому файлу: <b>{money(filePay)}</b>
            </>
          )}
        </p>
      )}
      {actions && <ActionMenu open={!!anchor} anchor={anchor} items={actions} title={title} onClose={() => setAnchor(null)} />}
    </article>
  );
}
