import type { PoolClient } from 'pg';
import pool, { withTransaction } from '../../db/pool';
import { conflict, forbidden } from '../../lib/errors';
import { PATH_SEP } from './facts';
import type { KpiFile, KpiMetric } from './kpiFile';
import { defaultRules } from './rules';
import { parseSalesReport } from './salesReport';
import { inScope, kpiScope, loadLists, matchPeople, recalcUserMonth } from './store';
import { matchesClient, monthEnd, norm } from './text';

type Db = Pick<PoolClient, 'query'>;

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ===================== ОТЧЁТ О ПРОДАЖАХ =====================

export interface ReportManagerResult {
  manager: string;
  user: string | null;
  userId: number | null;
  total: number;
  ep: number;
  noEp: number;
  clients: number;
  updated: boolean;
  targetsUpdated: number;
  /** ok — загружено; unmatched/ambiguous — сотрудник не найден (можно выбрать вручную); forbidden — не ваш подчинённый. */
  status: 'ok' | 'unmatched' | 'ambiguous' | 'forbidden' | 'no_manager';
  error?: string;
}

export interface ReportImportResult {
  success: true;
  /** null — сохранять нечего (все менеджеры чужие или без менеджера). */
  report: { id: number; file_name: string; period_start: string; period_end: string; month: string; total_revenue: number } | null;
  /** Прежние отчёты за этот период, которые заменил новый. */
  replaced: number;
  results: ReportManagerResult[];
  epListEmpty: boolean;
  warnings: string[];
}

/**
 * Загрузка отчёта о продажах. Подходят и нарастающие отчёты (1–15, затем 1–16 —
 * новый заменяет старый), и отчёты за один день (1-е, 2-е, … — складываются).
 * Отчёт, который частично пересекается с уже загруженным, отклоняется — иначе
 * продажи посчитались бы дважды.
 */
