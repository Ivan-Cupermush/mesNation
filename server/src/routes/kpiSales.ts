import { Router, Request, Response } from 'express';
import multer from 'multer';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { isSubordinate } from '../services/access';
import { paramId } from '../lib/validate';
import { logger } from '../lib/logger';
import { UPLOAD_DIRS, fixOriginalName } from '../lib/uploads';
import { CURRENT_DEADLINE_SQL, OVERDUE_SQL } from '../services/taskDeadlines';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { withTransaction } from '../db/pool';
import { importSalesReport, saveKpiFile } from '../services/kpi/imports';
import { parseKpiSheets } from '../services/kpi/kpiFile';
import { factRuleSchema, payoutRuleSchema } from '../services/kpi/rules';
import { enrichTargets, kpiScope, loadLists, matchPeople, monthOfTarget, recalcUserMonth } from '../services/kpi/store';

const router = Router();

// Файлы импорта лежат в общем корне загрузок (UPLOADS_DIR) и наружу не отдаются.
const importsDir = UPLOAD_DIRS.imports;

const SHEET_EXT = ['.xlsx', '.xls', '.xlsm', '.csv', '.ods'];
const SHEET_MIME = /spreadsheet|excel|^text\/csv$/i;
// Только таблицы: остальное парсер всё равно не прочитает, а место на диске займёт.
const upload = multer({
  dest: importsDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    file.originalname = fixOriginalName(file.originalname);
    // Имя без расширения (бывает у файлов из облачных хранилищ на телефоне) — смотрим тип.
    if (SHEET_EXT.includes(path.extname(file.originalname).toLowerCase()) || SHEET_MIME.test(file.mimetype)) cb(null, true);
    else cb(badRequest('Поддерживаются таблицы Excel (.xlsx, .xls) и .csv'));
  },
});


// ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====================

/**
 * Проверяет, что userId является руководителем targetUserId через role_tree.
 * Возвращает true, если targetUserId в поддереве userId.
 */
async function isManagerOf(managerId: number, targetUserId: number): Promise<boolean> {
  return isSubordinate(managerId, targetUserId);
}


/**
 * Число из ячейки Excel: «1 234,50 ₽», «1234.5», «1,234.50» → число.
 * Одна запятая без точки — десятичный разделитель (русская запись);
 * раньше «1 234,50» читалось как 123450.
 */
function parseRuNumber(val: any): number {
  if (typeof val === 'number') return val;
  let str = String(val ?? '').replace(/[\s\u00a0]/g, '');
  if (!str) return 0;
  if (str.includes(',') && !str.includes('.')) str = str.replace(',', '.');
  else str = str.replace(/,/g, '');
  const num = parseFloat(str.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * Начало периода для отчётов. Одинаково для своей сводки, команды и карточки
 * сотрудника: неделя — последние 7 дней, месяц и квартал — календарные.
 * Раньше карточка сотрудника считала «скользящий» месяц, и суммы в списке
 * команды и в карточке расходились.
 */
function periodSince(period: unknown): string {
  if (period === 'week') return `CURRENT_DATE - INTERVAL '7 days'`;
  if (period === 'quarter') return `DATE_TRUNC('quarter', CURRENT_DATE)`;
  return `DATE_TRUNC('month', CURRENT_DATE)`;
}

/**
 * Период цели из запроса: обе даты необязательны (по умолчанию — 30 дней
 * с сегодня), но если переданы — должны быть настоящими датами, и начало
 * не позже конца. Раньше мусор в дате ронял запрос с 500.
 */
function targetPeriod(body: any): { start: Date; end: Date } | { error: string } {
  const parse = (v: unknown) => (v === undefined || v === null || v === '' ? null : new Date(String(v)));
  const start = parse(body?.period_start) ?? new Date();
  const end = parse(body?.period_end) ?? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: 'Некорректная дата периода' };
  if (start.getTime() > end.getTime()) return { error: 'Начало периода позже его окончания' };
  return { start, end };
}

/** Удаляет временный файл загрузки, если он остался (ошибка разбора и т. п.). */
function dropUpload(file?: Express.Multer.File) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => undefined);
}

