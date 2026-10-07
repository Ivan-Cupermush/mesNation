import type { PoolClient } from 'pg';
import pool from '../../db/pool';
import { getSubtreeNodeIds, getUserNode } from '../access';
import { computeFact, type ClientLists, type ItemProgress, type ReportLine } from './facts';
import type { KpiKind } from './kpiFile';
import { effectiveRules, maxPayout, payoutFor, ruleMarks, ruleText, rub, type PayoutRule } from './rules';
import { daysInMonth, monthEnd, norm, personScore, personWords } from './text';

type Db = Pick<PoolClient, 'query'>;

// ===================== ПРАВА =====================

export interface KpiScope {
  all: boolean;
  ids: Set<number>;
}

/** Чьи KPI пользователь может загружать и менять: директор — всех, руководитель — своих подчинённых. */
export async function kpiScope(userId: number): Promise<KpiScope | null> {
  const me = await getUserNode(userId);
  if (me.nodeId == null) return null;
  if (me.isRoot) return { all: true, ids: new Set() };
  const nodes = (await getSubtreeNodeIds(me.nodeId)).filter((id) => id !== me.nodeId);
  if (!nodes.length) return null;
  const { rows } = await pool.query('SELECT user_id FROM user_role_assignments WHERE role_node_id = ANY($1::int[])', [nodes]);
  return { all: false, ids: new Set(rows.map((r) => r.user_id as number)) };
}

export const inScope = (scope: KpiScope, userId: number) => scope.all || scope.ids.has(userId);

// ===================== СПИСКИ КЛИЕНТОВ =====================

export async function loadLists(db: Db = pool): Promise<ClientLists> {
  const { rows } = await db.query('SELECT kind, pattern FROM kpi_client_lists ORDER BY id');
  return {
    ep: rows.filter((r) => r.kind === 'ep').map((r) => r.pattern),
    akbMerge: rows.filter((r) => r.kind === 'akb_merge').map((r) => r.pattern),
  };
}

// ===================== ЛЮДИ =====================

export interface PersonMatch {
  userId: number | null;
  userName: string | null;
  /** Несколько похожих сотрудников — нужно выбрать вручную. */
  ambiguous: boolean;
}

/**
 * Сотрудники по именам из отчёта или файла KPI: сначала ручные сопоставления
 * (kpi_name_aliases), затем по словам имени в любом порядке («Мишина Анастасия»
 * = «Анастасия Мишина», ё = е, латиница в логине тоже подходит).
 * candidates — среди кого искать (например, только свои подчинённые).
 */
export async function matchPeople(names: string[], candidates?: Set<number>): Promise<Map<string, PersonMatch>> {
  const out = new Map<string, PersonMatch>();
  const keys = [...new Set(names.map(norm).filter(Boolean))];
  if (!keys.length) return out;
  const [aliases, users] = await Promise.all([
    pool.query(
      `SELECT a.name_key, a.user_id, COALESCE(u.display_name, u.username) AS name
       FROM kpi_name_aliases a JOIN users u ON u.id = a.user_id WHERE a.name_key = ANY($1)`,
      [keys],
    ),
    pool.query('SELECT id, display_name, username FROM users WHERE is_active'),
  ]);
  const aliasBy = new Map(aliases.rows.map((r) => [r.name_key as string, r]));
  const people = users.rows
    .filter((u) => !candidates || candidates.has(u.id))
    .map((u) => ({ id: u.id as number, name: (u.display_name || u.username) as string, words: [personWords(u.display_name), personWords(u.username)] }));
  for (const name of names) {
    const key = norm(name);
    if (!key || out.has(key)) continue;
    const alias = aliasBy.get(key);
    if (alias && (!candidates || candidates.has(alias.user_id))) {
      out.set(key, { userId: alias.user_id, userName: alias.name, ambiguous: false });
      continue;
    }
    const words = personWords(name);
    const need = Math.min(2, words.length);
    let best = 0;
    let found: typeof people = [];
    for (const p of people) {
      const score = Math.max(...p.words.map((w) => personScore(words, w)));
      if (score < need || score < best) continue;
      if (score > best) {
        best = score;
        found = [];
      }
      found.push(p);
    }
    out.set(key, found.length === 1 ? { userId: found[0].id, userName: found[0].name, ambiguous: false } : { userId: null, userName: null, ambiguous: found.length > 1 });
  }
  return out;
}

