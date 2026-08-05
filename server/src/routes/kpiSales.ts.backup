import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = Router();

const importsDir = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(importsDir)) {
  fs.mkdirSync(importsDir, { recursive: true });
}

const upload = multer({ dest: importsDir });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'mesnation',
});

// ===================== ЦЕЛИ ПРОДАЖ =====================

// GET /api/kpi/sales/targets — мои цели (товарные KPI)
router.get('/targets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await pool.query(
      `SELECT st.*, 
              ROUND((st.current_value / st.target_value * 100)::numeric, 1) as progress_percent
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
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
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

// POST /api/kpi/sales/targets — создать товарный KPI
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
    
    if (!target_value || target_value <= 0) {
      return res.status(400).json({ error: 'Целевое значение должно быть больше 0' });
    }
    
    if (!product_name) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, product_name, metric_type, target_value, current_value, 
          period_start, period_end, description, is_personal_monthly_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING *`,
      [
        userId, 
        product_name, 
        metric_type, 
        target_value, 
        current_value,
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

// POST /api/kpi/sales/targets/personal-monthly — назначить личный план (руководитель)
router.post('/targets/personal-monthly', async (req: Request, res: Response) => {
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
    
    if (!target_value || target_value <= 0) {
      return res.status(400).json({ error: 'Целевое значение должно быть больше 0' });
    }
    
    // TODO: Проверить, что managerId является руководителем user_id
    // (через role_tree)
    
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
        target_value,
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
});

// PATCH /api/kpi/sales/targets/:id — обновить цель
router.patch('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = parseInt(req.params.id);
    const { current_value, target_value, description } = req.body;
    
    const check = await pool.query(
      'SELECT user_id FROM sales_targets WHERE id = $1',
      [targetId]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    
    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (current_value !== undefined) {
      updates.push(`current_value = $${paramIndex++}`);
      values.push(current_value);
    }
    if (target_value !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      values.push(target_value);
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
  } catch (error) {
    console.error('Ошибка обновления цели:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/kpi/sales/targets/:id
router.delete('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = parseInt(req.params.id);
    
    const result = await pool.query(
      'DELETE FROM sales_targets WHERE id = $1 AND user_id = $2 RETURNING id',
      [targetId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    
    res.json({ success: true });
  } catch (error) {
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
    
    if (!product_name) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const txResult = await client.query(
        `INSERT INTO sales_transactions 
           (user_id, target_id, product_name, quantity, amount, transaction_date, client_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [userId, target_id || null, product_name, quantity, amount, 
         transaction_date || new Date(), client_name, notes]
      );
      
      if (target_id) {
        const targetCheck = await client.query(
          'SELECT metric_type FROM sales_targets WHERE id = $1',
          [target_id]
        );
        
        if (targetCheck.rows.length > 0) {
          const increment = targetCheck.rows[0].metric_type === 'amount' ? amount : quantity;
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
    
    const importCheck = await pool.query(
      'SELECT * FROM sales_imports WHERE id = $1 AND user_id = $2',
      [importId, userId]
    );
    
    if (importCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Импорт не найден' });
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
    
    const parseNumber = (val: any): number => {
      if (!val) return 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
      return isNaN(num) ? 0 : num;
    };
    
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
      
      transactions.push({
        product_name: productName,
        quantity: mapping.quantity ? parseNumber(row[mapping.quantity]) || 1 : 1,
        amount: mapping.amount ? parseNumber(row[mapping.amount]) : 0,
        transaction_date: mapping.transaction_date ? parseDate(row[mapping.transaction_date]) : new Date(),
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
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
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
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
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