export async function importSalesReport(buffer: Buffer, fileName: string, uploaderId: number): Promise<ReportImportResult> {
  const scope = await kpiScope(uploaderId);
  if (!scope) throw forbidden('Загружать отчёт о продажах может руководитель или директор');
  const report = parseSalesReport(buffer);
  const lists = await loadLists();
  const isEp = (client: string) => lists.ep.some((p) => matchesClient(client, p));

  const people = await matchPeople(report.blocks.map((b) => b.manager));
  const byManager = new Map<string, { name: string; blocks: typeof report.blocks }>();
  for (const b of report.blocks) {
    const key = norm(b.manager);
    if (!byManager.has(key)) byManager.set(key, { name: b.manager, blocks: [] });
    byManager.get(key)!.blocks.push(b);
  }

  const results: ReportManagerResult[] = [];
  const store: { key: string; name: string; userId: number | null; blocks: typeof report.blocks }[] = [];
  for (const [key, m] of byManager) {
    const total = round2(m.blocks.reduce((s, b) => s + b.revenue, 0));
    const ep = round2(m.blocks.filter((b) => isEp(b.client)).reduce((s, b) => s + b.revenue, 0));
    const clients = new Set(m.blocks.filter((b) => b.revenue > 0).map((b) => norm(b.client))).size;
    const base = { manager: m.name || 'Без менеджера', total, ep, noEp: round2(total - ep), clients, updated: false, targetsUpdated: 0 };
    if (!key) {
      results.push({ ...base, user: null, userId: null, status: 'no_manager', error: 'Продажи без менеджера — не учитываются' });
      continue;
    }
    const match = people.get(key);
    if (!match?.userId) {
      results.push({
        ...base,
        user: null,
        userId: null,
        status: match?.ambiguous ? 'ambiguous' : 'unmatched',
        error: match?.ambiguous ? 'Подходит несколько сотрудников — выберите вручную' : 'Сотрудник не найден — выберите вручную',
      });
      store.push({ key, name: m.name, userId: null, blocks: m.blocks });
      continue;
    }
    if (!inScope(scope, match.userId)) {
      results.push({ ...base, user: match.userName, userId: match.userId, status: 'forbidden', error: 'Нет прав: не ваш подчинённый' });
      continue;
    }
    results.push({ ...base, user: match.userName, userId: match.userId, status: 'ok' });
    store.push({ key, name: m.name, userId: match.userId, blocks: m.blocks });
  }

  const userIds = [...new Set(store.map((s) => s.userId).filter((id): id is number => id != null))];
  const unmatchedKeys = store.filter((s) => s.userId == null).map((s) => s.key);
  const sameOwner = `(l.user_id = ANY($4::int[]) OR (l.user_id IS NULL AND l.manager_key = ANY($5::text[])))`;
  const params = [report.month, report.periodStart, report.periodEnd, userIds, unmatchedKeys];

  // Пересечение, которое нельзя разрешить заменой: старый отчёт шире нового или выходит за его границы.
  const clash = await pool.query(
    `SELECT DISTINCT r.id, to_char(r.period_start, 'YYYY-MM-DD') AS s, to_char(r.period_end, 'YYYY-MM-DD') AS e
     FROM sales_reports r JOIN sales_report_lines l ON l.report_id = r.id
     WHERE r.month = $1::date AND r.period_start <= $3::date AND r.period_end >= $2::date
       AND NOT (r.period_start >= $2::date AND r.period_end <= $3::date) AND ${sameOwner}
     ORDER BY 2`,
    params,
  );
  if (clash.rows.length) {
    const old = clash.rows.map((r) => (r.s === r.e ? dm(r.s) : `${dm(r.s)}–${dm(r.e)}`)).join(', ');
    const now = report.periodStart === report.periodEnd ? dm(report.periodStart) : `${dm(report.periodStart)}–${dm(report.periodEnd)}`;
    throw conflict(
      `Продажи за ${now} уже входят в загруженный отчёт за ${old}. Загрузите отчёт, который полностью покрывает прежний ` +
        `(например, с 1-го числа по сегодня), или удалите прежний отчёт в истории загрузок.`,
    );
  }

  if (!store.length) {
    return { success: true, report: null, replaced: 0, results, epListEmpty: lists.ep.length === 0, warnings: report.warnings.slice(0, 20) };
  }

  return withTransaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO sales_reports (uploaded_by, file_name, period_start, period_end, month, total_revenue)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_name, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end,
                 to_char(month, 'YYYY-MM-DD') AS month, total_revenue::float8 AS total_revenue`,
      [uploaderId, fileName.slice(0, 255), report.periodStart, report.periodEnd, report.month, report.total],
    );
    const saved = inserted.rows[0];

    const rows: unknown[][] = [];
    for (const s of store) {
      for (const b of s.blocks) {
        const common = [saved.id, s.userId, s.name.slice(0, 255), s.key.slice(0, 255), b.client.slice(0, 500)];
        rows.push([...common, 'total', 0, '', b.client.slice(0, 500), b.quantity, b.revenue]);
        for (const n of b.nodes) rows.push([...common, n.kind, n.depth, n.path.join(PATH_SEP), n.name.slice(0, 500), n.quantity, n.revenue]);
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = chunk.map((_, r) => `(${Array.from({ length: 11 }, (__, c) => `$${r * 11 + c + 1}`).join(',')})`).join(',');
      await db.query(
        `INSERT INTO sales_report_lines (report_id, user_id, manager_name, manager_key, client_name, kind, depth, group_path, name, quantity, revenue)
         VALUES ${values}`,
        chunk.flat(),
      );
    }

    // Прежние отчёты внутри нового периода заменяются (для тех же сотрудников).
    const removed = await db.query(
      `DELETE FROM sales_report_lines l USING sales_reports r
       WHERE l.report_id = r.id AND r.id <> $6 AND r.month = $1::date
         AND r.period_start >= $2::date AND r.period_end <= $3::date AND ${sameOwner}
       RETURNING r.id`,
      [...params, saved.id],
    );
    await db.query(
      `DELETE FROM sales_reports r WHERE r.id <> $1 AND r.month = $2::date
         AND NOT EXISTS (SELECT 1 FROM sales_report_lines l WHERE l.report_id = r.id)`,
      [saved.id, report.month],
    );

    for (const r of results) {
      if (r.status !== 'ok' || r.userId == null) continue;
      r.targetsUpdated = await recalcUserMonth(db, r.userId, report.month, lists);
      r.updated = r.targetsUpdated > 0;
    }
    return {
      success: true as const,
      report: saved,
      replaced: new Set(removed.rows.map((r) => r.id)).size,
      results,
      epListEmpty: lists.ep.length === 0,
      warnings: report.warnings.slice(0, 20),
    };
  });
}

/** Удаление отчёта (ошибочный файл): факт KPI пересчитывается без него. */
export async function deleteSalesReport(reportId: number, userId: number): Promise<boolean> {
  const scope = await kpiScope(userId);
  if (!scope) throw forbidden('Удалять отчёты может руководитель или директор');
  const { rows } = await pool.query(
    `SELECT r.uploaded_by, to_char(r.month, 'YYYY-MM-DD') AS month,
            ARRAY(SELECT DISTINCT l.user_id FROM sales_report_lines l WHERE l.report_id = r.id AND l.user_id IS NOT NULL) AS users
     FROM sales_reports r WHERE r.id = $1`,
    [reportId],
  );
  if (!rows.length) return false;
  const r = rows[0];
  const users: number[] = r.users;
  if (!scope.all && r.uploaded_by !== userId && users.some((u) => !inScope(scope, u))) {
    throw forbidden('Этот отчёт загрузил другой руководитель, и в нём есть не ваши сотрудники');
  }
  await withTransaction(async (db) => {
    await db.query('DELETE FROM sales_reports WHERE id = $1', [reportId]);
    const lists = await loadLists(db);
    for (const u of users) await recalcUserMonth(db, u, r.month, lists);
  });
  return true;
}

// ===================== ФАЙЛ KPI =====================

/** Названия групп товаров из недавних отчётов — для подбора правил новых показателей. */
export async function knownGroups(db: Db = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT l.name FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.kind = 'group' AND r.month >= (SELECT MAX(month) FROM sales_reports) - INTERVAL '3 months'
     LIMIT 3000`,
  );
  return rows.map((r) => r.name);
}