// ===================== ПЕРЕСЧЁТ ФАКТА =====================

const MONTH_SQL = `to_char(r.month, 'YYYY-MM-DD')`;

/**
 * Пересчитывает факт KPI сотрудника за месяц по всем отчётам этого месяца.
 * Цели с ручным фактом не трогаются. Если отчёты за месяц удалили — факт
 * возвращается к значению из файла KPI.
 */
export async function recalcUserMonth(db: Db, userId: number, month: string, lists: ClientLists): Promise<number> {
  const { rows: targets } = await db.query(
    `SELECT id, product_name, metric_type, kpi_kind, fact_rule, payout_rule, fact_details
     FROM sales_targets
     WHERE user_id = $1 AND NOT is_personal_monthly_target AND period_start >= $2::date AND period_start <= $3::date`,
    [userId, month, monthEnd(month)],
  );
  const tracked = targets.map((t) => ({ t, rules: effectiveRules(t) })).filter((x) => x.rules.fact.type !== 'manual');
  if (!tracked.length) return 0;
  const { rows: lines } = await db.query<ReportLine>(
    `SELECT l.client_name, l.kind, l.group_path, l.name, l.quantity::float8 AS quantity, l.revenue::float8 AS revenue
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.user_id = $1 AND r.month = $2::date`,
    [userId, month],
  );
  let updated = 0;
  for (const { t, rules } of tracked) {
    if (!lines.length) {
      if (t.fact_details?.from === 'report') {
        await db.query(
          `UPDATE sales_targets SET current_value = COALESCE(file_fact, 0), fact_details = NULL, fact_updated_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [t.id],
        );
        updated++;
      }
      continue;
    }
    const res = computeFact(rules.fact, lines, lists);
    if (!res) continue;
    await db.query(
      `UPDATE sales_targets SET current_value = $1, fact_details = $2, fact_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [res.value, JSON.stringify({ from: 'report', ...res.details }), t.id],
    );
    updated++;
  }
  return updated;
}

/** Пересчёт нескольких пар «сотрудник — месяц» (после смены списков, сопоставлений). */
export async function recalcMany(db: Db, pairs: { userId: number; month: string }[]): Promise<number> {
  const lists = await loadLists(db);
  let n = 0;
  const seen = new Set<string>();
  for (const p of pairs) {
    const key = `${p.userId}:${p.month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    n += await recalcUserMonth(db, p.userId, p.month, lists);
  }
  return n;
}

/** Пары «сотрудник — месяц» с отчётами за последние месяцы (считая от последнего отчёта) — для пересчёта после смены списков. */
export async function recentPairs(db: Db, months = 12): Promise<{ userId: number; month: string }[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT l.user_id, ${MONTH_SQL} AS month
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.user_id IS NOT NULL AND r.month >= (SELECT MAX(month) FROM sales_reports) - ($1::int * INTERVAL '1 month')`,
    [months],
  );
  return rows.map((r) => ({ userId: r.user_id, month: r.month }));
}

// ===================== РАСЧЁТ ДЛЯ ЭКРАНА =====================

export interface Coverage {
  /** Последний день, за который есть отчёт. */
  asOf: string;
  /** Дней месяца с данными (с 1-го числа по asOf). */
  elapsed: number;
  days: number;
  reports: number;
  uploadedAt: string;
}

/** До какого числа месяца у сотрудника есть отчёты. */
export async function coverageFor(pairs: { userId: number; month: string }[]): Promise<Map<string, Coverage>> {
  const out = new Map<string, Coverage>();
  const uniq = [...new Map(pairs.map((p) => [`${p.userId}:${p.month}`, p])).values()];
  if (!uniq.length) return out;
  const { rows } = await pool.query(
    `SELECT l.user_id, ${MONTH_SQL} AS month, to_char(MAX(r.period_end), 'YYYY-MM-DD') AS as_of,
            COUNT(DISTINCT r.id)::int AS reports, MAX(r.created_at) AS uploaded_at
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     JOIN unnest($1::int[], $2::date[]) AS p(user_id, month) ON p.user_id = l.user_id AND p.month = r.month
     GROUP BY l.user_id, r.month`,
    [uniq.map((p) => p.userId), uniq.map((p) => p.month)],
  );
  for (const r of rows) {
    const y = Number(r.month.slice(0, 4));
    const m = Number(r.month.slice(5, 7));
    out.set(`${r.user_id}:${r.month}`, {
      asOf: r.as_of,
      elapsed: Number(r.as_of.slice(8, 10)),
      days: daysInMonth(y, m),
      reports: r.reports,
      uploadedAt: new Date(r.uploaded_at).toISOString(),
    });
  }
  return out;
}

export interface TargetCalc {
  kind: KpiKind | null;
  /** Факт считается по отчётам о продажах. */
  tracked: boolean;
  percent: number;
  /** Заработано при текущем факте (null — у показателя нет выплаты). */
  now: number | null;
  /** Прогноз на конец месяца при текущем темпе. */
  forecast: number | null;
  forecastValue: number | null;
  forecastPercent: number | null;
  max: number | null;
  marks: number[];
  rule: string;
  hint: string | null;
  items: ItemProgress[] | null;
  asOf: string | null;
}

interface TargetRow {
  user_id: number;
  product_name: string | null;
  metric_type: string;
  target_value: unknown;
  current_value: unknown;
  bonus_amount?: unknown;
  period_start: unknown;
  kpi_kind?: string | null;
  unit?: string | null;
  fact_rule?: unknown;
  payout_rule?: unknown;
  fact_details?: any;
  file_details?: any;
}

/** Первое число месяца цели (period_start приходит датой или строкой). */
export function monthOfTarget(periodStart: unknown): string {
  if (periodStart instanceof Date) {
    return `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return `${String(periodStart).slice(0, 7)}-01`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const amountText = (value: number, unit: string | null, metric: string) =>
  metric === 'amount' || unit === '₽' ? rub(value) : `${nf.format(Math.ceil(value))} ${unit || 'шт'}`;

function hintFor(t: TargetRow, rule: PayoutRule, v: { plan: number; fact: number }, items: ItemProgress[] | null, daysLeft: number | null): string | null {
  const { plan, fact } = v;
  if (items) {
    const left = items.filter((i) => !i.done);
    return left.length ? `Осталось: ${left.map((i) => `${i.name} (${i.count} из ${i.need} ТТ)`).join(', ')}` : 'Все позиции выполнены';
  }
  if (!(plan > 0)) return null;
  const perDay = (need: number) => (daysLeft && daysLeft > 0 && t.metric_type === 'amount' ? ` (≈${rub(need / daysLeft)} в день)` : '');
  if (rule.type === 'rate') {
    if (fact < rule.min) return `До порога ${rub(rule.min)} — ещё ${rub(rule.min - fact)}`;
    return fact < plan ? `До плана — ещё ${amountText(plan - fact, t.unit ?? null, t.metric_type)}` : 'План выполнен';
  }
  if (rule.type !== 'threshold') return null;
  const pct = (fact / plan) * 100;
  const next = [...rule.steps].sort((a, b) => a.from - b.from).find((s) => s.from > pct + 1e-9);
  if (next) {
    const need = (plan * next.from) / 100 - fact;
    return `До ${nf.format(next.from)}% — ещё ${amountText(need, t.unit ?? null, t.metric_type)}${perDay(need)}`;
  }
  if (pct < 100) return `До плана — ещё ${amountText(plan - fact, t.unit ?? null, t.metric_type)}${perDay(plan - fact)}`;
  return 'План выполнен';
}

/** Выплата сейчас, прогноз, пороги и подсказка — у каждой цели. */
export async function enrichTargets<T extends TargetRow>(rows: T[]): Promise<(T & { calc: TargetCalc })[]> {
  const pairs = rows.map((t) => ({ userId: t.user_id, month: monthOfTarget(t.period_start) }));
  const coverage = await coverageFor(pairs);
  return rows.map((t, i) => {
    const rules = effectiveRules(t);
    const cov = coverage.get(`${pairs[i].userId}:${pairs[i].month}`) ?? null;
    const plan = num(t.target_value);
    const fact = num(t.current_value);
    const bonus = num(t.bonus_amount);
    const tracked = rules.fact.type !== 'manual' && cov != null;
    const items: ItemProgress[] | null =
      rules.fact.type === 'items'
        ? (t.fact_details?.items as ItemProgress[] | undefined) ??
          (t.file_details?.items as ItemProgress[] | undefined) ??
          rules.fact.items.map((it) => ({ name: it.name, need: it.need, count: 0, done: false }))
        : null;
    const total = items ? items.length : 0;
    const payable = rules.payout.type !== 'none';
    const now = payable ? payoutFor(rules.payout, { plan, fact, bonus, done: fact, total }) : null;
    let forecastValue: number | null = null;
    let forecast = now;
    if (tracked && cov && rules.fact.type === 'revenue' && cov.elapsed > 0 && cov.elapsed < cov.days) {
      forecastValue = Math.round(((fact * cov.days) / cov.elapsed) * 100) / 100;
      forecast = payable ? payoutFor(rules.payout, { plan, fact: forecastValue, bonus }) : null;
    }
    const daysLeft = tracked && cov ? cov.days - cov.elapsed : null;
    const calc: TargetCalc = {
      kind: (t.kpi_kind as KpiKind | null) ?? null,
      tracked,
      percent: plan > 0 ? Math.round((fact / plan) * 1000) / 10 : 0,
      now,
      forecast,
      forecastValue,
      forecastPercent: forecastValue != null && plan > 0 ? Math.round((forecastValue / plan) * 1000) / 10 : null,
      max: payable ? maxPayout(rules.payout, plan, bonus) : null,
      marks: ruleMarks(rules.payout, plan),
      rule: ruleText(rules.payout, bonus, total),
      hint: rules.payout.type === 'fixed' ? null : hintFor(t, rules.payout, { plan, fact }, items, daysLeft),
      items,
      asOf: tracked && cov ? cov.asOf : null,
    };
    return { ...t, fact_rule: rules.fact, payout_rule: rules.payout, calc };
  });
}

export interface KpiTotals {
  /** Оклад, ГСМ и другие фиксированные выплаты. */
  fixed: number;
  now: number;
  forecast: number;
  max: number;
  /** К выплате по итоговому файлу KPI (null — итогов в файле нет). */
  file: number | null;
}

export function totalsOf(targets: { source?: string; payment_amount?: unknown; payout_rule?: unknown; calc: TargetCalc }[]): KpiTotals {
  let fixed = 0;
  let now = 0;
  let forecast = 0;
  let max = 0;
  let file: number | null = null;
  for (const t of targets) {
    const isFixed = (t.payout_rule as PayoutRule | undefined)?.type === 'fixed';
    if (isFixed) fixed += t.calc.now ?? 0;
    now += t.calc.now ?? 0;
    forecast += t.calc.forecast ?? t.calc.now ?? 0;
    max += t.calc.max ?? 0;
    if (t.source === 'kpi_file' && t.payment_amount != null) file = (file ?? 0) + num(t.payment_amount);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { fixed: r(fixed), now: r(now), forecast: r(forecast), max: r(max), file: file == null ? null : r(file) };
}
