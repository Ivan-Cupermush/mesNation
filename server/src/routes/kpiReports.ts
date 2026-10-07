import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { fixOriginalName } from '../lib/uploads';
import { paramId } from '../lib/validate';
import { isSubordinate } from '../services/access';
import { PATH_SEP } from '../services/kpi/facts';
import { deleteSalesReport } from '../services/kpi/imports';
import { coverageFor, enrichTargets, inScope, kpiScope, recalcMany, recentPairs, totalsOf, type KpiScope } from '../services/kpi/store';
import { cellText, matchesClient, monthEnd, norm } from '../services/kpi/text';

/**
 * KPI по отчётам о продажах: экран месяца, история отчётов, списки клиентов
 * («Есть повод», задвоенные), сопоставление менеджеров из 1С с сотрудниками.
 * Загрузка самих отчётов — POST /api/kpi/sales/import-report.
 */
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    file.originalname = fixOriginalName(file.originalname);
    if (['.xlsx', '.xls', '.xlsm', '.csv', '.ods', '.txt'].includes(path.extname(file.originalname).toLowerCase()) || /spreadsheet|excel|text\//i.test(file.mimetype)) {
      cb(null, true);
    } else cb(badRequest('Загрузите список в Excel (.xlsx, .xls) или текстом (.csv, .txt)'));
  },
});

const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Месяц в формате ГГГГ-ММ')
  .optional();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const monthFrom = (v: unknown) => {
  const m = monthParam.parse(v === '' ? undefined : v);
  return m ? `${m}-01` : currentMonth();
};

async function requireScope(userId: number): Promise<KpiScope> {
  const scope = await kpiScope(userId);
  if (!scope) throw forbidden('Доступно руководителям и директору');
  return scope;
}

/** Условие на строки отчётов, видимые руководителю ($N — массив id подчинённых). */
const scopeSql = (scope: KpiScope, param: number) => (scope.all ? 'TRUE' : `l.user_id = ANY($${param}::int[])`);
const scopeIds = (scope: KpiScope) => [...scope.ids];

// ===================== ЭКРАН МЕСЯЦА =====================

/**
 * GET /api/kpi/month?user=&month=YYYY-MM — KPI сотрудника за месяц: цели с
 * выплатой «сейчас» и прогнозом, итоги, до какого числа есть отчёты.
 */
router.get('/month', async (req: AuthRequest, res: Response) => {
  const me = req.userId!;
  const userId = req.query.user ? Number(req.query.user) : me;
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Некорректный сотрудник');
  const canEdit = userId !== me && (await isSubordinate(me, userId));
  if (userId !== me && !canEdit) throw forbidden('KPI доступны только по своим подчинённым');
  const month = monthFrom(req.query.month);
  const end = monthEnd(month);

  const [user, targets, reports, months, lists, scope] = await Promise.all([
    pool.query('SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id = $1', [userId]),
    pool.query(
      `SELECT *, ROUND((current_value / NULLIF(target_value, 0) * 100)::numeric, 1) AS progress_percent
       FROM sales_targets
       WHERE user_id = $1 AND NOT is_personal_monthly_target AND period_start >= $2::date AND period_start <= $3::date
       ORDER BY (source = 'kpi_file') DESC, sort_order, created_at`,
      [userId, month, end],
    ),
    pool.query(
      `SELECT r.id, r.file_name, to_char(r.period_start, 'YYYY-MM-DD') AS period_start, to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
              r.created_at, COALESCE(u.display_name, u.username) AS uploaded_by_name
       FROM sales_reports r LEFT JOIN users u ON u.id = r.uploaded_by
       WHERE r.month = $2::date AND EXISTS (SELECT 1 FROM sales_report_lines l WHERE l.report_id = r.id AND l.user_id = $1)
       ORDER BY r.period_start`,
      [userId, month],
    ),
    pool.query(
      `SELECT m FROM (
         SELECT DISTINCT to_char(date_trunc('month', period_start), 'YYYY-MM') AS m FROM sales_targets
         WHERE user_id = $1 AND NOT is_personal_monthly_target
         UNION
         SELECT DISTINCT to_char(r.month, 'YYYY-MM') FROM sales_reports r JOIN sales_report_lines l ON l.report_id = r.id WHERE l.user_id = $1
       ) x ORDER BY m DESC LIMIT 24`,
      [userId],
    ),
    pool.query(`SELECT kind, COUNT(*)::int AS n FROM kpi_client_lists GROUP BY kind`),
    kpiScope(me),
  ]);
  if (!user.rows.length) throw notFound('Сотрудник не найден');
  const enriched = await enrichTargets(targets.rows);
  const coverage = (await coverageFor([{ userId, month }])).get(`${userId}:${month}`) ?? null;
  const count = (kind: string) => lists.rows.find((r) => r.kind === kind)?.n ?? 0;
  res.json({
    month: month.slice(0, 7),
    user: user.rows[0],
    targets: enriched,
    totals: totalsOf(enriched),
    coverage,
    reports: reports.rows,
    months: months.rows.map((r) => r.m),
    lists: { ep: count('ep'), akbMerge: count('akb_merge') },
    canEdit,
    canUpload: !!scope,
  });
});