/** Число из запроса: undefined/'' → fallback, мусор → NaN (проверяется вызывающим). */
function num(v: any, fallback?: number): number {
  if (v === undefined || v === null || v === '') return fallback as number;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Права на цель. Владелец и его руководители могут вести прогресс. Но план,
 * который назначил руководитель (created_by ≠ владелец), сотрудник сам
 * не может ни уменьшить, ни удалить — только тот, кто назначил, или
 * вышестоящий.
 */
async function targetAccess(userId: number, targetId: number) {
  const r = await pool.query('SELECT user_id, created_by FROM sales_targets WHERE id = $1', [targetId]);
  if (!r.rows.length) return null;
  const { user_id: ownerId, created_by: createdBy } = r.rows[0];
  const isOwner = ownerId === userId;
  const isManager = !isOwner && (await isManagerOf(userId, ownerId));
  const assignedByOther = createdBy != null && createdBy !== ownerId;
  return {
    canView: isOwner || isManager,
    canEditPlan: isManager || createdBy === userId || (isOwner && !assignedByOther),
  };
}

// ===================== ЦЕЛИ ПРОДАЖ =====================

// GET /api/kpi/sales/targets — мои цели (товарные KPI)
router.get('/targets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await pool.query(
      `SELECT st.*, 
              ROUND((st.current_value / NULLIF(st.target_value, 0) * 100)::numeric, 1) as progress_percent
       FROM sales_targets st
       WHERE st.user_id = $1 
         AND st.is_personal_monthly_target = FALSE
       ORDER BY st.created_at DESC`,
      [userId]
    );
    
    res.json(await enrichTargets(result.rows));
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка получения целей');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/kpi/sales/targets/my-monthly — мой активный план на месяц
router.get('/targets/my-monthly', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await pool.query(
      `SELECT *, 
              ROUND((current_value / NULLIF(target_value, 0) * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1 
         AND is_personal_monthly_target = TRUE
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    res.json(result.rows[0] || null);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка получения плана');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/kpi/sales/targets/subordinates — цели моих подчинённых (для руководителя)
router.get('/targets/subordinates', async (req: Request, res: Response) => {
  try {
    const managerId = (req as any).userId;
    
    // Получить поддерево ролей руководителя
    const managerRoleResult = await pool.query(
      'SELECT role_node_id AS role_id FROM user_role_assignments WHERE user_id = $1',
      [managerId]
    );
    const managerRoleId = managerRoleResult.rows[0]?.role_id;
    if (!managerRoleId) {
      return res.json([]);
    }
    
    const subtreeResult = await pool.query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM role_tree WHERE id = $1
         UNION
         SELECT rt.id FROM role_tree rt
         INNER JOIN subtree s ON rt.parent_id = s.id
       )
       SELECT id FROM subtree WHERE id != $1`,
      [managerRoleId]
    );
    const subordinateRoleIds = subtreeResult.rows.map((r: any) => r.id);
    
    if (subordinateRoleIds.length === 0) {
      return res.json([]);
    }
    
    // Получить пользователей с этими ролями и их активные цели
    const result = await pool.query(
      `SELECT u.id as user_id, u.username, u.display_name,
              st.id as target_id, st.product_name, st.metric_type,
              st.target_value, st.current_value,
              ROUND((st.current_value / NULLIF(st.target_value, 0) * 100)::numeric, 1) as progress_percent,
              st.is_personal_monthly_target, st.period_start, st.period_end
       FROM users u
       LEFT JOIN sales_targets st ON st.user_id = u.id 
         AND st.period_start <= CURRENT_DATE 
         AND st.period_end >= CURRENT_DATE
       WHERE u.is_active AND u.id IN (SELECT user_id FROM user_role_assignments WHERE role_node_id = ANY($1))
       ORDER BY u.display_name, st.created_at DESC`,
      [subordinateRoleIds]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка получения целей подчинённых');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/targets — создать СЕБЕ товарный KPI (любой юзер)
router.post('/targets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      product_name,
      metric_type = 'quantity',
      target_value,
      current_value = 0,
      period_start,
      period_end,
      description,
    } = req.body;
    
    const target = num(target_value);
    const current = num(current_value, 0);
    if (!(target > 0)) {
      return res.status(400).json({ error: 'Целевое значение должно быть числом больше 0' });
    }
    if (!(current >= 0)) {
      return res.status(400).json({ error: 'Текущее значение не может быть отрицательным' });
    }
    if (!product_name || !String(product_name).trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    if (!['quantity', 'amount', 'contracts'].includes(metric_type)) {
      return res.status(400).json({ error: 'Неизвестный тип показателя' });
    }
    const span = targetPeriod({ period_start, period_end });
    if ('error' in span) return res.status(400).json({ error: span.error });
    
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, product_name, metric_type, target_value, current_value, 
          period_start, period_end, description, is_personal_monthly_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING *`,
      [
        userId, 
        String(product_name).trim().slice(0, 255), 
        metric_type, 
        target,
        current,
        span.start,
        span.end,
        description
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка создания цели');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/targets/personal-monthly — назначить личный план подчинённому
// С проверкой иерархии через role_tree
router.post(
  '/targets/personal-monthly',
  async (req: Request, res: Response) => {
    try {
      const managerId = (req as any).userId;
      const {
        user_id,
        target_value,
        period_start,
        period_end,
        description,
      } = req.body;
      
      if (!user_id) {
        return res.status(400).json({ error: 'Не указан пользователь' });
      }
      if (!(await isManagerOf(managerId, Number(user_id)))) {
        return res.status(403).json({ error: 'Назначать план можно только своим подчинённым' });
      }
      
      if (!(num(target_value) > 0)) {
        return res.status(400).json({ error: 'Целевое значение должно быть числом больше 0' });
      }
      const span = targetPeriod({ period_start, period_end });
      if ('error' in span) return res.status(400).json({ error: span.error });
      
      // Деактивировать старые планы этого пользователя
      await pool.query(
        `UPDATE sales_targets 
         SET period_end = CURRENT_DATE - INTERVAL '1 day'
         WHERE user_id = $1 
           AND is_personal_monthly_target = TRUE
           AND period_end >= CURRENT_DATE`,
        [user_id]
      );
      
      // Создать новый план
      const result = await pool.query(
        `INSERT INTO sales_targets 
           (user_id, metric_type, target_value, current_value, 
            period_start, period_end, description, 
            is_personal_monthly_target, created_by)
         VALUES ($1, 'amount', $2, 0, $3, $4, $5, TRUE, $6)
         RETURNING *`,
        [
          user_id,
          num(target_value),
          span.start,
          span.end,
          description,
          managerId
        ]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'KPI: Ошибка назначения плана');
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

// PATCH /api/kpi/sales/targets/:id — обновить цель
// Доступно: владельцу ИЛИ его руководителю (через role_tree)
router.patch('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = paramId(req);
    const { current_value, target_value, description } = req.body;
    // Правила расчёта факта и выплаты, бонус — меняет тот, кто может менять план.
    const factRule = req.body.fact_rule !== undefined ? factRuleSchema.safeParse(req.body.fact_rule) : null;
    const payoutRule = req.body.payout_rule !== undefined ? payoutRuleSchema.safeParse(req.body.payout_rule) : null;
    const bonus = req.body.bonus_amount !== undefined ? num(req.body.bonus_amount) : undefined;
    if ((factRule && !factRule.success) || (payoutRule && !payoutRule.success)) {
      return res.status(400).json({ error: 'Некорректное правило расчёта' });
    }
    if (bonus !== undefined && !(bonus >= 0)) {
      return res.status(400).json({ error: 'Бонус должен быть числом не меньше 0' });
    }
    
    const access = await targetAccess(userId, targetId);
    if (!access) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    if (!access.canView) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if ((target_value !== undefined || factRule || payoutRule || bonus !== undefined) && !access.canEditPlan) {
      return res.status(403).json({ error: 'План назначил руководитель — изменить его может только он' });
    }
    if (current_value !== undefined && !(num(current_value) >= 0)) {
      return res.status(400).json({ error: 'Текущее значение должно быть числом не меньше 0' });
    }
    if (target_value !== undefined && !(num(target_value) > 0)) {
      return res.status(400).json({ error: 'Целевое значение должно быть числом больше 0' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (current_value !== undefined) {
      updates.push(`current_value = $${paramIndex++}`);
      values.push(num(current_value));
    }
    if (target_value !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      values.push(num(target_value));
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (factRule?.success) {
      updates.push(`fact_rule = $${paramIndex++}`);
      values.push(JSON.stringify(factRule.data));
    }
    if (payoutRule?.success) {
      updates.push(`payout_rule = $${paramIndex++}`);
      values.push(JSON.stringify(payoutRule.data));
    }
    if (factRule || payoutRule) updates.push('rules_custom = TRUE');
    if (bonus !== undefined) {
      updates.push(`bonus_amount = $${paramIndex++}`);
      values.push(bonus);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(targetId);
    
    const result = await pool.query(
      `UPDATE sales_targets 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );
    let row = result.rows[0];
    // Новое правило факта — сразу пересчитать по отчётам месяца.
    if (factRule?.success) {
      const month = monthOfTarget(row.period_start);
      await withTransaction(async (db) => recalcUserMonth(db, row.user_id, month, await loadLists(db)));
      row = (await pool.query('SELECT * FROM sales_targets WHERE id = $1', [targetId])).rows[0];
    }
    
    res.json((await enrichTargets([row]))[0]);
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Некорректный идентификатор' });
    logger.error({ err: error }, 'KPI: Ошибка обновления цели');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/kpi/sales/targets/:id
router.delete('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = paramId(req);
    
    const access = await targetAccess(userId, targetId);
    if (!access) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    if (!access.canView) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (!access.canEditPlan) {
      return res.status(403).json({ error: 'План назначил руководитель — удалить его может только он' });
    }
    
    const result = await pool.query(
      'DELETE FROM sales_targets WHERE id = $1 RETURNING id',
      [targetId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Некорректный идентификатор' });
    logger.error({ err: error }, 'KPI: Ошибка удаления');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== ТРАНЗАКЦИИ =====================

// GET /api/kpi/sales/transactions — история продаж
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { target_id, period } = req.query;
    
    let query = 'SELECT * FROM sales_transactions WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (target_id !== undefined) {
      const tid = Number(target_id);
      if (!Number.isInteger(tid) || tid <= 0) return res.status(400).json({ error: 'Некорректная цель' });
      query += ` AND target_id = $${paramIndex++}`;
      params.push(tid);
    }
    
    if (period === 'week' || period === 'month' || period === 'quarter') {
      query += ` AND transaction_date >= ${periodSince(period)}`;
    }
    
    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка получения транзакций');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/transactions — добавить продажу вручную
router.post('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      product_name,
      quantity = 1,
      amount = 0,
      transaction_date,
      client_name,
      notes,
      target_id,
    } = req.body;
    
    const qty = num(quantity, 1);
    const sum = num(amount, 0);
    if (!product_name || !String(product_name).trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    if (!(qty > 0)) {
      return res.status(400).json({ error: 'Количество должно быть числом больше 0' });
    }
    if (!(sum >= 0)) {
      return res.status(400).json({ error: 'Сумма не может быть отрицательной' });
    }
    if (transaction_date && Number.isNaN(new Date(transaction_date).getTime())) {
      return res.status(400).json({ error: 'Некорректная дата продажи' });
    }
    if (target_id && !(Number.isInteger(Number(target_id)) && Number(target_id) > 0)) {
      return res.status(400).json({ error: 'Некорректная цель' });
    }
    if (target_id) {
      const own = await pool.query('SELECT 1 FROM sales_targets WHERE id = $1 AND user_id = $2', [target_id, userId]);
      if (!own.rows.length) return res.status(403).json({ error: 'Эта цель вам не принадлежит' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const txResult = await client.query(
        `INSERT INTO sales_transactions 
           (user_id, target_id, product_name, quantity, amount, transaction_date, client_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [userId, target_id || null, String(product_name).trim().slice(0, 255), qty, sum, 
         transaction_date || new Date(), client_name ? String(client_name).trim().slice(0, 255) || null : null, notes || null]
      );
      
      if (target_id) {
        const targetCheck = await client.query(
          'SELECT metric_type FROM sales_targets WHERE id = $1',
          [target_id]
        );
        
        if (targetCheck.rows.length > 0) {
          const increment = targetCheck.rows[0].metric_type === 'amount' ? sum : qty;
          await client.query(
            `UPDATE sales_targets 
             SET current_value = current_value + $1, updated_at = NOW()
             WHERE id = $2`,
            [increment, target_id]
          );
        }
      }
      
      await client.query('COMMIT');
      res.status(201).json(txResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка добавления транзакции');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== ИМПОРТ EXCEL =====================

// POST /api/kpi/sales/import/preview
router.post('/import/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Нет файла' });
    }
    
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    if (data.length === 0) {
      dropUpload(file);
      return res.status(400).json({ error: 'Файл пустой или не содержит данных' });
    }
    
    const headers = Object.keys(data[0] as any);
    const suggestedMapping: Record<string, string | null> = {
      product_name: headers.find(h => /товар|product|название|наименование|item/i.test(h)) || headers[0] || null,
      quantity: headers.find(h => /кол|quantity|шт|count|количество/i.test(h)) || null,
      amount: headers.find(h => /сумма|amount|цена|price|руб|стоимость/i.test(h)) || null,
      transaction_date: headers.find(h => /дата|date/i.test(h)) || null,
      client_name: headers.find(h => /клиент|client|покупатель|customer/i.test(h)) || null,
      notes: headers.find(h => /коммент|note|примечание|comment|описание/i.test(h)) || null,
    };
    
    const importResult = await pool.query(
      `INSERT INTO sales_imports (user_id, file_name, file_size, total_rows, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [userId, file.originalname, file.size, data.length]
    );
    
    const importId = importResult.rows[0].id;
    
    const validation = {
      valid: 0,
      invalid: 0,
      errors: [] as string[],
    };
    
    const sampleSize = Math.min(data.length, 10);
    for (let i = 0; i < sampleSize; i++) {
      const row = data[i] as any;
      if (suggestedMapping.product_name && row[suggestedMapping.product_name]) {
        validation.valid++;
      } else {
        validation.invalid++;
        validation.errors.push(`Строка ${i + 2}: нет названия товара`);
      }
    }
    
    const permanentPath = path.join(importsDir, `${importId}.xlsx`);
    fs.renameSync(file.path, permanentPath);
    
    // Та же разборка чисел, что и при сохранении: «1 234,50» — это 1234.5, а не 123450.
    let totalAmount = 0;
    if (suggestedMapping.amount) {
      for (const row of data) totalAmount += parseRuNumber((row as any)[suggestedMapping.amount!]);
    }
    
    res.json({
      importId,
      fileName: file.originalname,
      totalRows: data.length,
      preview: data.slice(0, 5),
      headers,
      suggestedMapping,
      validation,
      totalAmount,
    });
  } catch (error) {
    dropUpload(req.file);
    logger.error({ err: error }, 'KPI: Ошибка парсинга');
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// POST /api/kpi/sales/import/confirm
router.post('/import/confirm', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { importId, mapping } = req.body;
    if (!Number.isInteger(Number(importId)) || Number(importId) <= 0) {
      return res.status(400).json({ error: 'Некорректный импорт' });
    }
    if (!mapping || typeof mapping !== 'object' || !mapping.product_name) {
      return res.status(400).json({ error: 'Укажите колонку с названием товара' });
    }
    const MAPPING_KEYS = ['product_name', 'quantity', 'amount', 'transaction_date', 'client_name', 'notes'];
    if (Object.entries(mapping).some(([k, v]) => !MAPPING_KEYS.includes(k) || (v !== null && typeof v !== 'string'))) {
      return res.status(400).json({ error: 'Некорректное сопоставление колонок' });
    }
    
    const importCheck = await pool.query(
      'SELECT * FROM sales_imports WHERE id = $1 AND user_id = $2',
      [importId, userId]
    );
    
    if (importCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Импорт не найден' });
    }
    // Повторное подтверждение (двойное нажатие, повтор запроса) задвоило бы продажи.
    if (importCheck.rows[0].status === 'completed') {
      return res.status(409).json({ error: 'Этот файл уже импортирован' });
    }
    
    const filePath = path.join(importsDir, `${importId}.xlsx`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    const parseDate = (val: any): Date => {
      if (!val) return new Date();
      if (val instanceof Date) return val;
      if (typeof val === 'number') {
        return new Date((val - 25569) * 86400 * 1000);
      }
      const str = String(val);
      const dmy = str.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
      if (dmy) {
        let year = parseInt(dmy[3]);
        if (year < 100) year += 2000;
        return new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
      }
      const ymd = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) {
        return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
      }
      return new Date(str);
    };
    
    const parseNumber = parseRuNumber;
    
    const transactions: any[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      
      const productName = mapping.product_name 
        ? String(row[mapping.product_name] || '').trim() 
        : '';
      
      if (!productName) {
        errors.push(`Строка ${i + 2}: нет названия товара`);
        continue;
      }
      
      const date = mapping.transaction_date ? parseDate(row[mapping.transaction_date]) : new Date();
      if (Number.isNaN(date.getTime())) {
        errors.push(`Строка ${i + 2}: не удалось прочитать дату`);
        continue;
      }
      
      transactions.push({
        product_name: productName.slice(0, 255),
        quantity: mapping.quantity ? parseNumber(row[mapping.quantity]) || 1 : 1,
        amount: mapping.amount ? parseNumber(row[mapping.amount]) : 0,
        transaction_date: date,
        client_name: mapping.client_name ? String(row[mapping.client_name] || '').trim().slice(0, 255) || null : null,
        notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
      });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const t of transactions) {
        await client.query(
          `INSERT INTO sales_transactions 
             (user_id, import_id, product_name, quantity, amount, transaction_date, client_name, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, importId, t.product_name, t.quantity, t.amount, 
           t.transaction_date, t.client_name, t.notes]
        );
      }
      
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      await client.query(
        `UPDATE sales_imports 
         SET imported_rows = $1, skipped_rows = $2, total_amount = $3, 
             status = 'completed', completed_at = NOW(), error_log = $4
         WHERE id = $5`,
        [transactions.length, errors.length, totalAmount, JSON.stringify(errors), importId]
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        imported: transactions.length,
        skipped: errors.length,
        totalAmount,
        errors: errors.slice(0, 10),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка импорта');
    res.status(500).json({ error: 'Ошибка импорта' });
  }
});

// GET /api/kpi/sales/import/history
router.get('/import/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await pool.query(
      `SELECT * FROM sales_imports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== СВОДКА =====================

// GET /api/kpi/sales/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { period = 'month' } = req.query;
    
    const dateFilter = period === 'week' || period === 'month' || period === 'quarter' ? `AND transaction_date >= ${periodSince(period)}` : '';
    
    const factResult = await pool.query(
      `SELECT 
         COALESCE(SUM(amount), 0) as total_amount,
         COALESCE(SUM(quantity), 0) as total_quantity,
         COUNT(*) as total_transactions
       FROM sales_transactions
       WHERE user_id = $1 ${dateFilter}`,
      [userId]
    );
    
    const targetsResult = await pool.query(
      `SELECT *, 
              ROUND((current_value / NULLIF(target_value, 0) * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1 
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
         AND is_personal_monthly_target = FALSE
       ORDER BY created_at DESC`,
      [userId]
    );
    
    const personalTargetResult = await pool.query(
      `SELECT *,
              ROUND((current_value / NULLIF(target_value, 0) * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1
         AND is_personal_monthly_target = TRUE
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    const topProductsResult = await pool.query(
      `SELECT 
         product_name,
         SUM(quantity) as total_quantity,
         SUM(amount) as total_amount,
         COUNT(*) as transactions_count
       FROM sales_transactions
       WHERE user_id = $1 ${dateFilter}
       GROUP BY product_name
       ORDER BY total_amount DESC
       LIMIT 10`,
      [userId]
    );
    
    res.json({
      fact: factResult.rows[0],
      // calc — выплата сейчас, прогноз и пороги (services/kpi/store.ts).
      targets: await enrichTargets(targetsResult.rows),
      personalTarget: personalTargetResult.rows[0] || null,
      topProducts: topProductsResult.rows,
      period,
    });
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;

// ===================== ДЛЯ РУКОВОДИТЕЛЕЙ =====================

// GET /api/kpi/sales/subordinates — список подчинённых с их KPI
router.get('/subordinates', async (req: Request, res: Response) => {
  try {
    // Выручка команды за выбранный на экране период (по умолчанию — месяц).
    const since = periodSince(req.query.period);
    const managerId = (req as any).userId;
    
    // Получить роль руководителя
    const managerRoleResult = await pool.query(
      'SELECT role_node_id AS role_id FROM user_role_assignments WHERE user_id = $1',
      [managerId]
    );
    const managerRoleId = managerRoleResult.rows[0]?.role_id;
    if (!managerRoleId) {
      return res.json([]);
    }
    
    // Получить поддерево ролей
    const subtreeResult = await pool.query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM role_tree WHERE id = $1
         UNION
         SELECT rt.id FROM role_tree rt
         INNER JOIN subtree s ON rt.parent_id = s.id
       )
       SELECT id FROM subtree WHERE id != $1`,
      [managerRoleId]
    );
    const subordinateRoleIds = subtreeResult.rows.map((r: any) => r.id);
    
    if (subordinateRoleIds.length === 0) {
      return res.json([]);
    }
    
    // Получить подчинённых и их активные KPI
    const result = await pool.query(
      `SELECT 
         u.id as user_id, 
         u.username, 
         u.display_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id', st.id,
               'product_name', st.product_name,
               'metric_type', st.metric_type,
               'target_value', st.target_value,
               'current_value', st.current_value,
               'progress_percent', ROUND((st.current_value / NULLIF(st.target_value, 0) * 100)::numeric, 1),
               'period_start', st.period_start,
               'period_end', st.period_end
             )
           ) FILTER (WHERE st.id IS NOT NULL),
           '[]'
         ) as kpis,
         (SELECT rt.name FROM user_role_assignments ura JOIN role_tree rt ON rt.id = ura.role_node_id
           WHERE ura.user_id = u.id LIMIT 1) AS role_name,
         (SELECT COALESCE(SUM(tx.amount), 0) FROM sales_transactions tx
           WHERE tx.user_id = u.id AND tx.transaction_date >= ${since}) AS total_amount
       FROM users u
       LEFT JOIN sales_targets st ON st.user_id = u.id 
         AND st.period_start <= CURRENT_DATE 
         AND st.period_end >= CURRENT_DATE
       WHERE u.is_active AND u.id IN (SELECT user_id FROM user_role_assignments WHERE role_node_id = ANY($1))
       GROUP BY u.id, u.username, u.display_name
       ORDER BY u.display_name`,
      [subordinateRoleIds]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка получения подчинённых');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/targets/assign — назначить KPI подчинённому
router.post('/targets/assign', async (req: Request, res: Response) => {
  try {
    const managerId = (req as any).userId;
    const {
      user_id,
      product_name,
      metric_type = 'quantity',
      target_value,
      current_value = 0,
      period_start,
      period_end,
      description,
    } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'Не указан пользователь' });
    }
    if (!(num(target_value) > 0)) {
      return res.status(400).json({ error: 'Целевое значение должно быть числом больше 0' });
    }
    if (!(num(current_value, 0) >= 0)) {
      return res.status(400).json({ error: 'Текущее значение не может быть отрицательным' });
    }
    if (!product_name || !String(product_name).trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    if (!['quantity', 'amount', 'contracts'].includes(metric_type)) {
      return res.status(400).json({ error: 'Неизвестный тип показателя' });
    }
    
    const span = targetPeriod({ period_start, period_end });
    if ('error' in span) return res.status(400).json({ error: span.error });

    // Проверить что user_id — подчинённый менеджера
    const isManager = await isManagerOf(managerId, Number(user_id));
    if (!isManager) {
      return res.status(403).json({ error: 'Вы не являетесь руководителем этого пользователя' });
    }
    
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, product_name, metric_type, target_value, current_value, 
          period_start, period_end, description, is_personal_monthly_target, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       RETURNING *`,
      [
        user_id,
        String(product_name).trim().slice(0, 255),
        metric_type,
        num(target_value),
        num(current_value, 0),
        span.start,
        span.end,
        description,
        managerId
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'KPI: Ошибка назначения KPI');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// ===================== ОБНОВЛЕНИЕ KPI ИЗ ОТЧЁТА ПРОДАЖ =====================

/**
 * POST /api/kpi/sales/import-report — ежедневный отчёт о продажах из 1С.
 * Отчёт сохраняется, факт всех KPI команды за месяц пересчитывается
 * (services/kpi/imports.ts). В ответе — итог по каждому менеджеру.
 */
router.post('/import-report', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Нет файла');
  try {
    const buffer = await fs.promises.readFile(file.path);
    res.json(await importSalesReport(buffer, file.originalname, req.userId!));
  } finally {
    dropUpload(file);
  }
});

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * POST /api/kpi/sales/import-kpi-plan — файл, где каждый лист — KPI одного
 * сотрудника (тот же вид, что и файл KPI сотрудника). Сотрудник — по имени
 * на листе, месяц — из файла.
 */
router.post('/import-kpi-plan', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Нет файла');
  try {
    const scope = await kpiScope(req.userId!);
    if (!scope) throw forbidden('Загружать KPI можно только своим подчинённым');
    const sheets = parseKpiSheets(await fs.promises.readFile(file.path));
    if (!sheets.length) throw badRequest('В файле не найдено ни одного листа с показателями KPI');
    const results: any[] = [];
    for (const sheet of sheets) {
      const employee = sheet.employeeName;
      const mine = (await matchPeople([employee], scope.all ? undefined : scope.ids)).values().next().value;
      if (!mine?.userId) {
        const anyone = scope.all ? null : (await matchPeople([employee])).values().next().value;
        results.push({ employee, sheet: sheet.sheet, error: anyone?.userId ? 'нет прав: не ваш подчинённый' : 'сотрудник не найден однозначно' });
        continue;
      }
      const month = sheet.month ?? currentMonth();
      const saved = await withTransaction((db) => saveKpiFile(db, { userId: mine.userId!, month, file: sheet, byUserId: req.userId! }));
      results.push({ employee, sheet: sheet.sheet, user: mine.userName, month: month.slice(0, 7), created: saved.targets.length, updated: saved.replaced, kpis: sheet.metrics.length });
    }
    res.json({ success: true, results });
  } finally {
    dropUpload(file);
  }
});


// ===================== СТАТИСТИКА СОТРУДНИКА =====================

/**
 * GET /api/kpi/sales/employee/:userId/stats — карточка сотрудника для руководителя.
 * Доступна самому сотруднику, его руководителям и директору.
 */
router.get('/employee/:userId/stats', async (req: AuthRequest, res: Response) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Некорректный ID сотрудника');
  const me = req.userId!;
  if (me !== userId && !(await isSubordinate(me, userId))) throw forbidden('Статистика доступна только по своим подчинённым');
  const since = periodSince(req.query.period);

  const [userResult, kpisResult, tasksResult, taskStatsResult, summaryResult, txResult] = await Promise.all([
    pool.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.is_active, rt.name AS role_name, rt.id AS role_id
       FROM users u LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
       LEFT JOIN role_tree rt ON rt.id = ura.role_node_id WHERE u.id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT st.*, ROUND((st.current_value / NULLIF(st.target_value, 0) * 100)::numeric, 1) AS progress_percent
       FROM sales_targets st WHERE st.user_id = $1 AND st.period_start <= CURRENT_DATE AND st.period_end >= CURRENT_DATE
       ORDER BY st.created_at DESC`,
      [userId],
    ),
    pool.query(
      `SELECT t.id, t.title, t.status_new AS status, t.importance AS priority,
              COALESCE(${CURRENT_DEADLINE_SQL}, t.executor_deadline, t.hard_deadline) AS deadline,
              ${OVERDUE_SQL} AS is_overdue
       FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
       WHERE ta.user_id = $1 AND t.status_new <> 'archived'
       ORDER BY (t.status_new = 'done') ASC, 5 ASC NULLS LAST LIMIT 50`,
      [userId],
    ),
    // Счётчики — по всем задачам, а не по первым 50 из списка.
    // «В работе» — всё незавершённое и не просроченное (как в своей статистике).
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.status_new = 'done')::int AS completed,
              COUNT(*) FILTER (WHERE t.status_new <> 'done' AND COALESCE(${OVERDUE_SQL}, FALSE))::int AS overdue,
              COUNT(*) FILTER (WHERE t.status_new <> 'done' AND NOT COALESCE(${OVERDUE_SQL}, FALSE))::int AS in_progress
       FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
       WHERE ta.user_id = $1 AND t.status_new <> 'archived'`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount, COALESCE(SUM(quantity), 0) AS total_quantity,
              COUNT(*)::int AS total_transactions
       FROM sales_transactions WHERE user_id = $1 AND transaction_date >= ${since}`,
      [userId],
    ),
    pool.query(
      `SELECT id, product_name, quantity, amount, transaction_date, client_name, notes
       FROM sales_transactions WHERE user_id = $1 AND transaction_date >= ${since}
       ORDER BY transaction_date DESC, id DESC LIMIT 200`,
      [userId],
    ),
  ]);
  if (!userResult.rows.length) throw notFound('Сотрудник не найден');

  const kpis = (await enrichTargets(kpisResult.rows)).map((k) => ({
    ...k,
    progress: Math.min(100, Math.round((Number(k.current_value) / Math.max(Number(k.target_value) || 1, 1)) * 100)),
  }));
  const tasks = tasksResult.rows;
  res.json({
    user: userResult.rows[0],
    kpi: kpis[0] || null,
    kpis,
    tasks,
    taskStats: taskStatsResult.rows[0],
    summary: summaryResult.rows[0],
    transactions: txResult.rows,
  });
});
