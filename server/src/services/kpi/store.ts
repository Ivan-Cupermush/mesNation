import type { PoolClient } from 'pg';
import pool from '../../db/pool';
import { inScope, permissionScope, type Permission, type Scope } from '../permissions';
import { computeFact, type ClientLists, type ItemProgress, type ReportLine } from './facts';
import type { KpiKind } from './kpiFile';
import { effectiveRules, maxPayout, payoutFor, ruleMarks, ruleText, rub, type PayoutRule } from './rules';
import { daysInMonth, monthEnd, norm, personScore, personWords, workDays } from './text';

type Db = Pick<PoolClient, 'query'>;

// ===================== ПРАВА =====================

export type KpiScope = Scope;
export { inScope };

/**
 * Чьи KPI пользователь может загружать и менять этой функцией: директор — всех,
 * руководитель — своих подчинённых, сотрудник — если функцию ему включили.
 */
export const kpiScope = (userId: number, permission: Permission) => permissionScope(userId, permission);

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
 * Пересчитывает по отчётам о продажах цели сотрудника, заведённые вручную
 * (KPI из файла не трогаются — их факт приходит из файла KPI): все цели,
 * период которых задевает месяц; в каждую идут отчёты, пересекающиеся с её
 * периодом. Если таких отчётов не осталось — факт обнуляется.
 */
export async function recalcUserMonth(db: Db, userId: number, month: string, lists: ClientLists): Promise<number> {
  const { rows: targets } = await db.query(
    `SELECT id, product_name, metric_type, kpi_kind, fact_rule, payout_rule, fact_details,
            to_char(period_start, 'YYYY-MM-DD') AS ps, to_char(period_end, 'YYYY-MM-DD') AS pe
     FROM sales_targets
     WHERE user_id = $1 AND NOT is_personal_monthly_target AND source <> 'kpi_file'
       AND period_start <= $3::date AND period_end >= $2::date`,
    [userId, month, monthEnd(month)],
  );
  const tracked = targets.map((t) => ({ t, rules: effectiveRules(t) })).filter((x) => x.rules.fact.type !== 'manual');
  if (!tracked.length) return 0;
  const from = tracked.reduce((m, x) => (x.t.ps < m ? x.t.ps : m), tracked[0].t.ps);
  const to = tracked.reduce((m, x) => (x.t.pe > m ? x.t.pe : m), tracked[0].t.pe);
  const { rows: all } = await db.query<ReportLine & { rs: string; re: string }>(
    `SELECT l.client_name, l.kind, l.group_path, l.name, l.quantity::float8 AS quantity, l.revenue::float8 AS revenue,
            to_char(r.period_start, 'YYYY-MM-DD') AS rs, to_char(r.period_end, 'YYYY-MM-DD') AS re
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.user_id = $1 AND r.period_start <= $3::date AND r.period_end >= $2::date`,
    [userId, from, to],
  );
  let updated = 0;
  for (const { t, rules } of tracked) {
    const lines = all.filter((l) => l.rs <= t.pe && l.re >= t.ps);
    if (!lines.length) {
      if (t.fact_details?.from === 'report') {
        await db.query(`UPDATE sales_targets SET current_value = 0, fact_details = NULL, fact_updated_at = NOW(), updated_at = NOW() WHERE id = $1`, [t.id]);
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
  /** Рабочих дней (пн–сб) с 1-го числа по asOf и во всём месяце. */
  workElapsed: number;
  workDays: number;
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
      workElapsed: workDays(y, m, Number(r.as_of.slice(8, 10))),
      workDays: workDays(y, m),
      reports: r.reports,
      uploadedAt: new Date(r.uploaded_at).toISOString(),
    });
  }
  return out;
}

export interface SalesStats {
  /** Выручка с 1-го числа по последний отчёт. */
  revenue: number;
  /** АКБ: клиенты с продажами, без «Есть повод», задвоенные — одна точка. */
  akb: number;
  /** Средняя сумма продаж в рабочий день: выручка / рабочих дней (пн–сб) с 1-го числа по последний отчёт. */
  perDay: number;
  /** Продано, шт (все товары). */
  quantity: number;
  asOf: string;
  elapsed: number;
  days: number;
  workElapsed: number;
  workDays: number;
  reports: number;
  uploadedAt: string;
}

/**
 * Квадратики статистики по отчётам о продажах за месяц: выручка, АКБ, средняя
 * продажа в день и проданные штуки. Нет отчётов — сотрудника нет в результате.
 */
