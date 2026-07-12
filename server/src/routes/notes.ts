import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// GET /api/notes - Получить заметки с фильтрами
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month, date, favorite } = req.query;
    
    let query = `SELECT id, user_id, title, content, is_favorite, 
                        TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                        created_at, updated_at 
                 FROM notes WHERE user_id = $1`;
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (month) {
      query += ` AND TO_CHAR(note_date, 'YYYY-MM') = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }
    
    if (date) {
      query += ` AND note_date = $${paramIndex}::date`;
      params.push(date);
      paramIndex++;
    }
    
    if (favorite === 'true') {
      query += ' AND is_favorite = TRUE';
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения заметок:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/notes/days-with-notes - Получить дни с заметками за месяц
router.get('/days-with-notes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Параметр month обязателен (формат: YYYY-MM)' });
    }
    
    const result = await pool.query(
      `SELECT TO_CHAR(note_date, 'YYYY-MM-DD') as note_date, COUNT(*) as note_count 
       FROM notes 
       WHERE user_id = $1 
         AND TO_CHAR(note_date, 'YYYY-MM') = $2
       GROUP BY note_date
       ORDER BY note_date`,
      [userId, month]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения дней с заметками:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/notes - Создать новую заметку
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title = '', content = '', note_date, is_favorite = false } = req.body;
    
    const dateToUse = note_date || new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      `INSERT INTO notes (user_id, title, content, note_date, is_favorite) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, user_id, title, content, is_favorite, 
                 TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                 created_at, updated_at`,
      [userId, title, content, dateToUse, is_favorite]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка создания заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/notes/:id - Обновить заметку
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const noteId = parseInt(req.params.id);
    const { title, content, is_favorite, note_date } = req.body;
    
    const checkResult = await pool.query(
      'SELECT user_id FROM notes WHERE id = $1',
      [noteId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    
    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Нет доступа к заметке' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    
    if (is_favorite !== undefined) {
      updates.push(`is_favorite = $${paramIndex++}`);
      values.push(is_favorite);
    }
    
    if (note_date !== undefined) {
      updates.push(`note_date = $${paramIndex++}::date`);
      values.push(note_date);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(noteId);
    
    const query = `
      UPDATE notes 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING id, user_id, title, content, is_favorite, 
                TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                created_at, updated_at
    `;
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка обновления заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/notes/:id - Удалить заметку
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const noteId = parseInt(req.params.id);
    
    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [noteId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
