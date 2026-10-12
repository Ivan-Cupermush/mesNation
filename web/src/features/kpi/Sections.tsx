import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, ShoppingCart } from 'lucide-react';
import { fuzzyMatch } from '../../lib/fuzzy';
import { displayName, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { SearchField } from '../../ui/Field';
import { money, number, progressOf, shortDate, toNum } from './format';
import type { SalesTransaction, Subordinate } from './types';
import s from './kpi.module.css';

/** Секция с заголовком (как «Мои цели (3)» в приложении). */
export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2>
          {title}
          {count != null && <span className={s.count}>{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Выполнено / в работе / просрочено. */
export function TaskStats({ done, inWork, overdue, onOpen }: { done: number; inWork: number; overdue: number; onOpen?: () => void }) {
  const cells = [
    { key: 'done', label: 'Выполнено', value: done, icon: <CheckCircle2 size={20} />, tone: 'success' },
    { key: 'work', label: 'В работе', value: inWork, icon: <Clock size={20} />, tone: 'info' },
    { key: 'late', label: 'Просрочено', value: overdue, icon: <AlertCircle size={20} />, tone: 'danger' },
  ];
  const Cell = onOpen ? 'button' : 'div';
  return (
    <div className={s.taskStats}>
      {cells.map((c) => (
        <Cell key={c.key} {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})} className={s.taskCell}>
          <span data-tone={c.tone}>{c.icon}</span>
          <b>{c.value}</b>
          <span className={s.tileLabel}>{c.label}</span>
        </Cell>
      ))}
    </div>
  );
}

const COLLAPSED = 8;

/** История продаж: товар, дата и клиент, сумма и количество. */
export function SalesHistory({ items }: { items: SalesTransaction[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, COLLAPSED);
  return (
    <div className={s.listCard}>
      {shown.map((tx) => (
        <div key={tx.id} className={s.txRow}>
          <span className={s.txIcon}>
            <ShoppingCart size={16} />
          </span>
          <div className={s.txBody}>
            <b>{tx.product_name || 'Товар'}</b>
            <span>
              {shortDate(tx.transaction_date)}
              {tx.client_name ? ` · ${tx.client_name}` : ''}
              {tx.notes ? ` · ${tx.notes}` : ''}
            </span>
          </div>
          <div className={s.txSum}>
            <b>+{money(tx.amount)}</b>
            {toNum(tx.quantity) !== 1 && <span>{number(tx.quantity)} шт</span>}
          </div>
        </div>
      ))}
      {items.length > COLLAPSED && (
        <button type="button" className={s.more} onClick={() => setAll((v) => !v)}>
          {all ? 'Свернуть' : `Показать все ${items.length}`}
        </button>
      )}
    </div>
  );
}

const revenueOf = (m: Subordinate, fromReports: boolean) => (fromReports ? (m.sales?.revenue ?? 0) : toNum(m.total_amount));

/**
 * Команда руководителя: поиск, выручка за текущий месяц по отчётам о продажах
 * (пока отчётов нет — по продажам, записанным вручную) и средний прогресс KPI.
 */
export function TeamList({ team, avatars }: { team: Subordinate[]; avatars?: Map<number, string | null> }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const fromReports = team.some((m) => m.sales);
  const revenue = (m: Subordinate) => revenueOf(m, fromReports);
  const list = useMemo(() => {
    const q = query.trim();
    const sorted = [...team].sort((a, b) => revenueOf(b, fromReports) - revenueOf(a, fromReports));
    if (!q) return sorted;
    return sorted.filter((m) => fuzzyMatch(`${m.display_name || ''} ${m.username} ${m.role_name || ''}`, q).match);
  }, [team, query, fromReports]);
  const best = Math.max(...team.map(revenue), 1);
  return (
    <div className={s.listCard}>
      {team.length > 5 && <SearchField value={query} onChange={setQuery} placeholder="Поиск по имени" className={s.teamSearch} />}
      {list.length === 0 && <p className={s.muted}>Никого не нашли</p>}
      {list.map((m) => {
        const avg = m.kpis.length ? Math.round(m.kpis.reduce((sum, k) => sum + Math.min(progressOf(k), 150), 0) / m.kpis.length) : null;
        return (
          <button key={m.user_id} type="button" className={s.member} onClick={() => navigate(`/stats/employee/${m.user_id}`)}>
            <Avatar name={displayName(m)} src={avatars?.get(m.user_id) ?? null} size={40} />
            <span className={s.memberBody}>
              <b>{displayName(m)}</b>
              <span>
                {m.role_name || 'Сотрудник'}
                {m.sales && ` · АКБ ${number(m.sales.akb)}`}
                {avg != null && ` · KPI ${avg}%`}
                {m.kpis.length > 0 && ` (${m.kpis.length} ${plural(m.kpis.length, ['цель', 'цели', 'целей'])})`}
              </span>
              <span className={s.memberBar}>
                <span style={{ width: `${Math.max(2, (revenue(m) / best) * 100)}%` }} />
              </span>
            </span>
            <span className={s.memberSum}>{money(revenue(m))}</span>
            <ChevronRight size={18} className={s.chevron} />
          </button>
        );
      })}
    </div>
  );
}
