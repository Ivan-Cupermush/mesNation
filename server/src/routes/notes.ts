import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { validate } from '../lib/validate';

const router = Router();

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Месяц в формате ГГГГ-ММ');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');
const listQuery = z.object({ month: month.optional(), date: date.optional(), favorite: z.enum(['true', 'false']).optional() });
const noteSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().max(200000).optional(),
  note_date: date.optional(),
  is_favorite: z.boolean().optional(),
});

// GET /api/notes - Получить заметки с фильтрами
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month, date, favorite } = listQuery.parse(req.query);
    
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
    throw error;
  }
});

// GET /api/notes/days-with-notes - Получить дни с заметками за месяц
router.get(['/days-with-notes', '/days'], async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month } = listQuery.parse(req.query);
    
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
    throw error;
  }
});

// POST /api/notes - Создать новую заметку
router.post('/', validate(noteSchema), async (req: Request, res: Response) => {
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
    throw error;
  }
});

// PATCH /api/notes/:id - Обновить заметку
async function updateNote(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const noteId = Number(req.params.id);
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
    throw error;
  }
}
router.patch('/:id', validate(noteSchema), updateNote);
router.put('/:id', validate(noteSchema), updateNote);

// DELETE /api/notes/:id - Удалить заметку
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const noteId = Number(req.params.id);
    
    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [noteId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    
    res.json({ success: true });
  } catch (error) {
    throw error;
  }
});

// Совместимость с веб-клиентом.
router.get('/favorites', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, title, content, is_favorite, TO_CHAR(note_date, 'YYYY-MM-DD') AS note_date, created_at, updated_at
     FROM notes WHERE user_id = $1 AND is_favorite ORDER BY updated_at DESC`,
    [(req as any).userId],
  );
  res.json(rows);
});

export default router;