export async function reportStats(userIds: number[], month: string, lists?: ClientLists): Promise<Map<number, SalesStats>> {
  const out = new Map<number, SalesStats>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const [cov, lines, l] = await Promise.all([
    coverageFor(ids.map((userId) => ({ userId, month }))),
    pool.query<ReportLine & { user_id: number }>(
      `SELECT l.user_id, l.client_name, l.kind, l.group_path, l.name, l.quantity::float8 AS quantity, l.revenue::float8 AS revenue
       FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
       WHERE l.kind = 'total' AND r.month = $2::date AND l.user_id = ANY($1::int[])`,
      [ids, month],
    ),
    lists ? Promise.resolve(lists) : loadLists(),
  ]);
  for (const id of ids) {
    const c = cov.get(`${id}:${month}`);
    if (!c) continue;
    const mine = lines.rows.filter((r) => r.user_id === id);
    const revenue = mine.reduce((sum, r) => sum + Number(r.revenue), 0);
    const quantity = mine.reduce((sum, r) => sum + Number(r.quantity), 0);
    const akb = computeFact({ type: 'clients', groups: [], excludeEp: true, merge: [] }, mine, l)?.value ?? 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    out.set(id, { revenue: r2(revenue), akb, perDay: r2(revenue / Math.max(1, c.workElapsed)), quantity: r2(quantity), ...c });
  }
  return out;
}

export interface TargetCalc {
  kind: KpiKind | null;
  /** Откуда факт: file — файл KPI, report — отчёты о продажах, manual — вручную. */
  source: 'file' | 'report' | 'manual';
  /** Факт считается по отчётам о продажах (и отчёты за период есть). */
  tracked: boolean;
  percent: number;
  /** Заработано: из файла KPI («к выплате»), иначе по правилу (null — у показателя нет выплаты). */
  now: number | null;
  /** Прогноз выплаты (для целей по отчётам); у KPI из файла — как now. */
  forecast: number | null;
  forecastValue: number | null;
  /** Выполнение к концу месяца при текущем темпе, %. */
  forecastPercent: number | null;
  max: number | null;
  marks: number[];
  rule: string;
  /** Условие из названия показателя в файле KPI («порог 90%, при выполнении 80–90% кэф 0,5»). */
  condition: string | null;
  hint: string | null;
  items: ItemProgress[] | null;
  /** Дата данных: последний отчёт о продажах или загрузка файла KPI. */
  asOf: string | null;
}

