import { useState, type ReactNode } from 'react';
import { MoreHorizontal, Trophy } from 'lucide-react';
import { IconButton } from '../../ui/Button';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { metricShort, metricValue, money, periodLabel, progressOf, toNum } from './format';
import type { SalesTarget } from './types';
import s from './kpi.module.css';

interface Props {
  target: SalesTarget;
  /** Заголовок вместо названия товара (например, «Общий план на месяц»). */
  title?: string;
  icon?: ReactNode;
  tone?: 'accent' | 'info' | 'violet';
  note?: ReactNode;
  actions?: MenuItem[];
}

/** Цель KPI с прогрессом — как карточки «Мои цели» в приложении. */
export function TargetCard({ target: t, title, icon, tone = 'info', note, actions }: Props) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const pct = progressOf(t);
  const bonus = toNum(t.bonus_amount);
  const payment = toNum(t.payment_amount);
  const name = title || t.product_name || 'Цель';
  return (
    <article className={s.target}>
      <div className={s.targetHead}>
        <span className={s.targetIcon} data-tone={tone}>
          {icon || <Trophy size={20} />}
        </span>
        <div className={s.targetTitles}>
          <b title={name}>{name}</b>
          <span>
            {title && t.product_name ? `${t.product_name} · ` : ''}
            {metricShort(t.metric_type)} · {periodLabel(t)}
          </span>
        </div>
        <span className={s.badge} data-done={pct >= 100 || undefined}>
          {pct}%
        </span>
        {actions && actions.length > 0 && (
          <IconButton label="Действия с целью" size={34} onClick={(e) => setAnchor(anchorFrom(e.currentTarget))}>
            <MoreHorizontal size={18} />
          </IconButton>
        )}
      </div>
      <div className={s.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Выполнено ${pct}%`}>
        <span data-tone={tone} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className={s.targetFoot}>
        <span className={s.targetNote}>{note}</span>
        <span className={s.targetValue}>
          {metricValue(t.metric_type, t.current_value)} <i>из</i> {metricValue(t.metric_type, t.target_value)}
        </span>
      </div>
      {(bonus > 0 || payment > 0) && (
        <div className={s.targetMoney}>
          {bonus > 0 && <span>Бонус: {money(bonus)}</span>}
          {payment > 0 && <span>К выплате: {money(payment)}</span>}
        </div>
      )}
      {t.description && <p className={s.targetDesc}>{t.description}</p>}
      {actions && <ActionMenu open={!!anchor} anchor={anchor} items={actions} title={name} onClose={() => setAnchor(null)} />}
    </article>
  );
}