// ===================== ИСТОРИЯ ОТЧЁТОВ =====================

/** GET /api/kpi/reports?month= — загруженные отчёты (руководителю — по своей команде). */
router.get('/reports', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const month = req.query.month ? monthFrom(req.query.month) : null;
  const { rows } = await pool.query(
    `SELECT r.id, r.file_name, to_char(r.period_start, 'YYYY-MM-DD') AS period_start, to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
            to_char(r.month, 'YYYY-MM') AS month, r.total_revenue::float8 AS total_revenue, r.created_at,
            r.uploaded_by, COALESCE(u.display_name, u.username) AS uploaded_by_name,
            (SELECT COUNT(DISTINCT l.manager_key)::int FROM sales_report_lines l WHERE l.report_id = r.id) AS managers,
            (SELECT COUNT(DISTINCT l.manager_key)::int FROM sales_report_lines l WHERE l.report_id = r.id AND l.user_id IS NULL) AS unmatched
     FROM sales_reports r LEFT JOIN users u ON u.id = r.uploaded_by
     WHERE ($1::date IS NULL OR r.month = $1::date)
       AND (r.uploaded_by = $2 OR EXISTS (SELECT 1 FROM sales_report_lines l WHERE l.report_id = r.id AND ${scopeSql(scope, 3)}))
     ORDER BY r.period_end DESC, r.id DESC LIMIT 100`,
    scope.all ? [month, req.userId] : [month, req.userId, scopeIds(scope)],
  );
  res.json(rows);
});

router.delete('/reports/:id', async (req: AuthRequest, res: Response) => {
  if (!(await deleteSalesReport(paramId(req), req.userId!))) throw notFound('Отчёт не найден');
  res.json({ success: true });
});

// ===================== СОПОСТАВЛЕНИЕ МЕНЕДЖЕРОВ =====================

/** GET /api/kpi/reports/unmatched — менеджеры из отчётов, которых не удалось найти среди сотрудников. */
router.get('/reports/unmatched', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const { rows } = await pool.query(
    `SELECT l.manager_key, MIN(l.manager_name) AS name, SUM(l.revenue) FILTER (WHERE l.kind = 'total')::float8 AS revenue,
            to_char(MAX(r.period_end), 'YYYY-MM-DD') AS last_date
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.user_id IS NULL AND (r.uploaded_by = $1 OR $2::boolean)
       AND r.month >= (SELECT MAX(month) FROM sales_reports) - INTERVAL '12 months'
     GROUP BY l.manager_key ORDER BY revenue DESC NULLS LAST`,
    [req.userId, scope.all],
  );
  res.json(rows);
});