interface TargetRow {
  user_id: number;
  product_name: string | null;
  metric_type: string;
  target_value: unknown;
  current_value: unknown;
  bonus_amount?: unknown;
  payment_amount?: unknown;
  target_percent?: unknown;
  source?: string;
  description?: string | null;
  fact_updated_at?: unknown;
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
  const perDay = (need: number) => (daysLeft && daysLeft > 0 && t.metric_type === 'amount' ? ` (≈${rub(need / daysLeft)} в рабочий день)` : '');
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

/** «План ОПХ, руб (порог 90%, При выполнении 80-90% кэф 0,5)» → «порог 90%, При выполнении 80-90% кэф 0,5». */
export function conditionOf(name: string | null): string | null {
  const parts = [...(name || '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

const isoDay = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Выплата, выполнение, прогноз, пороги и подсказка — у каждой цели. */
export async function enrichTargets<T extends TargetRow>(rows: T[]): Promise<(T & { calc: TargetCalc })[]> {
  const pairs = rows.map((t) => ({ userId: t.user_id, month: monthOfTarget(t.period_start) }));
  const coverage = await coverageFor(pairs);
  const today = isoDay(new Date())!;
  return rows.map((t, i) => {
    const rules = effectiveRules(t);
    const month = pairs[i].month;
    const plan = num(t.target_value);
    const fact = num(t.current_value);
    const bonus = num(t.bonus_amount);
    const payable = rules.payout.type !== 'none';
    const [year, mon] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
    const days = daysInMonth(year, mon);
    // Темп продаж — по рабочим дням (пн–сб): воскресенье — выходной.
    const monthWork = workDays(year, mon);

    if (t.source === 'kpi_file') {
      // KPI из файла: факт, процент и «к выплате» — как в файле; темп — по дате загрузки.
      const items = (t.file_details?.items as ItemProgress[] | undefined) ?? null;
      const percent = t.target_percent != null ? num(t.target_percent) : plan > 0 ? (fact / plan) * 100 : 0;
      // Показатель «да/нет» с процентом выполнения: бонус по позициям — пропорционально проценту.
      const total = items?.length ?? (t.unit === '%' ? plan : 0);
      const now = t.payment_amount != null ? num(t.payment_amount) : payable ? payoutFor(rules.payout, { plan, fact, bonus, done: fact, total }) : null;
      const asOf = isoDay(t.fact_updated_at);
      const elapsed = asOf && asOf.slice(0, 7) === month.slice(0, 7) && month.slice(0, 7) === today.slice(0, 7) ? Number(asOf.slice(8, 10)) : null;
      // Темп считаем только для сумм продаж: точки и позиции к концу месяца не растут пропорционально дням.
      const projectable = !items && t.unit !== '%' && t.metric_type === 'amount' && rules.payout.type !== 'fixed' && plan > 0;
      const workElapsed = elapsed ? Math.max(1, workDays(year, mon, elapsed)) : null;
      const forecastValue = projectable && workElapsed && elapsed! < days ? Math.round(((fact * monthWork) / workElapsed) * 100) / 100 : null;
      const calc: TargetCalc = {
        kind: (t.kpi_kind as KpiKind | null) ?? null,
        source: 'file',
        tracked: false,
        percent: Math.round(percent * 10) / 10,
        now,
        forecast: now,
        forecastValue,
        forecastPercent: forecastValue != null ? Math.round((forecastValue / plan) * 1000) / 10 : null,
        max: payable ? maxPayout(rules.payout, plan, bonus) : null,
        marks: t.unit === '%' ? [] : ruleMarks(rules.payout, plan),
        rule: ruleText(rules.payout, bonus, items?.length ?? 0),
        condition: conditionOf(t.product_name),
        hint:
          rules.payout.type === 'fixed'
            ? null
            : t.unit === '%'
              ? t.description
                ? `Позиции: ${t.description.split('; ').join(', ')}`
                : null
              : hintFor(t, rules.payout, { plan, fact }, items, workElapsed ? monthWork - workElapsed : null),
        items,
        asOf,
      };
      return { ...t, fact_rule: rules.fact, payout_rule: rules.payout, calc };
    }

    const cov = coverage.get(`${pairs[i].userId}:${month}`) ?? null;
    const tracked = rules.fact.type !== 'manual' && cov != null;
    const items: ItemProgress[] | null =
      rules.fact.type === 'items'
        ? (t.fact_details?.items as ItemProgress[] | undefined) ??
          rules.fact.items.map((it) => ({ name: it.name, need: it.need, count: 0, done: false }))
        : null;
    const total = items ? items.length : 0;
    const now = payable ? payoutFor(rules.payout, { plan, fact, bonus, done: fact, total }) : null;
    let forecastValue: number | null = null;
    let forecast = now;
    const projectable = rules.fact.type === 'revenue' || (rules.fact.type === 'products' && rules.fact.measure !== 'clients');
    if (tracked && cov && projectable && cov.elapsed > 0 && cov.elapsed < cov.days) {
      forecastValue = Math.round(((fact * cov.workDays) / Math.max(1, cov.workElapsed)) * 100) / 100;
      forecast = payable ? payoutFor(rules.payout, { plan, fact: forecastValue, bonus }) : null;
    }
    const daysLeft = tracked && cov ? cov.workDays - cov.workElapsed : null;
    const calc: TargetCalc = {
      kind: (t.kpi_kind as KpiKind | null) ?? null,
      source: rules.fact.type === 'manual' ? 'manual' : 'report',
      tracked,
      percent: plan > 0 ? Math.round((fact / plan) * 1000) / 10 : 0,
      now,
      forecast,
      forecastValue,
      forecastPercent: forecastValue != null && plan > 0 ? Math.round((forecastValue / plan) * 1000) / 10 : null,
      max: payable ? maxPayout(rules.payout, plan, bonus) : null,
      marks: ruleMarks(rules.payout, plan),
      rule: ruleText(rules.payout, bonus, total),
      condition: null,
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

export function totalsOf(targets: { source?: string; payment_amount?: unknown; payout_rule?: unknown; kpi_kind?: string | null; calc: TargetCalc }[]): KpiTotals {
  let fixed = 0;
  let now = 0;
  let forecast = 0;
  let max = 0;
  let file: number | null = null;
  for (const t of targets) {
    if (t.kpi_kind === 'fuel') continue;
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
