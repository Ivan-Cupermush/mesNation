import { Router, Request, Response } from 'express';
import multer from 'multer';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { isSubordinate, isDirector } from '../services/access';
import { paramId } from '../lib/validate';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = Router();

const importsDir = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(importsDir)) {
  fs.mkdirSync(importsDir, { recursive: true });
}

const upload = multer({ dest: importsDir, limits: { fileSize: 20 * 1024 * 1024 } });


// ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====================

/**
 * Проверяет, что userId является руководителем targetUserId через role_tree.
 * Возвращает true, если targetUserId в поддереве userId.
 */
async function isManagerOf(managerId: number, targetUserId: number): Promise<boolean> {
  return isSubordinate(managerId, targetUserId);
}


/**
 * Ищет сотрудника по имени из отчёта: сначала точное совпадение имени или
 * логина (без учёта регистра), затем — частичное, но только если оно
 * единственное. Раньше бралось первое ILIKE-совпадение, и «Иван» мог
 * обновить KPI «Иванова».
 */
async function findUserByName(name: string): Promise<{ id: number; display_name: string; username: string } | null> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const exact = await pool.query(
    `SELECT id, display_name, username FROM users
     WHERE is_active AND (LOWER(TRIM(display_name)) = LOWER($1) OR LOWER(username) = LOWER($1))`,
    [clean],
  );
  if (exact.rows.length === 1) return exact.rows[0];
  if (exact.rows.length > 1) return null;
  const partial = await pool.query(
    `SELECT id, display_name, username FROM users
     WHERE is_active AND display_name ILIKE '%' || $1 || '%' LIMIT 2`,
    [clean],
  );
  return partial.rows.length === 1 ? partial.rows[0] : null;
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
    
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения целей:', error);
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
    console.error('Ошибка получения плана:', error);
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
    console.error('Ошибка получения целей подчинённых:', error);
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
    
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, product_name, metric_type, target_value, current_value, 
          period_start, period_end, description, is_personal_monthly_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING *`,
      [
        userId, 
        String(product_name).trim(), 
        metric_type, 
        target,
        current,
        period_start || new Date(), 
        period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка создания цели:', error);
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
          period_start || new Date(),
          period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          description,
          managerId
        ]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Ошибка назначения плана:', error);
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
    
    const access = await targetAccess(userId, targetId);
    if (!access) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    if (!access.canView) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (target_value !== undefined && !access.canEditPlan) {
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
    
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Некорректный идентификатор' });
    console.error('Ошибка обновления цели:', error);
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
    console.error('Ошибка удаления:', error);
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
    
    if (target_id) {
      query += ` AND target_id = $${paramIndex++}`;
      params.push(target_id);
    }
    
    if (period === 'month') {
      query += ` AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'week') {
      query += ` AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'quarter') {
      query += ` AND transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE)`;
    }
    
    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения транзакций:', error);
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
        [userId, target_id || null, String(product_name).trim(), qty, sum, 
         transaction_date || new Date(), client_name, notes]
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
    console.error('Ошибка добавления транзакции:', error);
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
      fs.unlinkSync(file.path);
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
    
    let totalAmount = 0;
    if (suggestedMapping.amount) {
      for (const row of data) {
        const amount = parseFloat(String((row as any)[suggestedMapping.amount!] || '0').replace(/[^\d.-]/g, ''));
        if (!isNaN(amount)) totalAmount += amount;
      }
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
    console.error('Ошибка парсинга:', error);
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
        product_name: productName,
        quantity: mapping.quantity ? parseNumber(row[mapping.quantity]) || 1 : 1,
        amount: mapping.amount ? parseNumber(row[mapping.amount]) : 0,
        transaction_date: date,
        client_name: mapping.client_name ? String(row[mapping.client_name] || '').trim() || null : null,
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
    console.error('Ошибка импорта:', error);
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
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== СВОДКА =====================

// GET /api/kpi/sales/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { period = 'month' } = req.query;
    
    let dateFilter = '';
    if (period === 'week') {
      dateFilter = `AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'quarter') {
      dateFilter = `AND transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE)`;
    }
    
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
      targets: targetsResult.rows,
      personalTarget: personalTargetResult.rows[0] || null,
      topProducts: topProductsResult.rows,
      period,
    });
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;

// ===================== ДЛЯ РУКОВОДИТЕЛЕЙ =====================