router.get('/reports/aliases', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.user_id, COALESCE(u.display_name, u.username) AS user_name, a.created_at
     FROM kpi_name_aliases a JOIN users u ON u.id = a.user_id ORDER BY a.name`,
  );
  res.json(rows.filter((r) => inScope(scope, r.user_id)));
});

const aliasSchema = z.object({ name: z.string().trim().min(1).max(255), userId: z.coerce.number().int().positive() });

/**
 * POST /api/kpi/reports/aliases — «этот менеджер из 1С — вот этот сотрудник».
 * Строки отчётов с этим именем переходят к сотруднику, KPI пересчитываются.
 */
router.post('/reports/aliases', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const { name, userId } = aliasSchema.parse(req.body);
  if (!inScope(scope, userId)) throw forbidden('Можно выбрать только своего подчинённого');
  const key = norm(name);
  const result = await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO kpi_name_aliases (name_key, name, user_id, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name_key) DO UPDATE SET name = EXCLUDED.name, user_id = EXCLUDED.user_id, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [key, name, userId, req.userId],
    );
    // Строки без сотрудника или у сотрудников, за которых отвечает этот руководитель.
    // Прежний владелец строк тоже пересчитывается — у него этих продаж больше нет.
    const moved = await db.query(
      `WITH old AS (
         SELECT l.id, l.user_id AS old_user, to_char(r.month, 'YYYY-MM-DD') AS month
         FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
         WHERE l.manager_key = $2 AND l.user_id IS DISTINCT FROM $1
           AND (l.user_id IS NULL OR ${scope.all ? 'TRUE' : 'l.user_id = ANY($3::int[])'})
       ), upd AS (
         UPDATE sales_report_lines l SET user_id = $1 FROM old WHERE l.id = old.id RETURNING old.old_user, old.month
       )
       SELECT DISTINCT old_user, month FROM upd`,
      scope.all ? [userId, key] : [userId, key, scopeIds(scope)],
    );
    const months = [...new Set(moved.rows.map((r) => r.month as string))];
    const targets = await recalcMany(db, [
      ...months.map((month) => ({ userId, month })),
      ...moved.rows.filter((r) => r.old_user != null).map((r) => ({ userId: r.old_user as number, month: r.month as string })),
    ]);
    return { months: months.length, targets };
  });
  res.json({ success: true, ...result });
});

router.delete('/reports/aliases/:id', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const { rows } = await pool.query('SELECT name_key, user_id FROM kpi_name_aliases WHERE id = $1', [paramId(req)]);
  if (!rows.length) throw notFound('Сопоставление не найдено');
  const alias = rows[0];
  if (!inScope(scope, alias.user_id)) throw forbidden('Это сопоставление сделано для чужого сотрудника');
  await withTransaction(async (db) => {
    await db.query('DELETE FROM kpi_name_aliases WHERE id = $1', [paramId(req)]);
    const moved = await db.query(
      `WITH upd AS (
         UPDATE sales_report_lines l SET user_id = NULL FROM sales_reports r
         WHERE r.id = l.report_id AND l.manager_key = $1 AND l.user_id = $2
         RETURNING to_char(r.month, 'YYYY-MM-DD') AS month
       ) SELECT DISTINCT month FROM upd`,
      [alias.name_key, alias.user_id],
    );
    await recalcMany(db, moved.rows.map((r) => ({ userId: alias.user_id, month: r.month })));
  });
  res.json({ success: true });
});

// ===================== СПИСКИ КЛИЕНТОВ =====================

const listKind = z.enum(['ep', 'akb_merge'], { error: 'Неизвестный список' });

async function listsResponse() {
  const { rows } = await pool.query(
    `SELECT l.id, l.kind, l.pattern, l.created_at, COALESCE(u.display_name, u.username) AS created_by_name
     FROM kpi_client_lists l LEFT JOIN users u ON u.id = l.created_by ORDER BY l.pattern`,
  );
  return { ep: rows.filter((r) => r.kind === 'ep'), akb_merge: rows.filter((r) => r.kind === 'akb_merge') };
}

/** Списки нужны всем, кто смотрит KPI (что такое «Есть повод»), менять — руководителям. */
router.get('/client-lists', async (_req: AuthRequest, res: Response) => {
  res.json(await listsResponse());
});

async function addToList(kind: 'ep' | 'akb_merge', names: string[], by: number, replace = false) {
  // Одинаковые с точностью до регистра и пробелов — одна запись (первое написание).
  const clean = new Map<string, string>();
  for (const raw of names) {
    const n = raw.replace(/\s+/g, ' ').trim();
    if (n.length >= 2 && n.length <= 255 && !clean.has(norm(n))) clean.set(norm(n), n);
  }
  return withTransaction(async (db) => {
    if (replace) await db.query('DELETE FROM kpi_client_lists WHERE kind = $1', [kind]);
    let added = 0;
    for (const [key, pattern] of clean) {
      const r = await db.query(
        `INSERT INTO kpi_client_lists (kind, pattern, pattern_key, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (kind, pattern_key) DO NOTHING`,
        [kind, pattern, key, by],
      );
      added += r.rowCount ?? 0;
    }
    const targets = await recalcMany(db, await recentPairs(db));
    return { added, targets };
  });
}

router.post('/client-lists', async (req: AuthRequest, res: Response) => {
  await requireScope(req.userId!);
  const body = z
    .object({ kind: listKind, names: z.array(z.string()).min(1, 'Добавьте хотя бы одного клиента').max(5000) })
    .parse(req.body);
  const r = await addToList(body.kind, body.names, req.userId!);
  res.json({ success: true, ...r, lists: await listsResponse() });
});

/** Названия клиентов из файла: все текстовые ячейки, кроме заголовков. */
function namesFromFile(file: Express.Multer.File): string[] {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.txt') return file.buffer.toString('utf8').split(/\r?\n/);
  const wb = XLSX.read(file.buffer, { type: 'buffer' });
  const out: string[] = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '' });
    for (const row of rows) {
      // Название клиента — первая текстовая ячейка строки (номера и суммы пропускаем).
      const text = row.map(cellText).find((c) => c && !/^[\d\s.,№%-]+$/.test(c));
      if (text && !/^(клиент|контрагент|наименование|название|точка|тт|адрес|список)/i.test(text)) out.push(text);
    }
  }
  return out;
}

router.post('/client-lists/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  await requireScope(req.userId!);
  if (!req.file) throw badRequest('Файл не загружен');
  const kind = listKind.parse(req.body.kind);
  let names: string[];
  try {
    names = namesFromFile(req.file);
  } catch {
    throw badRequest('Не удалось прочитать файл');
  }
  if (!names.length) throw badRequest('В файле не найдено ни одного названия клиента');
  const r = await addToList(kind, names, req.userId!, req.body.replace === '1' || req.body.replace === 'true');
  res.json({ success: true, found: names.length, ...r, lists: await listsResponse() });
});

router.delete('/client-lists/:id', async (req: AuthRequest, res: Response) => {
  await requireScope(req.userId!);
  const r = await pool.query('DELETE FROM kpi_client_lists WHERE id = $1 RETURNING id', [paramId(req)]);
  if (!r.rowCount) throw notFound('Запись не найдена');
  await withTransaction(async (db) => recalcMany(db, await recentPairs(db)));
  res.json({ success: true, lists: await listsResponse() });
});

/**
 * GET /api/kpi/report-clients?month=&q= — клиенты из отчётов за месяц: выручка,
 * менеджеры, в каком списке клиент; «похож на Есть повод» — покупал товары
 * с пометкой «ЕстьПовод».
 */
router.get('/report-clients', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const month = monthFrom(req.query.month);
  const q = String(req.query.q ?? '').trim();
  const { rows } = await pool.query(
    `SELECT l.client_name AS name,
            SUM(l.revenue) FILTER (WHERE l.kind = 'total')::float8 AS revenue,
            ARRAY_AGG(DISTINCT l.manager_name) AS managers,
            BOOL_OR(l.kind <> 'total' AND l.name ~* 'есть\\s*по[вд]од') AS ep_hint
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE r.month = $1::date AND ($2 = '' OR l.client_name ILIKE '%' || $2 || '%') AND ${scopeSql(scope, 3)}
     GROUP BY l.client_name ORDER BY revenue DESC NULLS LAST LIMIT 1000`,
    scope.all ? [month, q] : [month, q, scopeIds(scope)],
  );
  const lists = await listsResponse();
  res.json(
    rows.map((r) => ({
      ...r,
      ep: lists.ep.find((p) => matchesClient(r.name, p.pattern))?.pattern ?? null,
      merge: lists.akb_merge.find((p) => matchesClient(r.name, p.pattern))?.pattern ?? null,
    })),
  );
});

/** GET /api/kpi/report-groups?month= — группы товаров из отчётов (для выбора, что считать в показателе). */
router.get('/report-groups', async (req: AuthRequest, res: Response) => {
  const scope = await requireScope(req.userId!);
  const month = monthFrom(req.query.month);
  const { rows } = await pool.query(
    `SELECT l.group_path, l.name, MIN(l.depth)::int AS depth, SUM(l.revenue)::float8 AS revenue
     FROM sales_report_lines l JOIN sales_reports r ON r.id = l.report_id
     WHERE l.kind = 'group' AND r.month = $1::date AND ${scopeSql(scope, 2)}
     GROUP BY l.group_path, l.name
     ORDER BY CASE WHEN l.group_path = '' THEN l.name ELSE l.group_path || ' › ' || l.name END LIMIT 2000`,
    scope.all ? [month] : [month, scopeIds(scope)],
  );
  res.json(rows.map((r) => ({ path: r.group_path ? `${r.group_path}${PATH_SEP}${r.name}` : r.name, name: r.name, depth: r.depth, revenue: r.revenue })));
});

export default router;