function metricShape(m: KpiMetric): { metric: string; unit: string | null } {
  const s = norm(m.name);
  if (m.fixed) return { metric: 'amount', unit: null };
  if (m.kind === 'akb') return { metric: 'quantity', unit: 'ТТ' };
  if (m.items.length) return { metric: 'quantity', unit: 'поз.' };
  if (m.yesNo) return { metric: 'boolean', unit: null };
  if (/руб|₽|выручк|сумм/.test(s) || m.rate != null) return { metric: 'amount', unit: null };
  if (/(^|[^а-я])тт([^а-я]|$)|точ/.test(s)) return { metric: 'quantity', unit: 'ТТ' };
  if (/(^|[^а-я])шт([^а-я]|$)/.test(s)) return { metric: 'quantity', unit: 'шт' };
  return { metric: m.plan >= 1000 ? 'amount' : 'quantity', unit: null };
}

const ruleKey = (kind: string | null, name: string | null) => (kind && kind !== 'other' ? kind : `name:${norm(name)}`);

/**
 * Сохраняет показатели файла KPI сотруднику за месяц: прежние показатели из
 * файла за этот месяц заменяются, цели, созданные вручную, остаются. Правила,
 * которые руководитель поправил, переносятся на новые показатели.
 */
export async function saveKpiFile(db: Db, opts: { userId: number; month: string; file: KpiFile; byUserId: number }) {
  const { userId, month, file, byUserId } = opts;
  const end = monthEnd(month);
  const custom = await db.query(
    `SELECT kpi_kind, product_name, fact_rule, payout_rule FROM sales_targets
     WHERE user_id = $1 AND source = 'kpi_file' AND rules_custom AND period_start >= $2::date AND period_start <= $3::date`,
    [userId, month, end],
  );
  const kept = new Map(custom.rows.map((r) => [ruleKey(r.kpi_kind, r.product_name), r]));
  // Показатели из файла за месяц (и строки старого импорта — у них есть бонус) заменяются.
  const removed = await db.query(
    `DELETE FROM sales_targets
     WHERE user_id = $1 AND period_start >= $2::date AND period_start <= $3::date AND NOT is_personal_monthly_target
       AND (source = 'kpi_file' OR (source = 'manual' AND COALESCE(bonus_amount, 0) > 0))`,
    [userId, month, end],
  );
  const groups = await knownGroups(db);
  const ids: number[] = [];
  for (const [i, m] of file.metrics.entries()) {
    const shape = metricShape(m);
    const defaults = defaultRules(m, groups);
    const keep = kept.get(ruleKey(m.kind, m.name));
    const fileItems = m.items.length
      ? { items: m.items.map((it) => ({ name: it.name, need: it.need, count: it.fileCount ?? (it.fileDone ? it.need : 0), done: !!it.fileDone })) }
      : null;
    const percent = m.filePercent ?? (m.plan > 0 && m.fact != null ? (m.fact / m.plan) * 100 : 0);
    const r = await db.query(
      `INSERT INTO sales_targets
         (user_id, product_name, metric_type, target_value, current_value, period_start, period_end,
          bonus_amount, payment_amount, target_percent, description, created_by,
          kpi_kind, source, unit, fact_rule, payout_rule, rules_custom, file_fact, file_details, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'kpi_file',$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        userId,
        m.name.slice(0, 255),
        shape.metric,
        round2(m.plan),
        round2(m.fact ?? 0),
        month,
        end,
        round2(m.bonus),
        file.hasResults ? round2(m.payment ?? 0) : null,
        Math.round(percent * 10) / 10,
        m.items.map((it) => it.name).join('; ') || null,
        byUserId,
        m.kind,
        shape.unit,
        JSON.stringify(keep?.fact_rule ?? defaults.fact),
        JSON.stringify(keep?.payout_rule ?? defaults.payout),
        !!keep,
        m.fact != null ? round2(m.fact) : null,
        fileItems ? JSON.stringify(fileItems) : null,
        i,
      ],
    );
    ids.push(r.rows[0].id);
  }
  await recalcUserMonth(db, userId, month, await loadLists(db));
  const { rows } = await db.query('SELECT * FROM sales_targets WHERE id = ANY($1::int[]) ORDER BY sort_order', [ids]);
  return { targets: rows, replaced: removed.rowCount ?? 0 };
}