// GET /api/kpi/sales/subordinates — список подчинённых с их KPI
router.get('/subordinates', async (req: Request, res: Response) => {
  try {
    // Выручка команды за выбранный на экране период (по умолчанию — месяц).
    const since = req.query.period === 'week'
      ? `CURRENT_DATE - INTERVAL '7 days'`
      : req.query.period === 'quarter'
        ? `DATE_TRUNC('quarter', CURRENT_DATE)`
        : `DATE_TRUNC('month', CURRENT_DATE)`;
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
    console.error('Ошибка получения подчинённых:', error);
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
        String(product_name).trim(),
        metric_type,
        num(target_value),
        num(current_value, 0),
        period_start || new Date(),
        period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description,
        managerId
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка назначения KPI:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// ===================== ОБНОВЛЕНИЕ KPI ИЗ ОТЧЕТА ПРОДАЖ =====================
router.post('/import-report', upload.single('file'), async (req: Request, res: Response) => {
  const requesterId: number = (req as any).userId;
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });

    const workbook = xlsx.readFile(file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const parseNum = parseRuNumber;
    const lastNum = (cells: string[]) => parseNum(cells[cells.length - 1]);

    let periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
    
    for (const r of rows) {
      const rowStr = (r as any[]).map((c) => String(c ?? '').trim()).join(' ');
      if (rowStr.toLowerCase().includes('период:')) {
        const match = rowStr.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
        if (match) {
          const [_, startStr, endStr] = match;
          const [d1, m1, y1] = startStr.split('.');
          const [d2, m2, y2] = endStr.split('.');
          periodStart = new Date(parseInt(y1), parseInt(m1) - 1, parseInt(d1));
          periodEnd = new Date(parseInt(y2), parseInt(m2) - 1, parseInt(d2), 23, 59, 59);
        }
        break;
      }
    }

    const managerNames = new Set<string>();
    let flag = false;
    for (const r of rows) {
      const cells = (r as any[]).map((c) => String(c ?? '').trim());
      const first = cells[0] || '';
      if (first.includes('По менеджерам')) { flag = true; continue; }
      if (flag && first !== '') { managerNames.add(first); continue; }
      if (first === '') flag = false;
    }

    const perManager: Record<string, { total: number; ep: number }> = {};
    let currentManager: string | null = null;
    
    for (const r of rows) {
      const cells = (r as any[]).map((c) => String(c ?? '').trim());
      const first = cells[0] || '';
      
      if (first !== '') {
        if (managerNames.has(first)) {
          currentManager = first;
          if (!perManager[first]) perManager[first] = { total: 0, ep: 0 };
          perManager[first].total += lastNum(cells);
        }
        continue;
      }
      
      if (currentManager && cells.some((c) => c.toLowerCase().includes('естьповод') || c.toLowerCase().includes('есть повод'))) {
        perManager[currentManager].ep += lastNum(cells);
      }
    }

    const results: any[] = [];
    for (const name of Object.keys(perManager)) {
      const total = Math.round(perManager[name].total * 100) / 100;
      const ep = Math.round(perManager[name].ep * 100) / 100;
      const noEp = Math.round((total - ep) * 100) / 100;

      const found = await findUserByName(name);
      if (!found) {
        results.push({ manager: name, total, ep, noEp, updated: false, error: 'Сотрудник не найден однозначно' });
        continue;
      }
      if (!(await isManagerOf(requesterId, found.id))) {
        results.push({ manager: name, total, ep, noEp, updated: false, error: 'Нет прав: не ваш подчинённый' });
        continue;
      }
      const userRes = { rows: [found] };
      const uid = found.id;

      const r1 = await pool.query(
        `UPDATE sales_targets 
         SET current_value = $1, updated_at = NOW() 
         WHERE user_id = $2 
           AND (product_name ILIKE '%без ЕП%' OR product_name ILIKE '%без еп%')
           AND period_start <= $3 AND period_end >= $3`,
        [noEp, uid, periodStart]
      );

      const r2 = await pool.query(
        `UPDATE sales_targets 
         SET current_value = $1, updated_at = NOW() 
         WHERE user_id = $2 
           AND (product_name ILIKE '%есть повод%' OR product_name ILIKE '%естьповод%')
           AND period_start <= $3 AND period_end >= $3`,
        [ep, uid, periodStart]
      );

      const updatedCount = (r1.rowCount || 0) + (r2.rowCount || 0);
      
      results.push({ 
        manager: name, 
        user: userRes.rows[0].display_name || userRes.rows[0].username,
        total, ep, noEp, 
        updated: updatedCount > 0,
        targetsUpdated: updatedCount
      });
    }

    try { fs.unlinkSync(file.path); } catch (e) {}
    res.json({ success: true, results });
  } catch (error) {
    console.error('Ошибка импорта отчёта:', error);
    res.status(500).json({ error: 'Ошибка обработки отчёта' });
  }
});


router.post('/import-kpi-plan', upload.single('file'), async (req: Request, res: Response) => {
  const requesterId: number = (req as any).userId;
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });

    const workbook = xlsx.readFile(file.path);
    const cellStr = (v: any) => String(v === undefined || v === null ? '' : v).trim();
    const parseNum = (v: any): number => {
      const s = cellStr(v);
      if (!s) return 0;
      if (/^да$/i.test(s)) return 1;
      return parseRuNumber(s);
    };

    const results: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      const rows: any[][] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows.length) continue;

      let employee = '';
      for (const r of rows.slice(0, 3)) {
        const v = cellStr(r[0]);
        if (v && !/\d{1,2}\/\d{2}/.test(v) && !/факт/i.test(v)) { employee = v; break; }
      }
      if (!employee) continue;

      const kpis: Record<string, { target: number; current: number }> = {};
      let cur = '';
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] as any[];
        const c0 = cellStr(r[0]);
        const c1 = cellStr(r[1]).toLowerCase();
        if (c0) {
          if (/^итого/i.test(c0)) { cur = ''; continue; }
          cur = c0;
          if (!kpis[cur]) kpis[cur] = { target: 0, current: 0 };
        }
        if (!cur) continue;
        if (c1.includes('план')) {
          kpis[cur].target = parseNum(r[2]);
        } else if (c1.includes('факт')) {
          if (!kpis[cur].target) kpis[cur].target = parseNum(r[2]);
          kpis[cur].current = parseNum(r[3]);
        } else if (!c1 && (cellStr(r[2]) || cellStr(r[3]))) {
          kpis[cur].target = parseNum(r[2]);
          kpis[cur].current = parseNum(r[3]);
        }
      }

      const found = await findUserByName(employee);
      if (!found) { results.push({ employee, error: 'сотрудник не найден однозначно' }); continue; }
      if (!(await isManagerOf(requesterId, found.id))) { results.push({ employee, error: 'нет прав: не ваш подчинённый' }); continue; }
      const userRes = { rows: [found] };
      const uid = found.id;

      let created = 0, updated = 0;
      for (const name of Object.keys(kpis)) {
        const t = kpis[name];
        const metric = /руб/i.test(name) ? 'amount' : 'quantity';
        const ex = await pool.query("SELECT id FROM sales_targets WHERE user_id = $1 AND product_name = $2 LIMIT 1", [uid, name]);
        if (ex.rows.length) {
          await pool.query("UPDATE sales_targets SET target_value = $1, current_value = $2, updated_at = NOW() WHERE id = $3", [t.target, t.current, ex.rows[0].id]);
          updated++;
        } else {
          await pool.query(
            "INSERT INTO sales_targets (user_id, product_name, metric_type, target_value, current_value, period_start, period_end, is_personal_monthly_target) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', FALSE)",
            [uid, name, metric, t.target, t.current]
          );
          created++;
        }
      }
      results.push({ employee, user: userRes.rows[0].display_name || userRes.rows[0].username, created, updated, kpis: Object.keys(kpis).length });
    }

    try { fs.unlinkSync(file.path); } catch (e) {}
    res.json({ success: true, results });
  } catch (error) {
    console.error('Ошибка импорта плана KPI:', error);
    res.status(500).json({ error: 'Ошибка обработки файла плана' });
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
  const period = req.query.period === 'week' ? '7 days' : req.query.period === 'quarter' ? '3 months' : '1 month';

  const [userResult, kpisResult, tasksResult, summaryResult, txResult] = await Promise.all([
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
              COALESCE(t.executor_deadline, t.hard_deadline) AS deadline,
              (t.status_new IN ('new','in_progress','rejected','overdue')
                AND COALESCE(t.executor_deadline, t.hard_deadline) < NOW()) AS is_overdue
       FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
       WHERE ta.user_id = $1 AND t.status_new <> 'archived'
       ORDER BY COALESCE(t.executor_deadline, t.hard_deadline) ASC NULLS LAST LIMIT 50`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount, COALESCE(SUM(quantity), 0) AS total_quantity,
              COUNT(*)::int AS total_transactions
       FROM sales_transactions WHERE user_id = $1 AND transaction_date >= CURRENT_DATE - $2::interval`,
      [userId, period],
    ),
    pool.query(
      `SELECT id, product_name, quantity, amount, transaction_date, client_name, notes
       FROM sales_transactions WHERE user_id = $1 AND transaction_date >= CURRENT_DATE - $2::interval
       ORDER BY transaction_date DESC, id DESC LIMIT 200`,
      [userId, period],
    ),
  ]);
  if (!userResult.rows.length) throw notFound('Сотрудник не найден');

  const kpis = kpisResult.rows.map((k) => ({
    ...k,
    progress: Math.min(100, Math.round((Number(k.current_value) / Math.max(Number(k.target_value) || 1, 1)) * 100)),
  }));
  const tasks = tasksResult.rows;
  res.json({
    user: userResult.rows[0],
    kpi: kpis[0] || null,
    kpis,
    tasks,
    taskStats: {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'done').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      overdue: tasks.filter((t) => t.is_overdue).length,
    },
    summary: summaryResult.rows[0],
    transactions: txResult.rows,
  });
});
